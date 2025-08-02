'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { build } = require('../helper')

// Route path updated to match current implementation in routes/api/forms.js
const path = '/api/FormTemplates'

test('structure requires auth', async (t) => {
  const app = await build(t)
  const res = await app.inject({ url: path })
  assert.equal(res.statusCode, 401)
})

test('structure rejects invalid token', async (t) => {
  const app = await build(t)
  const res = await app.inject({
    url: path,
    headers: { authorization: 'Bearer invalid' }
  })
  assert.equal(res.statusCode, 401)
})

test('structure returns schemas for roles', async (t) => {
  const app = await build(t)

  // stub database query
  app.db.query = async () => {
    return {
      recordset: [
        {
          formTypeId: 1,
          name: 'Magenta EICR (V2)',
          schemaJson: '{"foo": "bar"}',
          version: 3
        }
      ]
    }
  }

  const token = app.jwt.sign({
    id: 1,
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': [
      'Magenta EICR (V2)'
    ]
  })

  const res = await app.inject({
    url: path,
    headers: { authorization: `Bearer ${token}` }
  })

  assert.equal(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), [
    {
      formTypeId: 1,
      name: 'Magenta EICR (V2)',
      schema: { foo: 'bar' },
      version: 3
    }
  ])
})
