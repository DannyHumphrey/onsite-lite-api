const db = require('../db')

async function getLatestSchemasByRoles(roles, database = db) {
  if (!roles || roles.length === 0) {
    return []
  }

  const params = {}
  const placeholders = roles.map((role, idx) => {
    const key = `role${idx}`
    params[key] = role
    return `@${key}`
  }).join(', ')

  const sql = `
    SELECT ft.Id AS formTypeId,
           ft.Name AS name,
           fs.SchemaJson AS schemaJson,
           fs.Version AS version
    FROM FormType ft
    JOIN FormSchema fs ON fs.FormTypeId = ft.Id
    WHERE ft.Name IN (${placeholders})
      AND fs.Version = (
        SELECT MAX(Version) FROM FormSchema WHERE FormTypeId = ft.Id
      )
  `

  const result = await database.query(sql, params)
  return result.recordset
}

async function createFormTypeAndSchema (name, schema, database = db) {
  // check if form type exists
  const typeResult = await database.query(
    'SELECT Id FROM FormType WHERE Name = @name',
    { name }
  )

  let formTypeId
  let version

  if (typeResult.recordset.length === 0) {
    // insert new form type and start at version 1
    const insertType = await database.query(
      'INSERT INTO FormType (Name) OUTPUT INSERTED.Id VALUES (@name)',
      { name }
    )
    formTypeId = insertType.recordset[0].Id
    version = 1
  } else {
    formTypeId = typeResult.recordset[0].Id
    const versionResult = await database.query(
      'SELECT MAX(Version) AS maxVersion FROM FormSchema WHERE FormTypeId = @formTypeId',
      { formTypeId }
    )
    const maxVersion = versionResult.recordset[0].maxVersion || 0
    version = maxVersion + 1
  }

  await database.query(
    'INSERT INTO FormSchema (FormTypeId, SchemaJson, Version) VALUES (@formTypeId, @schemaJson, @version)',
    { formTypeId, schemaJson: JSON.stringify(schema), version }
  )

  return { formTypeId, version }
}

module.exports = { getLatestSchemasByRoles, createFormTypeAndSchema }
