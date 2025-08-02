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

async function createFormTypeAndSchema (name, schema, db) {
  return formRepository.createFormTypeAndSchema(name, schema, db)
}

module.exports = { getLatestSchemasByRoles, createFormTypeAndSchema }
