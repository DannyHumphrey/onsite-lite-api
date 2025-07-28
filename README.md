# onsite-lite-api

This project provides a Fastify based API with support for MS SQL Server
connections using the `mssql` package.

Environment credentials for the database are loaded from `.env.<environment>` files in the project root. Create files for `dev`, `qa`, `uat`, `staging` and `live` with variables `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME`.
