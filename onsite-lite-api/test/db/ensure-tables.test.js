'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const db = require('../../db')

test('ensureTables creates missing tables', async () => {
  const queries = []
  db.query = async (q) => { queries.push(q) }

  const { ensureTables } = require('../../ensure-tables')
  await ensureTables()

  assert(queries.some(q => q.includes('FormType')))
  assert(queries.some(q => q.includes('FormSchema')))
})
