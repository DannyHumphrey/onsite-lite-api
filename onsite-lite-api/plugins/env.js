'use strict'

const fp = require('fastify-plugin')
const env = require('@fastify/env')

const schema = {
  type: 'object',
  required: ['NODE_ENV', 'JWT_SECRET'],
  properties: {
    NODE_ENV: { type: 'string', enum: ['dev', 'qa', 'uat', 'staging', 'live'] },
    JWT_SECRET: { type: 'string' }
  }
}

const options = {
  confKey: 'config',
  schema,
  dotenv: true
}

module.exports = fp(async function (fastify, opts) {
  await fastify.register(env, options)
})
