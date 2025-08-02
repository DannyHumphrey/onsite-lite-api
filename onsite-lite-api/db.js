'use strict'

const sql = require('mssql')

let pool

async function init (config) {
  const dbName = config.database

  if (dbName) {
    const adminConfig = { ...config, database: 'master' }
    const adminPool = new sql.ConnectionPool(adminConfig)
    await adminPool.connect()
    const request = adminPool.request().input('dbName', sql.NVarChar, dbName)
    await request.query(`
      IF DB_ID(@dbName) IS NULL
      BEGIN
        DECLARE @sql NVARCHAR(MAX) = 'CREATE DATABASE [' + REPLACE(@dbName, ']', ']]') + ']'
        EXEC (@sql)
      END
    `)
    await adminPool.close()
  }

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

