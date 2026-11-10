namespace BuzzerApp.Api.Realtime;

/// <summary>
/// Locks the round when the grace window ends even if nobody buzzes again (§5 "Why a clock?"). The timer runs on the
/// injected <see cref="TimeProvider"/>, so tests drive it with a fake clock instead of waiting.
/// </summary>
public sealed class RoundClock(IRoundTicker rounds, TimeProvider time, ILogger<RoundClock> logger) : BackgroundService
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
                // This loop resumes inline on whichever thread fired the timer, and a tick takes the round's locks. A
                // fake clock fires timers from inside GetUtcNow(), which the round calls while holding its own lock, so
                // a tick run inline there would wait for RoundService's gate with that lock held: a deadlock against
                // any buzz that holds the gate and wants the round (this hung the B6 racing test). Running the tick on
                // the thread pool means it never starts on a thread that already holds a lock.
                await Task.Run(TickAsync, CancellationToken.None).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    private async Task TickAsync()
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
