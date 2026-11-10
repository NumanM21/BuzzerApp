namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Locks the round when the grace window ends even if nobody buzzes again (§5 "Why a clock?"). The timer runs on the
/// injected <see cref="TimeProvider"/>, so tests drive it with a fake clock instead of waiting.
/// </summary>
public sealed class RoundClock(RoundService rounds, TimeProvider time, ILogger<RoundClock> logger) : BackgroundService
{
    // Well under the 2 s window, so a lock is at most ~0.1 s late; Buzz() also checks the window, so a late buzz is
    // rejected even between ticks.
    public static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(100);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                // One bad tick must not stop the clock: without it an Open round would never lock on its own.
                try
                {
                    await rounds.TickAsync();
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Round clock tick failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }
}
