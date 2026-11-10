using BuzzerApp.Core.Domain;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Features.Players;

public enum NameClash
{
    None,
    RealName,
    DisplayName,
}

/// <summary>
/// "Is this name free?" for a player's two names, each unique per event ignoring case (D18). Registration and name
/// edits both need it, and both need to read the same answer out of a lost race on the unique indexes; it was written
/// out twice before, including the index-name matching.
/// </summary>
public static class PlayerNames
{
    /// <summary>
    /// Checks the names that are given (null = not being changed) against the other players of the event; the real
    /// name first. <paramref name="exceptPlayerId"/> is the player being edited, so they can change the capitalisation
    /// of their own name.
    /// </summary>
    public static async Task<NameClash> FindClashAsync(
        AppDbContext db, int eventId, int? exceptPlayerId, string? realName, string? displayName, CancellationToken ct)
    {
        var others = db.Players.Where(p => p.EventId == eventId);
        if (exceptPlayerId is { } self)
        {
            others = others.Where(p => p.Id != self);
        }

        if (realName is not null)
        {
            var normalized = NameNormalizer.Normalize(realName);
            if (await others.AnyAsync(p => p.NormalizedRealName == normalized, ct))
            {
                return NameClash.RealName;
            }
        }

        if (displayName is not null)
        {
            var normalized = NameNormalizer.Normalize(displayName);
            if (await others.AnyAsync(p => p.NormalizedDisplayName == normalized, ct))
            {
                return NameClash.DisplayName;
            }
        }

        return NameClash.None;
    }

    /// <summary>
    /// Which name lost the race when a save failed on a unique index: another request took it between the check above
    /// and the save. Call only for a unique violation.
    /// </summary>
    public static NameClash FromFailedSave(DbUpdateException ex) =>
        ex.IsUniqueViolationOn(nameof(Player.NormalizedDisplayName)) ? NameClash.DisplayName : NameClash.RealName;
}
