'use strict'

const fp = require('fastify-plugin')
const db = require('../db')

module.exports = fp(async function (fastify, opts) {
  if (process.env.SKIP_DB === 'true') {
    fastify.log.warn('Database connection skipped')
    fastify.decorate('db', {
      pool: null,
      query: async () => { throw new Error('Database connection skipped') }
    })
    return
  }
  const config = {
    user: fastify.config.DB_USER,
    password: fastify.config.DB_PASS,
    server: fastify.config.DB_HOST,
    database: fastify.config.DB_NAME,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }

  await db.init(config)

  fastify.decorate('db', {
    pool: db.getPool(),
    query: db.query
  })

  fastify.addHook('onClose', async () => {
    const pool = db.getPool()
    if (pool.connected) {
      await pool.close()
    }
  })
})
