const repo = require('../repositories/instanceRepository')
const crypto = require('crypto')
const jsonpatch = require('fast-json-patch')
const Ajv = require('ajv')                   
const ajv = new Ajv({ allErrors: true, strict: false })

function etagFor(id, version) {
  return `W/"${id}-${version}"`
}

function parseWorkflow(json) {
  try { return JSON.parse(json) } catch { return {} }
}

function initialStateOf(workflow) {
  const states = Array.isArray(workflow.states) ? workflow.states : []
  const initial = states.find(s => s.initial) || states[0]
  return initial ? initial.key : 'Draft'
}

function roleCanEdit(workflow, sectionKey, roles, state) {
  const rset = new Set(roles)
  const sections = Array.isArray(workflow.sections) ? workflow.sections : []
  const section = sections.find(s => s.key === sectionKey)
  if (!section) return false
  if (Array.isArray(section.visibleIn) && !section.visibleIn.includes(state)) return false
  if (!Array.isArray(section.rolesCanEdit) || !section.rolesCanEdit.length) return false
  return section.rolesCanEdit.some(r => rset.has(r))
}

function buildSkeletonFromSchema(def) {
  try {
    const arr = JSON.parse(def.SchemaJson);
    const obj = {};
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (s && s.type === 'section' && typeof s.key === 'string' && s.key.length) {
          // only create object if not array-type section
          obj[s.key] = {};
        }
      }
    }
    return obj;
  } catch { return {}; }
}

async function findByClientGeneratedId(clientGeneratedId, ctx, db) {
  if (!clientGeneratedId) return null
  const row = await repo.findByClientGeneratedId(ctx.tenantId, clientGeneratedId, db)
  if (!row) return null
  return {
    formInstanceId: row.formInstanceId,
    formDefinitionId: row.formDefinitionId,
    currentState: row.currentState,
    version: row.version,
    etag: etagFor(row.formInstanceId, row.version)
  }
}

async function createInstance(input, ctx, db) {
  const def = await repo.getDefinition(ctx.tenantId, input.formType, input.formVersion, db);
  if (!def) throw new Error('Form definition not found');

  const workflow = parseWorkflow(def.WorkflowJson);
  const state = initialStateOf(workflow);

  const skeleton = buildSkeletonFromSchema(def);
  // shallow merge: client-provided initialData wins
  const data = Object.assign({}, skeleton, input.initialData || {});

  const created = await repo.createInstance({
    tenantId: ctx.tenantId,
    formDefinitionId: def.FormDefinitionId,
    reporterUserId: ctx.userId,
    currentState: state,
    clientGeneratedId: input.clientGeneratedId,
    dataJson: JSON.stringify(data)
  }, db);

  created.etag = etagFor(created.formInstanceId, created.version);
  return created;
}

async function getInstance(id, ctx, db) {
  const row = await repo.getInstance(ctx.tenantId, id, db)
  if (!row) throw new Error('Not found')

  return {
    formInstanceId: row.FormInstanceId,
    tenantId: row.TenantId,
    formDefinitionId: row.FormDefinitionId,
    currentState: row.CurrentState,
    version: row.Version,
    createdUtc: row.CreatedUtc,
    updatedUtc: row.UpdatedUtc,
    data: JSON.parse(row.DataJson),
    etag: etagFor(row.FormInstanceId, row.Version)
  }
}

