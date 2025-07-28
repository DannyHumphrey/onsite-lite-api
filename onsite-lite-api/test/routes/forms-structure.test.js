'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { build } = require('../helper')

const path = '/api/forms/structure'

test('structure requires auth', async (t) => {
  const app = await build(t)
  const res = await app.inject({ url: path })
  assert.equal(res.statusCode, 401)
})

test('structure returns ok with jwt', async (t) => {
  const app = await build(t)
  const token = app.jwt.sign({ id: 1 })
  const res = await app.inject({
    url: path,
    headers: {
      authorization: `Bearer ${token}`
    }
  })
  assert.equal(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), { message: 'OK' })
})
