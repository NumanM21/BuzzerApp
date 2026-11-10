using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Common;

public static class ActiveEvent
{
    /// <summary>
    /// Id of the active event if <paramref name="joinCode"/> matches it, else null. The comparison is
    /// done in memory with OrdinalIgnoreCase: the filter already narrows the query to one row, and it
    /// keeps "same code" defined in one obvious place instead of relying on database collation.
    /// </summary>
    public static async Task<int?> FindIdByJoinCodeAsync(AppDbContext db, string? joinCode, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(joinCode))
        {
            return null;
        }

        var active = await db.Events.AsNoTracking()
            .Where(e => e.IsActive)
            .Select(e => new { e.Id, e.JoinCode })
            .SingleOrDefaultAsync(ct);

        return active is not null && string.Equals(active.JoinCode, joinCode.Trim(), StringComparison.OrdinalIgnoreCase)
            ? active.Id
            : null;
    }
}
