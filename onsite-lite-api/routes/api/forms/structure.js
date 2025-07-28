'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/structure', { preValidation: [fastify.authenticate] }, async function (request, reply) {
    return { message: 'OK' }
  })
}
