"use strict";

const fs = require("fs");
const path = require("path");
const { query } = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureTable() {
  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedSet() {
  const r = await query("select id from schema_migrations order by id asc");
  return new Set(r.rows.map((x) => x.id));
}

async function applyOne(id, sql) {
  await query("begin");
  try {
    await query(sql);
    await query("insert into schema_migrations(id) values($1)", [id]);
    await query("commit");
  } catch (e) {
    await query("rollback");
    throw e;
  }
}

async function runMigrations() {
  await ensureTable();
  const done = await appliedSet();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = [];

  for (const f of files) {
    const id = f.replace(".sql", "");
    if (done.has(id)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    await applyOne(id, sql);
    applied.push(id);
  }

  return applied;
}

module.exports = { runMigrations };
