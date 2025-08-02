'use strict'

const fp = require('fastify-plugin')
const env = require('@fastify/env')

const schema = {
  type: 'object',
  required: ['NODE_ENV', 'JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'],
  properties: {
    // Allow the default "production" value used by many hosting providers
    NODE_ENV: { type: 'string', enum: ['dev', 'qa', 'uat', 'staging', 'live', 'production'] },
    JWT_SECRET: { type: 'string' },
    DB_HOST: { type: 'string' },
    DB_USER: { type: 'string' },
    DB_PASS: { type: 'string' },
    DB_NAME: { type: 'string' }
  }
}

const path = require('node:path')

const options = {
  confKey: 'config',
  schema,
  dotenv: {
    path: path.join(__dirname, `..`, `.env.${process.env.NODE_ENV || 'dev'}`)
  }
}

module.exports = fp(async function (fastify, opts) {
  await fastify.register(env, options)
})
