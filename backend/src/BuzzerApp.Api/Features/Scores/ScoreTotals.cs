using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Scores;

/// <summary>
/// Ledger totals per team and per player, shared by the leaderboards and the archive so both read the ledger the same way.
/// Callers look totals up by id and never enumerate the dictionaries into output (shared ordering rule).
/// </summary>
internal static class ScoreTotals
{
    /// <summary>A team with no ledger rows has no group, so it is absent here: callers treat a missing id as zero.</summary>
    public static async Task<Dictionary<int, int>> ByTeamAsync(AppDbContext db, int eventId, CancellationToken ct)
    {
        var totals = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.EventId == eventId && a.TeamId != null)
            .GroupBy(a => a.TeamId)
            .Select(g => new { TeamId = g.Key, Total = g.Sum(a => (long)a.Amount) })
            .ToListAsync(ct);
        return totals.ToDictionary(x => x.TeamId!.Value, x => ClampToInt(x.Total));
    }

    public static async Task<Dictionary<int, int>> ByPlayerAsync(AppDbContext db, int eventId, CancellationToken ct)
    {
        var totals = await db.ScoreAdjustments.AsNoTracking()
            .Where(a => a.EventId == eventId && a.PlayerId != null)
            .GroupBy(a => a.PlayerId)
            .Select(g => new { PlayerId = g.Key, Total = g.Sum(a => (long)a.Amount) })
            .ToListAsync(ct);
        return totals.ToDictionary(x => x.PlayerId!.Value, x => ClampToInt(x.Total));
    }

    // Summed as long because a plain int Sum would overflow; the score endpoints keep every total inside int, so the clamp is a backstop.
    private static int ClampToInt(long value) => (int)Math.Clamp(value, int.MinValue, int.MaxValue);
}
