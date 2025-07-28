'use strict'

module.exports = async function (fastify, opts) {
  fastify.get(
    '/structure',
    { preValidation: [fastify.authenticate] },
    async function (request, reply) {
      const claim =
        request.user[
          'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
        ]

      const roles = Array.isArray(claim)
        ? claim
        : claim
          ? [claim]
          : []

      if (roles.length === 0) {
        return []
      }

      const params = {}
      const placeholders = roles
        .map((role, idx) => {
          const key = `role${idx}`
          params[key] = role
          return `@${key}`
        })
        .join(', ')

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

      const result = await fastify.db.query(sql, params)

      return result.recordset.map((row) => ({
        formTypeId: row.formTypeId,
        name: row.name,
        schema: JSON.parse(row.schemaJson),
        version: row.version
      }))
    }
  )
}
