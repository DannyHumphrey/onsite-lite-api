'use strict'

const { query } = require('./db')

async function ensureTables () {
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
}

module.exports = { ensureTables }
