'use strict'

const { query } = require('./db')

async function dropLegacyFormTables() {
  // Drop in dependency order: FormSchema -> FormType
  await query(`
    IF OBJECT_ID(N'dbo.FormSchema', N'U') IS NOT NULL
      DROP TABLE dbo.FormSchema;
  `);

  await query(`
    IF OBJECT_ID(N'dbo.FormType', N'U') IS NOT NULL
      DROP TABLE dbo.FormType;
  `);
}

// ensureTables.ts
async function ensureTables() {

  await dropLegacyFormTables();

  // ---------------- FormDefinition ----------------
  await query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormDefinition]') AND type = N'U')
    CREATE TABLE dbo.FormDefinition (
      FormDefinitionId  BIGINT IDENTITY(1,1) PRIMARY KEY,
      TenantId          INT NOT NULL,
      CreatedByUserId   INT NOT NULL,
      FormType          NVARCHAR(64) NOT NULL,        -- e.g. 'AINM', 'EPC'
      FormVersion       INT NOT NULL,
      Name              NVARCHAR(256) NOT NULL,
      SchemaJson        NVARCHAR(MAX) NOT NULL,       -- JSON Schema
      UiJson            NVARCHAR(MAX) NULL,           -- optional
      WorkflowJson      NVARCHAR(MAX) NOT NULL,       -- FSM + ACLs
      SchemaHash        AS CONVERT(VARBINARY(32), HASHBYTES('SHA2_256', CONVERT(NVARCHAR(MAX), SchemaJson))) PERSISTED,
      WorkflowHash      AS CONVERT(VARBINARY(32), HASHBYTES('SHA2_256', CONVERT(NVARCHAR(MAX), WorkflowJson))) PERSISTED,
      DateCreatedUtc    DATETIME2(3) NOT NULL CONSTRAINT DF_FormDef_DateCreatedUtc DEFAULT SYSUTCDATETIME()
    );
  `);

  // JSON checks + uniqueness
  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_FormDef_SchemaJson_IsJson')
    ALTER TABLE dbo.FormDefinition WITH NOCHECK
      ADD CONSTRAINT CK_FormDef_SchemaJson_IsJson CHECK (ISJSON(SchemaJson) = 1);

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_FormDef_WorkflowJson_IsJson')
    ALTER TABLE dbo.FormDefinition WITH NOCHECK
      ADD CONSTRAINT CK_FormDef_WorkflowJson_IsJson CHECK (ISJSON(WorkflowJson) = 1);

    IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_FormDef_Tenant_FormType_Version')
    ALTER TABLE dbo.FormDefinition
      ADD CONSTRAINT UQ_FormDef_Tenant_FormType_Version UNIQUE (TenantId, FormType, FormVersion);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FormDef_Tenant_Type_SchemaHash' AND object_id = OBJECT_ID('dbo.FormDefinition'))
    CREATE UNIQUE INDEX UX_FormDef_Tenant_Type_SchemaHash
      ON dbo.FormDefinition (TenantId, FormType, SchemaHash);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormDef_Tenant_Type' AND object_id = OBJECT_ID('dbo.FormDefinition'))
    CREATE INDEX IX_FormDef_Tenant_Type
      ON dbo.FormDefinition (TenantId, FormType, FormVersion DESC);
  `);

  // ---------------- FormInstance ----------------
  await query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormInstance]') AND type = N'U')
    CREATE TABLE dbo.FormInstance (
      FormInstanceId    BIGINT IDENTITY(1,1) PRIMARY KEY,
      TenantId          INT NOT NULL,
      FormDefinitionId  BIGINT NOT NULL FOREIGN KEY REFERENCES dbo.FormDefinition(FormDefinitionId),
      ReporterUserId    INT NOT NULL,
      CurrentState      NVARCHAR(64) NOT NULL,
      Version           INT NOT NULL CONSTRAINT DF_FormInstance_Version DEFAULT (1), -- optimistic concurrency
      CreatedUtc        DATETIME2(3) NOT NULL CONSTRAINT DF_FormInstance_CreatedUtc DEFAULT SYSUTCDATETIME(),
      UpdatedUtc        DATETIME2(3) NOT NULL CONSTRAINT DF_FormInstance_UpdatedUtc DEFAULT SYSUTCDATETIME(),
      DataJson          NVARCHAR(MAX) NOT NULL,
    );
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_FormInstance_DataJson_IsJson')
    ALTER TABLE dbo.FormInstance WITH NOCHECK
      ADD CONSTRAINT CK_FormInstance_DataJson_IsJson CHECK (ISJSON(DataJson) = 1);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormInstance_Tenant_State' AND object_id = OBJECT_ID('dbo.FormInstance'))
    CREATE INDEX IX_FormInstance_Tenant_State ON dbo.FormInstance (TenantId, CurrentState);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormInstance_Tenant_Date' AND object_id = OBJECT_ID('dbo.FormInstance'))
    CREATE INDEX IX_FormInstance_Tenant_Date ON dbo.FormInstance (TenantId, UpdatedUtc DESC);

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'ClientGeneratedId' AND Object_ID = Object_ID(N'dbo.FormInstance'))
    ALTER TABLE dbo.FormInstance ADD ClientGeneratedId UNIQUEIDENTIFIER NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FormInstance_ClientId' AND object_id = OBJECT_ID('dbo.FormInstance'))
    CREATE UNIQUE INDEX UX_FormInstance_ClientId
      ON dbo.FormInstance (TenantId, ClientGeneratedId)
      WHERE ClientGeneratedId IS NOT NULL;
  `);

  // ---------------- FormEvent (append-only audit) ----------------
  await query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormEvent]') AND type = N'U')
    CREATE TABLE dbo.FormEvent (
      FormEventId       BIGINT IDENTITY(1,1) PRIMARY KEY,
      TenantId          INT NOT NULL,
      FormInstanceId    BIGINT NOT NULL FOREIGN KEY REFERENCES dbo.FormInstance(FormInstanceId),
      CreatedUtc        DATETIME2(3) NOT NULL CONSTRAINT DF_FormEvent_CreatedUtc DEFAULT SYSUTCDATETIME(),
      AuthorUserId      INT NOT NULL,
      AuthorRole        NVARCHAR(64) NOT NULL,
      EventType         NVARCHAR(32) NOT NULL,      -- SectionSaved | Transition | Assign | Attach
      SectionKey        NVARCHAR(64) NULL,
      FromState         NVARCHAR(64) NULL,
      ToState           NVARCHAR(64) NULL,
      PatchJson         NVARCHAR(MAX) NULL,         -- RFC6902/merge patch
      SnapshotHash      VARBINARY(32) NULL,
      IdempotencyKey    NVARCHAR(128) NULL
    );
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_FormEvent_PatchJson_IsJson')
    ALTER TABLE dbo.FormEvent WITH NOCHECK
      ADD CONSTRAINT CK_FormEvent_PatchJson_IsJson CHECK (PatchJson IS NULL OR ISJSON(PatchJson) = 1);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_FormEvent_Idem' AND object_id = OBJECT_ID('dbo.FormEvent'))
    CREATE UNIQUE INDEX UX_FormEvent_Idem
      ON dbo.FormEvent (TenantId, FormInstanceId, IdempotencyKey)
      WHERE IdempotencyKey IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormEvent_Instance_Date' AND object_id = OBJECT_ID('dbo.FormEvent'))
    CREATE INDEX IX_FormEvent_Instance_Date
      ON dbo.FormEvent (FormInstanceId, CreatedUtc DESC);
  `);

  // ---------------- FormTask (work items) ----------------
  await query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormTask]') AND type = N'U')
    CREATE TABLE dbo.FormTask (
      FormTaskId        BIGINT IDENTITY(1,1) PRIMARY KEY,
      TenantId          INT NOT NULL,
      FormInstanceId    BIGINT NOT NULL FOREIGN KEY REFERENCES dbo.FormInstance(FormInstanceId),
      SectionKey        NVARCHAR(64) NOT NULL,
      RoleRequired      NVARCHAR(64) NOT NULL,      -- Investigator, H&S Manager, etc.
      AssignedToUserId  INT NULL,
      State             TINYINT NOT NULL CONSTRAINT DF_FormTask_State DEFAULT (1), -- 1=Open,2=Done,3=Cancelled
      DueUtc            DATETIME2(3) NULL,
      CreatedUtc        DATETIME2(3) NOT NULL CONSTRAINT DF_FormTask_CreatedUtc DEFAULT SYSUTCDATETIME(),
      CompletedUtc      DATETIME2(3) NULL
    );
  `);

  await query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormTask_MyOpen' AND object_id = OBJECT_ID('dbo.FormTask'))
    CREATE INDEX IX_FormTask_MyOpen
      ON dbo.FormTask (TenantId, AssignedToUserId, State)
      INCLUDE (FormInstanceId, SectionKey);
  `);
}



module.exports = { ensureTables }
