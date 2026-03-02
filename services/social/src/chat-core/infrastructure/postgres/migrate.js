"use strict";

const fs = require("fs");
const path = require("path");
const { query } = require("./db");

async function ensureMigrationsTable() {
  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

function listMigrationFiles() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  return files.map((f) => ({
    id: f.replace(/\.sql$/, ""),
    file: f,
    fullPath: path.join(dir, f),
  }));
}

async function appliedSet() {
  const r = await query(`select id from schema_migrations order by id asc;`);
  return new Set(r.rows.map((x) => x.id));
}

async function applyOne(mig) {
  const sql = fs.readFileSync(mig.fullPath, "utf8");
  await query("begin");
  try {
    if (sql.trim()) await query(sql);
    await query(`insert into schema_migrations(id) values($1)`, [mig.id]);
    await query("commit");
  } catch (e) {
    await query("rollback");
    throw e;
  }
}

async function migrate() {
  await ensureMigrationsTable();

  const files = listMigrationFiles();
  const done = await appliedSet();

  const pending = files.filter((m) => !done.has(m.id));
  if (pending.length === 0) return { ok: true, applied: [] };

  const applied = [];
  for (const m of pending) {
    await applyOne(m);
    applied.push(m.id);
  }
  return { ok: true, applied };
}

module.exports = { migrate };
