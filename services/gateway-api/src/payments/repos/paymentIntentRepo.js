'use strict';

const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const connectionString =
  process.env.FINANCIAL_DATABASE_URL ||
  process.env.FINANCIAL_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.warn('[payments] financial database connection string is not configured');
}

let pool = null;
let schemaCache = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

function makeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function hasColumn(columns, name) {
  return Array.isArray(columns) && columns.includes(name);
}

async function withClient(fn) {
  if (!connectionString) {
    throw makeError(503, 'PAYMENTS_DOMAIN_UNAVAILABLE', 'payments domain unavailable');
  }

  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function loadSchema(client) {
  if (schemaCache) return schemaCache;

  const tables = ['payment_intents', 'payment_intent_states'];

  const result = await client.query(
    `
      SELECT
        c.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = ANY($1::text[])
      ORDER BY c.table_name, c.ordinal_position
    `,
    [tables]
  );

  const schema = {
    payment_intents: { columns: [], types: {} },
    payment_intent_states: { columns: [], types: {} },
  };

  for (const row of result.rows) {
    if (!schema[row.table_name]) {
      schema[row.table_name] = { columns: [], types: {} };
    }
    schema[row.table_name].columns.push(row.column_name);
    schema[row.table_name].types[row.column_name] = row.data_type;
  }

  schemaCache = schema;
  return schemaCache;
}

function isUuidColumn(schema, tableName, columnName) {
  return schema?.[tableName]?.types?.[columnName] === 'uuid';
}

function buildLatestStateSql(schema, intentIdExpr, stateTableAlias) {
  const stateColumns = schema.payment_intent_states.columns || [];

  const stateValueColumn = hasColumn(stateColumns, 'state')
    ? 'state'
    : hasColumn(stateColumns, 'status')
      ? 'status'
      : null;

  const stateIntentFk = hasColumn(stateColumns, 'payment_intent_id')
    ? 'payment_intent_id'
    : hasColumn(stateColumns, 'intent_id')
      ? 'intent_id'
      : null;

  if (!stateValueColumn || !stateIntentFk) {
    return `'created'`;
  }

  const orderColumn =
    hasColumn(stateColumns, 'created_at') ? `${stateTableAlias}.created_at DESC` :
    hasColumn(stateColumns, 'updated_at') ? `${stateTableAlias}.updated_at DESC` :
    hasColumn(stateColumns, 'id') ? `${stateTableAlias}.id DESC` :
    `${stateTableAlias}.${stateValueColumn} ASC`;

  return `
    COALESCE(
      (
        SELECT ${stateTableAlias}.${stateValueColumn}
        FROM payment_intent_states ${stateTableAlias}
        WHERE ${stateTableAlias}.${stateIntentFk} = ${intentIdExpr}
        ORDER BY ${orderColumn}
        LIMIT 1
      ),
      'created'
    )
  `;
}

function buildIntentSelect(schema, intentAlias = null) {
  const intentColumns = schema.payment_intents.columns || [];
  const p = intentAlias ? `${intentAlias}.` : '';

  const externalIdExpr = hasColumn(intentColumns, 'reference_id')
    ? `${p}reference_id`
    : hasColumn(intentColumns, 'id')
      ? `${p}id::text`
      : 'NULL::text';

  const internalIdExpr = hasColumn(intentColumns, 'id')
    ? `${p}id::text`
    : hasColumn(intentColumns, 'reference_id')
      ? `${p}reference_id`
      : 'NULL::text';

  const userIdExpr = hasColumn(intentColumns, 'user_id')
    ? `${p}user_id::text`
    : 'NULL::text';

  const amountExpr = hasColumn(intentColumns, 'amount')
    ? `${p}amount`
    : 'NULL::numeric';

  const currencyExpr = hasColumn(intentColumns, 'currency')
    ? `${p}currency`
    : 'NULL::text';

  const referenceTypeExpr = hasColumn(intentColumns, 'reference_type')
    ? `${p}reference_type`
    : 'NULL::text';

  const referenceIdExpr = hasColumn(intentColumns, 'reference_id')
    ? `${p}reference_id`
    : hasColumn(intentColumns, 'id')
      ? `${p}id::text`
      : 'NULL::text';

  const createdAtExpr = hasColumn(intentColumns, 'created_at')
    ? `${p}created_at`
    : 'NULL::timestamptz';

  const updatedAtExpr = hasColumn(intentColumns, 'updated_at')
    ? `${p}updated_at`
    : hasColumn(intentColumns, 'modified_at')
      ? `${p}modified_at`
      : hasColumn(intentColumns, 'created_at')
        ? `${p}created_at`
        : 'NULL::timestamptz';

  const statusExpr =
    hasColumn(intentColumns, 'state') ? `${p}state` :
    hasColumn(intentColumns, 'status') ? `${p}status` :
    buildLatestStateSql(schema, `${p}id`, 'pis');

  return `
    ${externalIdExpr} AS id,
    ${internalIdExpr} AS internal_id,
    ${userIdExpr} AS user_id,
    ${amountExpr} AS amount,
    ${currencyExpr} AS currency,
    ${referenceTypeExpr} AS reference_type,
    ${referenceIdExpr} AS reference_id,
    ${statusExpr} AS state,
    ${createdAtExpr} AS created_at,
    ${updatedAtExpr} AS updated_at
  `;
}

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    internal_id: row.internal_id || null,
    user_id: row.user_id || null,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency || null,
    reference_type: row.reference_type || null,
    reference_id: row.reference_id || null,
    status: row.state || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function findById(id) {
  return withClient(async (client) => {
    const schema = await loadSchema(client);
    const intentColumns = schema.payment_intents.columns || [];
    const selectClause = buildIntentSelect(schema, 'pi');

    let whereClause = null;

    if (hasColumn(intentColumns, 'reference_id')) {
      whereClause = 'pi.reference_id = $1';
    } else if (hasColumn(intentColumns, 'id')) {
      if (isUuidColumn(schema, 'payment_intents', 'id')) {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(String(id))) {
          return null;
        }
      }
      whereClause = 'pi.id = $1';
    }

    if (!whereClause) {
      throw makeError(500, 'PAYMENT_INTENTS_SCHEMA_INVALID', 'payment_intents table missing id/reference_id');
    }

    const result = await client.query(
      `
        SELECT
          ${selectClause}
        FROM payment_intents pi
        WHERE ${whereClause}
        LIMIT 1
      `,
      [id]
    );

    return normalizeRow(result.rows[0] || null);
  });
}

