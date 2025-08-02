using Microsoft.Data.SqlClient;
using System.Data;

public static class Db
{
    private static SqlConnection? _connection;

    public static async Task InitAsync(IConfiguration configuration)
    {
        var dbHost = configuration["DB_HOST"];
        var dbUser = configuration["DB_USER"];
        var dbPass = configuration["DB_PASS"];
        var dbName = configuration["DB_NAME"];

        var masterConnectionString = $"Server={dbHost};Database=master;User Id={dbUser};Password={dbPass};TrustServerCertificate=True";
        using var master = new SqlConnection(masterConnectionString);
        await master.OpenAsync();

        var createCmd = master.CreateCommand();
        createCmd.CommandText = "IF DB_ID(@db) IS NULL BEGIN EXEC('CREATE DATABASE [' + @db + ']') END";
        createCmd.Parameters.Add(new SqlParameter("@db", dbName));
        await createCmd.ExecuteNonQueryAsync();

        var connectionString = $"Server={dbHost};Database={dbName};User Id={dbUser};Password={dbPass};TrustServerCertificate=True";
        _connection = new SqlConnection(connectionString);
        await _connection.OpenAsync();
    }

    public static SqlConnection GetConnection()
    {
        if (_connection == null)
        {
            throw new InvalidOperationException("Database not initialized");
        }
        return _connection;
    }
}
