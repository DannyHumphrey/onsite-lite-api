# onsite-lite-api

This repository now hosts a sample ASP.NET Core Web API that connects to a
SQL Server database using `Microsoft.Data.SqlClient`.

## Running the API

The .NET project lives in `dotnet-api`:

```
cd dotnet-api
dotnet run
```

The connection string is built from the following environment variables:

- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`

## Endpoints

- `GET /` – returns a simple health object.
- `GET /form-schemas?roles=role1,role2` – latest schemas for the provided roles.
- `POST /form-schemas/{name}` – creates a new form type and schema.
