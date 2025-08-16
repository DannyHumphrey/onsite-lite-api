const sql = require('mssql')

async function exec(db, text, params = {}) {
  const req = db.request()
  for (const [k, v] of Object.entries(params)) req.input(k, v)
  const res = await req.query(text)
  return res.recordset
}

// ---------- Definitions ----------
async function getDefinition(tenantId, formType, formVersion, db) {
  const q = formVersion
    ? `
      SELECT TOP 1 * FROM dbo.FormDefinition
      WHERE TenantId=@TenantId AND FormType=@FormType AND FormVersion=@FormVersion
      ORDER BY FormDefinitionId DESC
    `
    : `
      SELECT TOP 1 * FROM dbo.FormDefinition
      WHERE TenantId=@TenantId AND FormType=@FormType
      ORDER BY FormVersion DESC, FormDefinitionId DESC
    `
  const rows = await exec(db, q, { TenantId: tenantId, FormType: formType, FormVersion: formVersion })
  return rows[0]
}

async function getDefinitionById(id, db) {
  const rows = await exec(db, `SELECT * FROM dbo.FormDefinition WHERE FormDefinitionId=@Id`, { Id: id })
  return rows[0]
}

// ---------- Instances ----------
async function createInstance(input, db) {
  const rows = await exec(db, `
    INSERT INTO dbo.FormInstance
      (TenantId, FormDefinitionId, ReporterUserId, CurrentState, DataJson)
    OUTPUT inserted.FormInstanceId AS formInstanceId, inserted.Version AS version
    VALUES (@TenantId, @FormDefinitionId, @ReporterUserId, @CurrentState, @DataJson)
  `, {
    TenantId: input.tenantId,
    FormDefinitionId: input.formDefinitionId,
    ReporterUserId: input.reporterUserId,
    CurrentState: input.currentState,
    DataJson: input.dataJson
  })
  return rows[0]
}

async function getInstance(tenantId, id, db) {
  const rows = await exec(db, `
    SELECT * FROM dbo.FormInstance WHERE TenantId=@TenantId AND FormInstanceId=@Id
  `, { TenantId: tenantId, Id: id })
  return rows[0]
}

async function findEventByIdem(tenantId, formInstanceId, idempotencyKey, db) {
  const rows = await exec(db, `
    SELECT TOP 1 * FROM dbo.FormEvent
    WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId AND IdempotencyKey=@Idem
  `, { TenantId: tenantId, FormInstanceId: formInstanceId, Idem: idempotencyKey })
  return rows[0]
}

// Atomic: append event + update instance (version++)
async function appendEventAndUpdate(input, db) {
  const tx = new sql.Transaction(db)
  await tx.begin()
  try {
    const r1 = await (new sql.Request(tx)).input('TenantId', input.tenantId)
      .input('FormInstanceId', input.formInstanceId)
      .input('AuthorUserId', input.authorUserId)
      .input('AuthorRole', input.authorRole)
      .input('EventType', input.eventType)
      .input('SectionKey', input.sectionKey)
      .input('PatchJson', input.patchJson)
      .input('Idem', input.idempotencyKey)
      .query(`
        INSERT INTO dbo.FormEvent (TenantId, FormInstanceId, AuthorUserId, AuthorRole, EventType, SectionKey, PatchJson, IdempotencyKey)
        VALUES (@TenantId, @FormInstanceId, @AuthorUserId, @AuthorRole, @EventType, @SectionKey, @PatchJson, @Idem)
      `)

    const r2 = await (new sql.Request(tx)).input('TenantId', input.tenantId)
      .input('FormInstanceId', input.formInstanceId)
      .input('NewDataJson', input.newDataJson)
      .query(`
        UPDATE dbo.FormInstance
        SET DataJson=@NewDataJson, Version=Version+1, UpdatedUtc=SYSUTCDATETIME()
        WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId;

        SELECT FormInstanceId, CurrentState, Version, UpdatedUtc
        FROM dbo.FormInstance
        WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId;
      `)

    await tx.commit()
    return r2.recordset[0]
  } catch (e) {
    await tx.rollback()
    // Unique idempotency violation -> return current projection
    if (e && String(e.message).includes('UX_FormEvent_Idem')) {
      const now = await exec(db, `
        SELECT FormInstanceId, CurrentState, Version, UpdatedUtc
        FROM dbo.FormInstance WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId
      `, { TenantId: input.tenantId, FormInstanceId: input.formInstanceId })
      return now[0]
    }
    throw e
  }
}

