'use strict'

const { init, query, getPool } = require('../db')

async function run () {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_HOST,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  }

  await init(config)

  await query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FormType' AND xtype='U')
    CREATE TABLE FormType (
      Id INT IDENTITY(1,1) PRIMARY KEY,
      Name VARCHAR(255) NOT NULL,
      SchemaDriven BIT NOT NULL DEFAULT(0)
    )
  `)

  await query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FormSchema' AND xtype='U')
    CREATE TABLE FormSchema (
      Id INT IDENTITY(1,1) PRIMARY KEY,
      SchemaJson NVARCHAR(MAX) NOT NULL,
      Version INT NOT NULL,
      FormTypeId INT NOT NULL FOREIGN KEY REFERENCES FormType(Id)
    )
  `)

  await getPool().close()
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

