'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const mssqlPath = require.resolve('mssql')

class FakeConnectionPool {
  constructor (config) {
    this.config = config
    this.queries = []
    FakeConnectionPool.instances.push(this)
  }
  async connect () {}
  async close () {}
  request () {
    const self = this
    return {
      input () { return this },
      async query (q) { self.queries.push(q) }
    }
  }
}
FakeConnectionPool.instances = []

const fakeSql = { ConnectionPool: FakeConnectionPool, NVarChar: class {} }

// replace mssql with fake module
const original = require.cache[mssqlPath]
require.cache[mssqlPath] = { id: mssqlPath, filename: mssqlPath, loaded: true, exports: fakeSql }

const db = require('../../db')

test('init creates database if missing', async () => {
  await db.init({ user: 'u', password: 'p', server: 's', database: 'MyDb', options: { encrypt: false, trustServerCertificate: true } })

  assert.equal(FakeConnectionPool.instances.length, 2)
  assert.equal(FakeConnectionPool.instances[0].config.database, 'master')
  assert.equal(FakeConnectionPool.instances[1].config.database, 'MyDb')
  assert(FakeConnectionPool.instances[0].queries.some(q => q.includes('CREATE DATABASE')))
})

// restore original module after tests
process.on('exit', () => {
  if (original) {
    require.cache[mssqlPath] = original
  } else {
    delete require.cache[mssqlPath]
  }
})