async function saveSection(input, ctx, db) {
  const { id, sectionKey, patch, idempotencyKey, ifMatch } = input
  if (!Array.isArray(patch)) throw new Error('patch must be an array')

  // Load instance+definition
  const inst = await repo.getInstance(ctx.tenantId, id, db)
  if (!inst) throw new Error('Not found')

  // ETag check
  const expected = etagFor(inst.FormInstanceId, inst.Version)
  if (ifMatch && ifMatch !== expected) {
    const err = new Error('Precondition Failed')
    err.statusCode = 409
    throw err
  }

  // Idempotency check
  if (idempotencyKey) {
    const seen = await repo.findEventByIdem(ctx.tenantId, id, idempotencyKey, db)
    if (seen) {
      // Return current projection
      return getInstance(id, ctx, db)
    }
  }

  const def = await repo.getDefinitionById(inst.FormDefinitionId, db)
  const workflow = parseWorkflow(def.WorkflowJson)

  // AuthZ
  if (!roleCanEdit(workflow, sectionKey, ctx.roles, inst.CurrentState)) {
    const err = new Error('Forbidden: cannot edit this section in current state')
    err.statusCode = 403
    throw err
  }

  // Apply JSON Patch
  let current = {}
  try { current = JSON.parse(inst.DataJson) } catch {}
  let next
  try {
    next = jsonpatch.applyPatch(current, patch, /*validate*/true).newDocument
  } catch (e) {
    const err = new Error(`Invalid patch: ${e.message}`)
    err.statusCode = 400
    throw err
  }

  // Optional schema validation (soft)
  let schemaOk = true, schemaErrors = null
  try {
    const schema = JSON.parse(def.SchemaJson || '{}')
    const validate = ajv.compile(schema)
    schemaOk = validate(next)
    if (!schemaOk) schemaErrors = validate.errors
  } catch { /* ignore */ }

  // Persist (atomic)
  const updated = await repo.appendEventAndUpdate({
    tenantId: ctx.tenantId,
    formInstanceId: inst.FormInstanceId,
    authorUserId: ctx.userId,
    authorRole: 'User', // or resolve from roles
    eventType: 'SectionSaved',
    sectionKey,
    patchJson: JSON.stringify(patch),
    idempotencyKey: idempotencyKey || null,
    newDataJson: JSON.stringify(next)
  }, db)

  return {
    formInstanceId: updated.formInstanceId,
    state: updated.currentState,
    version: updated.version,
    updatedUtc: updated.updatedUtc,
    data: next,
    etag: etagFor(updated.formInstanceId, updated.version),
    validation: schemaOk ? { ok: true } : { ok: false, errors: schemaErrors }
  }
}

function userHasRole(roles, required) {
  const rset = new Set(roles)
  return required.some(r => rset.has(r))
}

async function transition(input, ctx, db) {
  const { id, transitionKey, ifMatch } = input
  const inst = await repo.getInstance(ctx.tenantId, id, db)
  if (!inst) throw new Error('Not found')

  const expected = etagFor(inst.FormInstanceId, inst.Version)
  if (ifMatch && ifMatch !== expected) {
    const err = new Error('Precondition Failed')
    err.statusCode = 409
    throw err
  }

  const def = await repo.getDefinitionById(inst.FormDefinitionId, db)
  const wf = parseWorkflow(def.WorkflowJson)
  const transitions = Array.isArray(wf.transitions) ? wf.transitions : []
  const t = transitions.find(x => x.key === transitionKey && (x.from ? x.from === inst.CurrentState : true))
  if (!t) {
    const err = new Error('Invalid transition for current state')
    err.statusCode = 400
    throw err
  }

  // Role check
  if (Array.isArray(t.roles) && t.roles.length && !userHasRole(ctx.roles, t.roles)) {
    const err = new Error('Forbidden: role not allowed for this transition')
    err.statusCode = 403
    throw err
  }

  // Enforce required sections: if listed, require their tasks to be Done
  const requiredSections = Array.isArray(t.requiresSections) ? t.requiresSections : []
  if (requiredSections.length) {
    const undone = await repo.findUndoneSections(ctx.tenantId, id, requiredSections, db)
    if (undone.length) {
      const err = new Error(`Required sections incomplete: ${undone.join(', ')}`)
      err.statusCode = 422
      throw err
    }
  }

  // Move state + create tasks for next state
  const createdTasks = await repo.transitionAndSpawnTasks({
    tenantId: ctx.tenantId,
    formInstanceId: inst.FormInstanceId,
    fromState: inst.CurrentState,
    toState: t.to,
    authorUserId: ctx.userId,
    authorRole: 'User',
    workflowJson: def.WorkflowJson
  }, db)

  // Fresh read
  const after = await repo.getInstance(ctx.tenantId, id, db)

  return {
    formInstanceId: after.FormInstanceId,
    state: after.CurrentState,
    version: after.Version,
    etag: etagFor(after.FormInstanceId, after.Version),
    tasksCreated: createdTasks
  }
}

async function listTasks(input, ctx, db) {
  const state = String(input.state || 'open').toLowerCase()
  const mine = !!input.mine
  return repo.listTasks({
    tenantId: ctx.tenantId,
    assignedToUserId: mine ? ctx.userId : null,
    state
  }, db)
}

async function assignTask(input, ctx, db) {
  return repo.assignTask({
    tenantId: ctx.tenantId,
    taskId: input.taskId,
    assignedToUserId: input.assignedToUserId
  }, db)
}

async function completeTask(input, ctx, db) {
  return repo.completeTask({
    tenantId: ctx.tenantId,
    taskId: input.taskId,
    userId: ctx.userId
  }, db)
}

module.exports = {
  createInstance,
  getInstance,
  saveSection,
  transition,
  listTasks,
  assignTask,
  completeTask,
  findByClientGeneratedId
}
