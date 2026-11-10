using BuzzerApp.Api.Common;

namespace BuzzerApp.Api.Features.Archive;

public static class ArchiveEndpoints
{
    public static IEndpointRouteBuilder MapArchiveEndpoints(this IEndpointRouteBuilder app)
    {
        // Both routes are admin-only: the document holds every real name.
        var group = app.MapGroup("/api/archive").RequireAuthorization(AuthPolicies.Admin);

        // 200 on a re-run too: finalizing replaces the archive.
        group.MapPost("/finalize", async (ArchiveService archive, CancellationToken ct) =>
            (await archive.FinalizeAsync(ct)).ToOk());

        group.MapGet("/{eventId:int}/export", async (int eventId, ArchiveService archive, HttpResponse response, CancellationToken ct) =>
            (await archive.ExportAsync(eventId, ct)).ToHttp(file =>
            {
                // Real names inside: keep proxies and the browser cache from holding a copy.
                response.Headers.CacheControl = "no-store";
                return Results.File(file.Content, "application/json", file.FileName);
            }));
        return app;
    }
}
