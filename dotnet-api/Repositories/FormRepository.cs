using Microsoft.Data.SqlClient;
using System.Text.Json;

namespace DotNetApi.Repositories
{
    public record FormSchemaRecord(int FormTypeId, string Name, string SchemaJson, int Version);

    public class FormRepository
    {
        private readonly SqlConnection _db;

        public FormRepository(SqlConnection db)
        {
            _db = db;
        }

        public async Task<List<FormSchemaRecord>> GetLatestSchemasByRolesAsync(IEnumerable<string> roles)
        {
            var list = roles?.ToList() ?? new List<string>();
            if (list.Count == 0) return new List<FormSchemaRecord>();

            var parameters = new List<SqlParameter>();
            var placeholders = new List<string>();
            for (int i = 0; i < list.Count; i++)
            {
                var name = $"@role{i}";
                placeholders.Add(name);
                parameters.Add(new SqlParameter(name, list[i]));
            }

            var sql = $@"SELECT ft.Id AS FormTypeId,
                                ft.Name AS Name,
                                fs.SchemaJson AS SchemaJson,
                                fs.Version AS Version
                         FROM FormType ft
                         JOIN FormSchema fs ON fs.FormTypeId = ft.Id
                         WHERE ft.Name IN ({string.Join(", ", placeholders)})
                           AND fs.Version = (SELECT MAX(Version) FROM FormSchema WHERE FormTypeId = ft.Id)";

            using var cmd = _db.CreateCommand();
            cmd.CommandText = sql;
            cmd.Parameters.AddRange(parameters.ToArray());

            var result = new List<FormSchemaRecord>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                result.Add(new FormSchemaRecord(
                    reader.GetInt32(reader.GetOrdinal("FormTypeId")),
                    reader.GetString(reader.GetOrdinal("Name")),
                    reader.GetString(reader.GetOrdinal("SchemaJson")),
                    reader.GetInt32(reader.GetOrdinal("Version"))
                ));
            }
            return result;
        }

        public async Task<(int formTypeId, int version)> CreateFormTypeAndSchemaAsync(string name, object schema)
        {
            using var checkCmd = _db.CreateCommand();
            checkCmd.CommandText = "SELECT Id FROM FormType WHERE Name = @name";
            checkCmd.Parameters.Add(new SqlParameter("@name", name));
            var existing = await checkCmd.ExecuteScalarAsync();

            int formTypeId;
            int version;

            if (existing == null)
            {
                using var insertType = _db.CreateCommand();
                insertType.CommandText = "INSERT INTO FormType (Name) OUTPUT INSERTED.Id VALUES (@name)";
                insertType.Parameters.Add(new SqlParameter("@name", name));
                formTypeId = Convert.ToInt32(await insertType.ExecuteScalarAsync());
                version = 1;
            }
            else
            {
                formTypeId = Convert.ToInt32(existing);
                using var versionCmd = _db.CreateCommand();
                versionCmd.CommandText = "SELECT ISNULL(MAX(Version),0) FROM FormSchema WHERE FormTypeId = @formTypeId";
                versionCmd.Parameters.Add(new SqlParameter("@formTypeId", formTypeId));
                var maxVersion = Convert.ToInt32(await versionCmd.ExecuteScalarAsync());
                version = maxVersion + 1;
            }

            using var insertSchema = _db.CreateCommand();
            insertSchema.CommandText = "INSERT INTO FormSchema (FormTypeId, SchemaJson, Version) VALUES (@formTypeId, @schemaJson, @version)";
            insertSchema.Parameters.Add(new SqlParameter("@formTypeId", formTypeId));
            insertSchema.Parameters.Add(new SqlParameter("@schemaJson", JsonSerializer.Serialize(schema)));
            insertSchema.Parameters.Add(new SqlParameter("@version", version));
            await insertSchema.ExecuteNonQueryAsync();

            return (formTypeId, version);
        }
    }
}
