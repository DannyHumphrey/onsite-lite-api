const formRepository = require('../repositories/formRepository')

// Filter by workflow rules: who can start a form?
function canUserStartFromWorkflow(workflow, roles) {
  if (!workflow) return true // if no workflow, default allow
  const roleSet = new Set(roles)

  // 1) If explicit creatorRoles exists
  if (Array.isArray(workflow.creatorRoles) && workflow.creatorRoles.length) {
    return workflow.creatorRoles.some(r => roleSet.has(r))
  }

  // 2) Otherwise, derive from transitions out of the initial state
  try {
    const states = Array.isArray(workflow.states) ? workflow.states : []
    const initial = states.find(s => s.initial) || states[0]
    if (!initial) return true

    const transitions = Array.isArray(workflow.transitions) ? workflow.transitions : []
    const out = transitions.filter(t => (t.from === initial.key) || (!t.from && initial.initial))
    if (!out.length) return true

    return out.some(t => Array.isArray(t.roles) && t.roles.some(r => roleSet.has(r)))
  } catch {
    return true
  }
}

async function getCreatableTemplates(tenantId, roles, db) {
  const rows = await formRepository.getLatestDefinitionsForTenant(tenantId, db)
  // Parse JSON & filter by workflow roles
  const defs = rows.map(r => {
    let schema = null, ui = null, workflow = null
    try { schema = JSON.parse(r.SchemaJson) } catch {}
    try { ui = r.UiJson ? JSON.parse(r.UiJson) : null } catch {}
    try { workflow = r.WorkflowJson ? JSON.parse(r.WorkflowJson) : null } catch {}

    return {
      formDefinitionId: r.FormDefinitionId,
      formType: r.FormType,
      name: r.Name,
      formVersion: r.FormVersion,
      schema,
      ui,
      workflow
    }
  })

  return defs.filter(d => canUserStartFromWorkflow(d.workflow, roles))
}

async function createFormDefinition(input, db, explicitVersion) {
  // Validate basics
  if (!input.formType || !input.name) {
    throw new Error('formType and name are required')
  }

  // Ensure JSON
  const schemaJson = JSON.stringify(input.schemaJson ?? {})
  const uiJson = input.uiJson != null ? JSON.stringify(input.uiJson) : null
  const workflowJson = input.workflowJson != null
    ? JSON.stringify(input.workflowJson)
    // Minimal default workflow: Draft -> Submitted by Reporter
    : JSON.stringify({
        states: [{ key: 'Draft', initial: true }, { key: 'Submitted' }],
        transitions: [{ key: 'submit', from: 'Draft', to: 'Submitted', roles: ['Reporter'], requiresSections: ['reporter'] }],
        sections: [{ key: 'reporter', rolesCanEdit: ['Reporter'], visibleIn: ['Draft', 'Submitted'] }]
      })

  // Determine version: explicit or next
  const version = explicitVersion
    ? explicitVersion
    : await formRepository.nextVersionFor( input.tenantId, input.formType, db )

  const created = await formRepository.insertFormDefinition({
    tenantId: input.tenantId,
    createdByUserId: input.createdByUserId,
    formType: input.formType,
    formVersion: version,
    name: input.name,
    schemaJson,
    uiJson,
    workflowJson
  }, db)

  // Return the newly created row (id + echo fields)
  return created
}

module.exports = { getCreatableTemplates, createFormDefinition }