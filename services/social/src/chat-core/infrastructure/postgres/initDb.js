"use strict";

const fs = require("fs");
const path = require("path");
const { query } = require("./db");

async function initDb() {
  if (!process.env.DATABASE_URL) return;

  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await query(sql);
}

module.exports = { initDb };
