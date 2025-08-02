'use strict'

const { init, getPool } = require('../db')
const { ensureTables } = require('../ensure-tables')

async function run () {

  const config = {
    user: process.env.DB_USER ?? 'SA',
    password: process.env.DB_PASS ?? '123456a@',
    server: process.env.DB_HOST ?? 'localhost',
    database: process.env.DB_NAME ?? 'OnsiteLite',
    options: { encrypt: false, trustServerCertificate: true }
  }

  console.debug(config)

  await init(config)
  await ensureTables()
  await getPool().close()
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

