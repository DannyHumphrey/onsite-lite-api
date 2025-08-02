using System.Text.Json;
using DotNetApi.Repositories;

namespace DotNetApi.Services
{
    public class FormService
    {
        private readonly FormRepository _repository;

        public FormService(FormRepository repository)
        {
            _repository = repository;
        }

        public async Task<IEnumerable<FormSchemaDto>> GetLatestSchemasByRolesAsync(IEnumerable<string> roles)
        {
            var records = await _repository.GetLatestSchemasByRolesAsync(roles);
            return records.Select(r => new FormSchemaDto
            {
                FormTypeId = r.FormTypeId,
                Name = r.Name,
                Schema = JsonDocument.Parse(r.SchemaJson).RootElement,
                Version = r.Version
            });
        }

        public Task<(int formTypeId, int version)> CreateFormTypeAndSchemaAsync(string name, object schema)
        {
            return _repository.CreateFormTypeAndSchemaAsync(name, schema);
        }
    }

    public class FormSchemaDto
    {
        public int FormTypeId { get; set; }
        public string Name { get; set; } = string.Empty;
        public JsonElement Schema { get; set; }
        public int Version { get; set; }
    }
}