// Transition + spawn tasks for next state
async function transitionAndSpawnTasks(input, db) {
  const tx = new sql.Transaction(db)
  await tx.begin()
  try {
    // Append event
    await (new sql.Request(tx))
      .input('TenantId', input.tenantId)
      .input('FormInstanceId', input.formInstanceId)
      .input('AuthorUserId', input.authorUserId)
      .input('AuthorRole', input.authorRole)
      .input('FromState', input.fromState)
      .input('ToState', input.toState)
      .query(`
        INSERT INTO dbo.FormEvent (TenantId, FormInstanceId, AuthorUserId, AuthorRole, EventType, FromState, ToState)
        VALUES (@TenantId, @FormInstanceId, @AuthorUserId, @AuthorRole, N'Transition', @FromState, @ToState)
      `)

    // Update state + version
    await (new sql.Request(tx))
      .input('TenantId', input.tenantId)
      .input('FormInstanceId', input.formInstanceId)
      .input('ToState', input.toState)
      .query(`
        UPDATE dbo.FormInstance
        SET CurrentState=@ToState, Version=Version+1, UpdatedUtc=SYSUTCDATETIME()
        WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId;
      `)

    // Spawn tasks for sections visible in the new state
    const wf = JSON.parse(input.workflowJson || '{}')
    const sections = Array.isArray(wf.sections) ? wf.sections : []
    const toCreate = []
    for (const s of sections) {
      if (Array.isArray(s.visibleIn) && s.visibleIn.includes(input.toState) && Array.isArray(s.rolesCanEdit)) {
        for (const role of s.rolesCanEdit) {
          toCreate.push({ sectionKey: s.key, roleRequired: role })
        }
      }
    }

    const created = []
    for (const t of toCreate) {
      // Avoid duplicates: skip if open task exists for same section+role
      const existing = await (new sql.Request(tx))
        .input('TenantId', input.tenantId)
        .input('FormInstanceId', input.formInstanceId)
        .input('SectionKey', t.sectionKey)
        .input('RoleRequired', t.roleRequired)
        .query(`
          SELECT TOP 1 FormTaskId FROM dbo.FormTask
          WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId
            AND SectionKey=@SectionKey AND RoleRequired=@RoleRequired AND State=1
        `)
      if (existing.recordset.length) continue

      const ins = await (new sql.Request(tx))
        .input('TenantId', input.tenantId)
        .input('FormInstanceId', input.formInstanceId)
        .input('SectionKey', t.sectionKey)
        .input('RoleRequired', t.roleRequired)
        .query(`
          INSERT INTO dbo.FormTask (TenantId, FormInstanceId, SectionKey, RoleRequired)
          OUTPUT inserted.FormTaskId AS formTaskId, inserted.SectionKey AS sectionKey, inserted.RoleRequired AS roleRequired
          VALUES (@TenantId, @FormInstanceId, @SectionKey, @RoleRequired)
        `)
      created.push(ins.recordset[0])
    }

    await tx.commit()
    return created
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

// Require sections done: return list of missing sectionKeys
async function findUndoneSections(tenantId, formInstanceId, sectionKeys, db) {
  const rows = await exec(db, `
    SELECT SectionKey
    FROM dbo.FormTask
    WHERE TenantId=@TenantId AND FormInstanceId=@FormInstanceId
      AND SectionKey IN (${sectionKeys.map((_,i)=>'@s'+i).join(',')})
      AND State <> 2
    GROUP BY SectionKey
  `, Object.assign({ TenantId: tenantId, FormInstanceId: formInstanceId },
      Object.fromEntries(sectionKeys.map((k,i)=>['s'+i, k]))))
  // If you don't use tasks for completion, replace with JSON path checks
  return rows.map(r => r.SectionKey)
}

// ---------- Tasks ----------
async function listTasks(input, db) {
  const params = { TenantId: input.tenantId }
  let filter = `WHERE t.TenantId=@TenantId`
  if (input.assignedToUserId) {
    filter += ` AND t.AssignedToUserId=@AssignedToUserId`
    params.AssignedToUserId = input.assignedToUserId
  }
  if (input.state === 'open') filter += ` AND t.State=1`
  if (input.state === 'done') filter += ` AND t.State=2`

  const rows = await exec(db, `
    SELECT t.FormTaskId, t.FormInstanceId, t.SectionKey, t.RoleRequired, t.AssignedToUserId,
           t.State, t.DueUtc, t.CreatedUtc, t.CompletedUtc,
           i.CurrentState, i.UpdatedUtc
    FROM dbo.FormTask t
    INNER JOIN dbo.FormInstance i ON i.FormInstanceId=t.FormInstanceId AND i.TenantId=t.TenantId
    ${filter}
    ORDER BY t.CreatedUtc DESC
  `, params)
  return rows
}

async function assignTask(input, db) {
  const rows = await exec(db, `
    UPDATE dbo.FormTask
    SET AssignedToUserId=@AssignedToUserId
    OUTPUT inserted.FormTaskId, inserted.AssignedToUserId
    WHERE TenantId=@TenantId AND FormTaskId=@TaskId;
  `, { TenantId: input.tenantId, TaskId: input.taskId, AssignedToUserId: input.assignedToUserId })
  return rows[0] || null
}

async function completeTask(input, db) {
  const rows = await exec(db, `
    UPDATE dbo.FormTask
    SET State=2, CompletedUtc=SYSUTCDATETIME()
    OUTPUT inserted.FormTaskId, inserted.State, inserted.CompletedUtc
    WHERE TenantId=@TenantId AND FormTaskId=@TaskId;
  `, { TenantId: input.tenantId, TaskId: input.taskId })
  return rows[0] || null
}

module.exports = {
  getDefinition, getDefinitionById,
  createInstance, getInstance,
  findEventByIdem, appendEventAndUpdate,
  transitionAndSpawnTasks, findUndoneSections,
  listTasks, assignTask, completeTask
}
