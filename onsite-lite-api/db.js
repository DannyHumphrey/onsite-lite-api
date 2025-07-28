'use strict'

const sql = require('mssql')

let pool

async function init (config) {
  pool = new sql.ConnectionPool(config)
  await pool.connect()
  return pool
}

function getPool () {
  if (!pool) {
    throw new Error('Database pool not initialized')
  }
  return pool
}

async function query (text, params = {}) {
  const request = getPool().request()
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value)
  }
  const result = await request.query(text)
  return result
}

module.exports = { init, getPool, query }

