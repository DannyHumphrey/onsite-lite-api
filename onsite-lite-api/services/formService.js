const formRepository = require('../repositories/formRepository')

async function getLatestSchemasByRoles(roles, db) {
  const records = await formRepository.getLatestSchemasByRoles(roles, db)
  return records.map(row => ({
    formTypeId: row.formTypeId,
    name: row.name,
    schema: JSON.parse(row.schemaJson),
    version: row.version
  }))
}

module.exports = { getLatestSchemasByRoles }
