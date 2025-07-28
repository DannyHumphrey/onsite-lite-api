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

module.exports = { getLatestSchemasByRoles }
