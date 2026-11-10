using System.Text.Json;
using System.Text.Json.Serialization;

namespace BuzzerApp.Api.Common;

/// <summary>The app's JSON conventions, applied to both HTTP responses and SignalR messages so the frontend has one set of types.</summary>
public static class AppJson
{
    // Enums go out as "admin" / "add" / "open" rather than numbers, which would silently change meaning if an enum were reordered.
    public static void Configure(JsonSerializerOptions options) =>
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
}
