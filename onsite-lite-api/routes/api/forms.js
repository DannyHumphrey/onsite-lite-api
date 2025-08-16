'use strict'

const formService = require('../../services/formService')
const authHelpers = require('../../services/authHelpers')



module.exports = async function (fastify) {
  // Return latest form templates the user is allowed to START (create instances of)
  fastify.get('/formTemplates', { preValidation: [fastify.authenticate] }, async function (request, reply) {
    const roles = authHelpers.getRoles(request.user)
    const tenantId = authHelpers.getTenantId(request.user)

    const defs = await formService.getCreatableTemplates(tenantId, roles, fastify.db)

    // Keep response shape close to your current client expectations
    return defs.map(d => ({
      formDefinitionId: d.formDefinitionId,
      formType: d.formType,
      name: d.name,
      version: d.formVersion,
      schema: d.schema,        // parsed JSON
      ui: d.ui ?? null,        // parsed JSON or null
      workflow: d.workflow     // parsed JSON (if you want it client-side)
    }))
  })

  // Create (or version) a form definition
  // Body: { formType, name, schema, ui?, workflow?, formVersion? }
  fastify.post('/forms', {
    preValidation: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['formType', 'name', 'schema'],
        properties: {
          formType: { type: 'string', minLength: 1, maxLength: 64 },
          name: { type: 'string', minLength: 1, maxLength: 256 },
          schema: { type: ['object', 'array'] },       // JSON Schema
          ui: { type: ['object', 'array', 'null'] },
          workflow: { type: ['object', 'array', 'null'] },
          formVersion: { type: 'integer', minimum: 1 }
        }
      }
    }
  }, async function (request, reply) {
    const tenantId = authHelpers.getTenantId(request.user)
    const createdByUserId = authHelpers.getUserId(request.user)

    const { formType, name, schema, ui = null, workflow = null, formVersion } = request.body || {}

    const created = await formService.createFormDefinition({
      tenantId,
      createdByUserId,
      formType,
      name,
      schemaJson: schema,
      uiJson: ui,
      workflowJson: workflow
      // version is optional; service will auto-increment if omitted
    }, fastify.db, formVersion)

    reply.code(201)
    return created
  })
}