using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Rounds;
using BuzzerApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Saves finished rounds for the stats (D28), one item at a time and in queue order. It is the queue's only reader, so
/// an ended round is always processed after its locked insert.
/// </summary>
public sealed class RoundPersistenceWorker(
    RoundPersistenceQueue queue,
    IServiceScopeFactory scopes,
    ILogger<RoundPersistenceWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var work in queue.Reader.ReadAllAsync(stoppingToken))
            {
                await ProcessAsync(work, CancellationToken.None);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down: save what is already queued (a round locked or reset just before a restart) rather than
            // lose it. The host's shutdown timeout still bounds how long this can take.
            while (queue.Reader.TryRead(out var work))
            {
                await ProcessAsync(work, CancellationToken.None);
            }
        }
    }

    private async Task ProcessAsync(RoundPersistenceWork work, CancellationToken ct)
    {
        // A failed save loses one round's stats; throwing would stop the worker and lose every later round too.
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            switch (work)
            {
                case LockedRoundWork locked:
                    await SaveLockedAsync(db, locked, ct);
                    break;
                case EndedRoundWork ended:
                    await SaveEndedAsync(db, ended.Record, ct);
                    break;
                default:
                    throw new InvalidOperationException($"Unknown round persistence work {work.GetType().Name}.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not save round data {Work}", work.GetType().Name);
        }
    }

    private static async Task SaveLockedAsync(AppDbContext db, LockedRoundWork work, CancellationToken ct)
    {
        var record = work.Record;
        var round = new Round
        {
            Id = record.RoundId,
            EventId = work.EventId,
            StartedAt = record.StartedAt,
            LockedAt = record.LockedAt,
        };

        // Added in Sequence order so the generated ids rise with the sequence, and anything reading by id sees arrival order.
        foreach (var buzz in record.Buzzes.OrderBy(b => b.Sequence))
        {
            round.Buzzes.Add(new BuzzRecord
            {
                RoundId = record.RoundId,
                PlayerId = buzz.PlayerId,
                TeamId = buzz.TeamId,
                Sequence = buzz.Sequence,
                OffsetMs = buzz.OffsetMs,
                CountedForTeam = buzz.CountedForTeam,
                TeamQueuePosition = buzz.TeamQueuePosition,
            });
        }

        db.Rounds.Add(round);
        await db.SaveChangesAsync(ct);
    }

    private async Task SaveEndedAsync(AppDbContext db, EndedRoundRecord record, CancellationToken ct)
    {
        var round = await db.Rounds.SingleOrDefaultAsync(r => r.Id == record.RoundId, ct);
        if (round is null)
        {
            // Only happens if the locked insert failed (already logged); there is nothing to end.
            logger.LogWarning("Round {RoundId} ended but was never saved; its outcomes are lost", record.RoundId);
            return;
        }

        round.EndedAt = record.EndedAt;

        // Matched by team id, never by position: the outcome list and the rows are separate collections.
        var outcomeByTeam = record.TeamOutcomes.ToDictionary(o => o.TeamId, o => ToOutcome(o.Outcome));
        var counted = await db.BuzzRecords
            .Where(b => b.RoundId == record.RoundId && b.CountedForTeam)
            .OrderBy(b => b.Sequence)
            .ToListAsync(ct);
        foreach (var buzz in counted)
        {
            buzz.Outcome = outcomeByTeam.TryGetValue(buzz.TeamId, out var outcome) ? outcome : null;
        }

        await db.SaveChangesAsync(ct);
    }

    private static TeamOutcome ToOutcome(RoundTeamOutcome outcome) => outcome switch
    {
        RoundTeamOutcome.Current => TeamOutcome.Current,
        RoundTeamOutcome.Passed => TeamOutcome.Passed,
        RoundTeamOutcome.Unreached => TeamOutcome.Unreached,
        _ => throw new ArgumentOutOfRangeException(nameof(outcome), outcome, null),
    };
}
