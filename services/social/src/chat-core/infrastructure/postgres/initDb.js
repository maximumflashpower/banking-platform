"use strict";

const { migrate } = require("./migrate");

async function initDb() {
  const res = await migrate();
  if (res.applied && res.applied.length) {
    console.log(JSON.stringify({ msg: "db_migrated", applied: res.applied }));
  }
  return res;
}

module.exports = { initDb };
