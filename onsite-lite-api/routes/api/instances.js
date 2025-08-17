'use strict'

const instanceService = require('../../services/instancesService')
const authHelpers = require('../../services/authHelpers')

module.exports = async function (fastify) {
  // Create instance
  fastify.post('/form-instances', {
    preValidation: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['formType', 'clientGeneratedId'],
        properties: {
          formType: { type: 'string', minLength: 1, maxLength: 64 },
          formVersion: { type: 'integer', minimum: 1 },
          clientGeneratedId: { type: 'string', format: 'uuid' },
          initialData: { type: ['object', 'array', 'null'] }
        }
      }
    }
  }, async (req, reply) => {
    const ctx = {
      tenantId: authHelpers.getTenantId(req.user),
      userId: authHelpers.getUserId(req.user),
      roles: authHelpers.getRoles(req.user)
    }
    const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : null
    const existing = await instanceService.findByClientGeneratedId(req.body.clientGeneratedId, ctx, fastify.db)
    if (existing) {
      reply.header('ETag', existing.etag).code(200)
      return existing
    }
    const created = await instanceService.createInstance({
      formType: req.body.formType,
      formVersion: req.body.formVersion,
      clientGeneratedId: req.body.clientGeneratedId,
      initialData: req.body.initialData ?? {},
      idempotencyKey
    }, ctx, fastify.db)

    reply
      .header('ETag', created.etag)
      .code(201)
    return created
  })

  // Read instance
  fastify.get('/form-instances/:id', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const result = await instanceService.getInstance(Number(req.params.id), ctx, fastify.db)
    reply.header('ETag', result.etag)
    return result
  })

  // Save section (partial update via JSON Patch)
  fastify.post('/form-instances/:id/sections/:sectionKey', {
    preValidation: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['patch'],
        properties: { patch: { type: 'array' } } // RFC6902 ops
      }
    }
  }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const id = Number(req.params.id)
    const sectionKey = String(req.params.sectionKey)
    const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : null
    const ifMatch = req.headers['if-match'] ? String(req.headers['if-match']) : null

    const updated = await instanceService.saveSection({
      id, sectionKey, patch: req.body.patch, idempotencyKey, ifMatch
    }, ctx, fastify.db)

    reply.header('ETag', updated.etag)
    return updated
  })

  // Transition
  fastify.post('/form-instances/:id/transitions', {
    preValidation: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['transitionKey'],
        properties: { transitionKey: { type: 'string', minLength: 1 } }
      }
    }
  }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const id = Number(req.params.id)
    const ifMatch = req.headers['if-match'] ? String(req.headers['if-match']) : null
    const result = await instanceService.transition({ id, transitionKey: req.body.transitionKey, ifMatch }, ctx, fastify.db)

    reply.header('ETag', result.etag)
    return result
  })

  // Tasks
  fastify.get('/tasks', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const mine = String(req.query.mine || 'false').toLowerCase() === 'true'
    const state = req.query.state || 'open' // open|done|all
    return instanceService.listTasks({ mine, state }, ctx, fastify.db)
  })

  fastify.post('/tasks/:taskId/assign', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const taskId = Number(req.params.taskId)
    const toUserId = req.body?.assignedToUserId ? Number(req.body.assignedToUserId) : ctx.userId
    return instanceService.assignTask({ taskId, assignedToUserId: toUserId }, ctx, fastify.db)
  })

  fastify.post('/tasks/:taskId/complete', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const ctx = { tenantId: authHelpers.getTenantId(req.user), userId: authHelpers.getUserId(req.user), roles: authHelpers.getRoles(req.user) }
    const taskId = Number(req.params.taskId)
    return instanceService.completeTask({ taskId }, ctx, fastify.db)
  })
}
