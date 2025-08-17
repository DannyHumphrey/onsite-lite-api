// plugins/mssql.js
'use strict'

const fp = require('fastify-plugin')
const db = require('../db')
const { ensureTables } = require('../ensure-tables')

module.exports = fp(async function (fastify) {
  if (process.env.SKIP_DB === 'true') {
    fastify.log.warn('Database connection skipped')
    // Expose a pool-like stub so code that calls .request() fails clearly
    fastify.decorate('db', { request: () => { throw new Error('Database connection skipped') } })
    return
  }

  const config = {
    user: fastify.config.DB_USER,
    password: fastify.config.DB_PASS,
    server: fastify.config.DB_HOST,
    database: fastify.config.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  }

  await db.init(config)
  await ensureTables() // uses your db.query internally; no change needed

  const pool = db.getPool()       // this is an mssql.ConnectionPool
  fastify.decorate('db', pool)    // <-- IMPORTANT: now fastify.db.request() exists
  fastify.decorate('dbQuery', db.query) // optional convenience

  fastify.addHook('onClose', async () => {
    if (pool.connected) await pool.close()
  })
})
