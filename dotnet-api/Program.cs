using System.Text.Json;
using DotNetApi.Repositories;
using DotNetApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

await Db.InitAsync(builder.Configuration);
builder.Services.AddSingleton(new FormRepository(Db.GetConnection()));
builder.Services.AddSingleton<FormService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapGet("/", () => Results.Json(new { root = true }));

app.MapGet("/form-schemas", async (string roles, FormService service) =>
{
    var roleList = roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    var schemas = await service.GetLatestSchemasByRolesAsync(roleList);
    return Results.Json(schemas);
});

app.MapPost("/form-schemas/{name}", async (string name, JsonElement schema, FormService service) =>
{
    var result = await service.CreateFormTypeAndSchemaAsync(name, schema);
    return Results.Json(result);
});

app.Run();
