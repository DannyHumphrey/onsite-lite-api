const sql = require('mssql')

// Helper: exec with params
async function exec(db, text, params = {}) {
  const req = db.request()
  for (const [k, v] of Object.entries(params)) {
    // Accept either raw value or { type, value }
    if (v && typeof v === 'object' && v.hasOwnProperty('value') && v.type) {
      req.input(k, v.type, v.value)
    } else {
      req.input(k, v)
    }
  }
  const res = await req.query(text)
  return res.recordset
}

// Latest FormDefinition per FormType for a tenant
async function getLatestDefinitionsForTenant(tenantId, db) {
  const q = `
    WITH ranked AS (
      SELECT
        fd.FormDefinitionId,
        fd.TenantId,
        fd.FormType,
        fd.FormVersion,
        fd.Name,
        fd.SchemaJson,
        fd.UiJson,
        fd.WorkflowJson,
        ROW_NUMBER() OVER (PARTITION BY fd.FormType ORDER BY fd.FormVersion DESC, fd.FormDefinitionId DESC) AS rn
      FROM dbo.FormDefinition fd
      WHERE fd.TenantId = @TenantId
    )
    SELECT *
    FROM ranked
    WHERE rn = 1
    ORDER BY FormType
  `
  return exec(db, q, { TenantId: tenantId })
}

// Get next version number for (tenant, formType)
async function nextVersionFor(tenantId, formType, db) {
  const q = `
    SELECT ISNULL(MAX(FormVersion), 0) + 1 AS NextVersion
    FROM dbo.FormDefinition
    WHERE TenantId = @TenantId AND FormType = @FormType
  `
  const rows = await exec(db, q, { TenantId: tenantId, FormType: formType })
  return rows[0]?.NextVersion ?? 1
}

// Insert a new FormDefinition
async function insertFormDefinition(input, db) {
  const q = `
    INSERT INTO dbo.FormDefinition
      (TenantId, CreatedByUserId, FormType, FormVersion, Name, SchemaJson, UiJson, WorkflowJson)
    OUTPUT
      inserted.FormDefinitionId     AS formDefinitionId,
      inserted.TenantId             AS tenantId,
      inserted.FormType             AS formType,
      inserted.FormVersion          AS formVersion,
      inserted.Name                 AS name,
      inserted.SchemaJson           AS schemaJson,
      inserted.UiJson               AS uiJson,
      inserted.WorkflowJson         AS workflowJson,
      inserted.DateCreatedUtc       AS dateCreatedUtc
    VALUES
      (@TenantId, @CreatedByUserId, @FormType, @FormVersion, @Name, @SchemaJson, @UiJson, @WorkflowJson)
  `
  const rows = await exec(db, q, {
    TenantId: input.tenantId,
    CreatedByUserId: input.createdByUserId,
    FormType: input.formType,
    FormVersion: input.formVersion,
    Name: input.name,
    SchemaJson: input.schemaJson,
    UiJson: input.uiJson,
    WorkflowJson: input.workflowJson
  })
  // Parse JSON before returning (handy for your route)
  const r = rows[0]
  return {
    formDefinitionId: r.formDefinitionId,
    tenantId: r.tenantId,
    formType: r.formType,
    formVersion: r.formVersion,
    name: r.name,
    schema: JSON.parse(r.schemaJson),
    ui: r.uiJson ? JSON.parse(r.uiJson) : null,
    workflow: r.workflowJson ? JSON.parse(r.workflowJson) : null,
    dateCreatedUtc: r.dateCreatedUtc
  }
}

module.exports = {
  getLatestDefinitionsForTenant,
  nextVersionFor,
  insertFormDefinition
}