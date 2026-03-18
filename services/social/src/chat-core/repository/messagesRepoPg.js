'use strict';

function normalizeLimit(limit, fallback = 50, max = 100) {
  const parsed = Number(limit);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function encodeCursor({ created_at, id }) {
  return Buffer.from(
    JSON.stringify({
      created_at,
      id,
    }),
    'utf8'
  ).toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));

    if (!parsed?.created_at || !parsed?.id) {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
}

function normalizeAttachmentSizeBytes(attachmentSizeBytes) {
  if (
    attachmentSizeBytes === undefined ||
    attachmentSizeBytes === null ||
    attachmentSizeBytes === ''
  ) {
    return null;
  }

  const parsed = Number(attachmentSizeBytes);

  if (!Number.isInteger(parsed) || parsed < 0) {
    const error = new Error('attachment_size_bytes_invalid');
    error.statusCode = 400;
    error.code = 'attachment_size_bytes_invalid';
    throw error;
  }

  return parsed;
}

function normalizeAttachmentMetadata(attachmentMetadata) {
  if (attachmentMetadata === undefined || attachmentMetadata === null) {
    return null;
  }

  return JSON.stringify(attachmentMetadata);
}

async function createMessage(db, {
  messageId,
  conversationId,
  spaceId,
  senderUserId,
  messageType,
  bodyText,
  clientMessageId,
  attachmentUrl,
  attachmentType,
  attachmentSizeBytes,
  attachmentMetadata,
}) {
  const normalizedAttachmentSizeBytes = normalizeAttachmentSizeBytes(attachmentSizeBytes);
  const normalizedAttachmentMetadata = normalizeAttachmentMetadata(attachmentMetadata);

  console.log('createMessage params', {
    messageId,
    conversationId,
    spaceId,
    senderUserId,
    messageType,
    bodyText,
    clientMessageId,
    attachmentUrl,
    attachmentType,
    normalizedAttachmentSizeBytes,
    normalizedAttachmentMetadata,
  });

  const result = await db.query(
    `
      INSERT INTO messages (
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        attachment_url,
        attachment_type,
        attachment_size_bytes,
        attachment_metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::text,
        $6::text,
        $7::text,
        $8::text,
        $9::text,
        $10::integer,
        $11::jsonb
      )
      ON CONFLICT (conversation_id, client_message_id)
      DO UPDATE
        SET client_message_id = EXCLUDED.client_message_id
      RETURNING
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        attachment_url,
        attachment_type,
        attachment_size_bytes,
        attachment_metadata,
        created_at,
        (xmax = 0) AS inserted
    `,
    [
      messageId,
      conversationId,
      spaceId,
      senderUserId,
      messageType,
      bodyText ?? null,
      clientMessageId,
      attachmentUrl ?? null,
      attachmentType ?? null,
      normalizedAttachmentSizeBytes,
      normalizedAttachmentMetadata,
    ]
  );

  return result.rows[0];
}

async function listMessages(db, {
  conversationId,
  limit,
  cursor,
}) {
  const safeLimit = normalizeLimit(limit, 50, 100);
  const decodedCursor = decodeCursor(cursor);

  const params = [conversationId];
  let cursorClause = '';
  let limitParamIndex = 2;

  if (decodedCursor) {
    params.push(decodedCursor.created_at, decodedCursor.id);
    cursorClause = `
      AND (created_at, id) > ($2::timestamptz, $3::uuid)
    `;
    limitParamIndex = 4;
  }

  params.push(safeLimit + 1);

  const result = await db.query(
    `
      SELECT
        id,
        conversation_id,
        space_id,
        sender_user_id,
        message_type,
        body_text,
        client_message_id,
        attachment_url,
        attachment_type,
        attachment_size_bytes,
        attachment_metadata,
        created_at
      FROM messages
      WHERE conversation_id = $1::uuid
        ${cursorClause}
      ORDER BY created_at ASC, id ASC
      LIMIT $${limitParamIndex}
    `,
    params
  );

  const hasMore = result.rows.length > safeLimit;
  const items = hasMore ? result.rows.slice(0, safeLimit) : result.rows;
  const lastItem = items.length > 0 ? items[items.length - 1] : null;

  return {
    items,
    nextCursor: hasMore && lastItem
      ? encodeCursor({
          created_at: lastItem.created_at,
          id: lastItem.id,
        })
      : null,
  };
}

async function getLastMessageForConversationIds(db, { conversationIds }) {
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.id,
        m.sender_user_id,
        m.message_type,
        m.body_text,
        m.client_message_id,
        m.attachment_url,
        m.attachment_type,
        m.attachment_size_bytes,
        m.attachment_metadata,
        m.created_at
      FROM messages m
      WHERE m.conversation_id = ANY($1::uuid[])
      ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
    `,
    [conversationIds]
  );

  return new Map(result.rows.map((row) => [row.conversation_id, row]));
}

module.exports = {
  createMessage,
  listMessages,
  getLastMessageForConversationIds,
  encodeCursor,
  decodeCursor,
};