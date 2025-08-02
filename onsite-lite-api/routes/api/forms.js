'use strict'

const formService = require('../../services/formService')

module.exports = async function (fastify, opts) {
  fastify.get('/forms/structure', { preValidation: [fastify.authenticate] }, async function (request, reply) {
    const claim = request.user['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
    const roles = Array.isArray(claim) ? claim : claim ? [claim] : []
    const schemas = await formService.getLatestSchemasByRoles(roles, fastify.db)
    return schemas
  })

  fastify.post('/forms', { preValidation: [fastify.authenticate] }, async function (request, reply) {
    const { name, schema } = request.body || {}
    const result = await formService.createFormTypeAndSchema(name, schema, fastify.db)
    reply.code(201)
    return result
  })
}