async function findByReference(referenceType, referenceId) {
  return withClient(async (client) => {
    const schema = await loadSchema(client);
    const intentColumns = schema.payment_intents.columns || [];
    const selectClause = buildIntentSelect(schema, 'pi');

    if (hasColumn(intentColumns, 'reference_type') && hasColumn(intentColumns, 'reference_id')) {
      const result = await client.query(
        `
          SELECT
            ${selectClause}
          FROM payment_intents pi
          WHERE pi.reference_type = $1
            AND pi.reference_id = $2
          LIMIT 1
        `,
        [referenceType, referenceId]
      );

      return normalizeRow(result.rows[0] || null);
    }

    if (hasColumn(intentColumns, 'reference_id')) {
      const result = await client.query(
        `
          SELECT
            ${selectClause}
          FROM payment_intents pi
          WHERE pi.reference_id = $1
          LIMIT 1
        `,
        [referenceId]
      );

      return normalizeRow(result.rows[0] || null);
    }

    return null;
  });
}

async function insertPaymentIntent(input) {
  return withClient(async (client) => {
    const schema = await loadSchema(client);
    const intentColumns = schema.payment_intents.columns || [];
    const stateColumns = schema.payment_intent_states.columns || [];

    await client.query('BEGIN');

    try {
      const internalId = hasColumn(intentColumns, 'id') ? randomUUID() : input.reference_id;

      const insertColumns = [];
      const valueTokens = [];
      const params = [];

      function pushValue(column, value) {
        insertColumns.push(column);
        params.push(value);
        valueTokens.push(`$${params.length}`);
      }

      if (hasColumn(intentColumns, 'id')) {
        pushValue('id', internalId);
      }

      if (hasColumn(intentColumns, 'user_id') && input.user_id) {
        pushValue('user_id', input.user_id);
      }

      if (hasColumn(intentColumns, 'amount')) {
        pushValue('amount', input.amount);
      }

      if (hasColumn(intentColumns, 'currency')) {
        pushValue('currency', input.currency);
      }

      if (hasColumn(intentColumns, 'reference_type')) {
        pushValue('reference_type', input.reference_type);
      }

      if (hasColumn(intentColumns, 'reference_id')) {
        pushValue('reference_id', input.reference_id);
      }

      if (hasColumn(intentColumns, 'state')) {
        pushValue('state', 'created');
      } else if (hasColumn(intentColumns, 'status')) {
        pushValue('status', 'created');
      }

      if (insertColumns.length === 0) {
        throw makeError(500, 'PAYMENT_INTENTS_SCHEMA_INVALID', 'payment_intents table has no writable columns');
      }

      await client.query(
        `
          INSERT INTO payment_intents (
            ${insertColumns.join(', ')}
          )
          VALUES (
            ${valueTokens.join(', ')}
          )
        `,
        params
      );

      const stateValueColumn = hasColumn(stateColumns, 'state')
        ? 'state'
        : hasColumn(stateColumns, 'status')
          ? 'status'
          : null;

      const stateIntentFk = hasColumn(stateColumns, 'payment_intent_id')
        ? 'payment_intent_id'
        : hasColumn(stateColumns, 'intent_id')
          ? 'intent_id'
          : null;

      if (stateValueColumn && stateIntentFk && internalId) {
        await client.query(
          `
            INSERT INTO payment_intent_states (
              ${stateIntentFk},
              ${stateValueColumn}
            )
            VALUES ($1, $2)
          `,
          [internalId, 'created']
        );
      }

      const selectClause = buildIntentSelect(schema, 'pi');
      const idWhere = hasColumn(intentColumns, 'id')
        ? 'pi.id = $1'
        : hasColumn(intentColumns, 'reference_id')
          ? 'pi.reference_id = $1'
          : null;

      if (!idWhere) {
        throw makeError(500, 'PAYMENT_INTENTS_SCHEMA_INVALID', 'payment_intents table missing id/reference_id');
      }

      const readBackValue = hasColumn(intentColumns, 'id') ? internalId : input.reference_id;

      const createdResult = await client.query(
        `
          SELECT
            ${selectClause}
          FROM payment_intents pi
          WHERE ${idWhere}
          LIMIT 1
        `,
        [readBackValue]
      );

      await client.query('COMMIT');
      return normalizeRow(createdResult.rows[0] || null);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function updateState(id, nextState) {
  return withClient(async (client) => {
    const schema = await loadSchema(client);
    const intentColumns = schema.payment_intents.columns || [];
    const stateColumns = schema.payment_intent_states.columns || [];
    const selectClause = buildIntentSelect(schema, 'pi');

    await client.query('BEGIN');

    try {
      let current = null;

      if (hasColumn(intentColumns, 'reference_id')) {
        const result = await client.query(
          `
            SELECT
              ${selectClause}
            FROM payment_intents pi
            WHERE pi.reference_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [id]
        );
        current = normalizeRow(result.rows[0] || null);
      } else if (hasColumn(intentColumns, 'id')) {
        if (isUuidColumn(schema, 'payment_intents', 'id')) {
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          if (!uuidRegex.test(String(id))) {
            current = null;
          } else {
            const result = await client.query(
              `
                SELECT
                  ${selectClause}
                FROM payment_intents pi
                WHERE pi.id = $1
                LIMIT 1
                FOR UPDATE
              `,
              [id]
            );
            current = normalizeRow(result.rows[0] || null);
          }
        } else {
          const result = await client.query(
            `
              SELECT
                ${selectClause}
              FROM payment_intents pi
              WHERE pi.id = $1
              LIMIT 1
              FOR UPDATE
            `,
            [id]
          );
          current = normalizeRow(result.rows[0] || null);
        }
      }

      if (!current) {
        throw makeError(404, 'PAYMENT_INTENT_NOT_FOUND', 'payment intent not found');
      }

      if (current.status === nextState) {
        await client.query('COMMIT');
        return current;
      }

      if (current.status !== 'created') {
        throw makeError(
          409,
          'PAYMENT_INTENT_INVALID_STATE',
          `cannot transition payment intent from ${current.status} to ${nextState}`
        );
      }

      const stateValueColumn = hasColumn(stateColumns, 'state')
        ? 'state'
        : hasColumn(stateColumns, 'status')
          ? 'status'
          : null;

      const stateIntentFk = hasColumn(stateColumns, 'payment_intent_id')
        ? 'payment_intent_id'
        : hasColumn(stateColumns, 'intent_id')
          ? 'intent_id'
          : null;

      if (!stateValueColumn || !stateIntentFk) {
        throw makeError(
          500,
          'PAYMENT_INTENTS_SCHEMA_INVALID',
          'payment_intent_states table missing payment_intent_id/intent_id or state/status'
        );
      }

      await client.query(
        `
          INSERT INTO payment_intent_states (
            ${stateIntentFk},
            ${stateValueColumn}
          )
          VALUES ($1, $2)
        `,
        [current.internal_id, nextState]
      );

      if (hasColumn(intentColumns, 'updated_at') && hasColumn(intentColumns, 'id')) {
        await client.query(
          `UPDATE payment_intents SET updated_at = NOW() WHERE id = $1`,
          [current.internal_id]
        );
      } else if (hasColumn(intentColumns, 'modified_at') && hasColumn(intentColumns, 'id')) {
        await client.query(
          `UPDATE payment_intents SET modified_at = NOW() WHERE id = $1`,
          [current.internal_id]
        );
      }

      const refreshedResult = await client.query(
        `
          SELECT
            ${selectClause}
          FROM payment_intents pi
          WHERE pi.id = $1
          LIMIT 1
        `,
        [current.internal_id]
      );

      await client.query('COMMIT');
      return normalizeRow(refreshedResult.rows[0] || null);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

module.exports = {
  findById,
  findByReference,
  insertPaymentIntent,
  updateState,
};