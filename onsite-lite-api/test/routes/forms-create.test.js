'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { build } = require('../helper')

const path = '/api/forms'

test('create requires auth', async (t) => {
  const app = await build(t)
  const res = await app.inject({ url: path, method: 'POST', payload: {} })
  assert.equal(res.statusCode, 401)
})

test('create rejects invalid token', async (t) => {
  const app = await build(t)
  const res = await app.inject({
    url: path,
    method: 'POST',
    headers: { authorization: 'Bearer invalid' },
    payload: {}
  })
  assert.equal(res.statusCode, 401)
})

test('create inserts new form type when none exists', async (t) => {
  const app = await build(t)
  const queries = []
  app.db.query = async (sql, params) => {
    queries.push({ sql, params })
    if (sql.includes('SELECT Id FROM FormType')) {
      return { recordset: [] }
    }
    if (sql.includes('INSERT INTO FormType')) {
      return { recordset: [{ Id: 1 }] }
    }
    if (sql.includes('INSERT INTO FormSchema')) {
      return { recordset: [] }
    }
    throw new Error('Unexpected SQL')
  }
  const token = app.jwt.sign({ id: 1 })
  const res = await app.inject({
    url: path,
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Test Form', schema: { foo: 'bar' } }
  })
  assert.equal(res.statusCode, 201)
  assert.deepStrictEqual(JSON.parse(res.payload), { formTypeId: 1, version: 1 })
  assert.equal(queries.length, 3)
})

test('create adds new version when form type exists', async (t) => {
  const app = await build(t)
  app.db.query = async (sql, params) => {
    if (sql.includes('SELECT Id FROM FormType')) {
      return { recordset: [{ Id: 1 }] }
    }
    if (sql.includes('SELECT MAX(Version)')) {
      return { recordset: [{ maxVersion: 2 }] }
    }
    if (sql.includes('INSERT INTO FormSchema')) {
      return { recordset: [] }
    }
    throw new Error('Unexpected SQL')
  }
  const token = app.jwt.sign({ id: 1 })
  const res = await app.inject({
    url: path,
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Test Form', schema: { foo: 'bar' } }
  })
  assert.equal(res.statusCode, 201)
  assert.deepStrictEqual(JSON.parse(res.payload), { formTypeId: 1, version: 3 })
})
