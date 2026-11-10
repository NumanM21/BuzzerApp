using BuzzerApp.Api.Realtime;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;

namespace BuzzerApp.Api.Tests.Realtime;

/// <summary>The clock on its own: a fake ticker and a fake time, no host and no database.</summary>
public class RoundClockTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    /// <summary>Says when the clock has created its timer, so a test never advances time before there is anything to fire.</summary>
    private sealed class ClockTime : FakeTimeProvider
    {
        private readonly TaskCompletionSource _timerCreated = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task TimerCreated => _timerCreated.Task;

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = base.CreateTimer(callback, state, dueTime, period);
            _timerCreated.TrySetResult();
            return timer;
        }
    }

    private sealed class Ticker(Func<int, Task> onTick) : IRoundTicker
    {
        private int _count;

        public Task TickAsync() => onTick(Interlocked.Increment(ref _count));
    }

    private static async Task<RoundClock> StartAsync(IRoundTicker ticker, ClockTime time)
    {
        var clock = new RoundClock(ticker, time, NullLogger<RoundClock>.Instance);
        await clock.StartAsync(CancellationToken.None);
        await time.TimerCreated.WaitAsync(Timeout);
        return clock;
    }

    [Fact]
    public async Task A_tick_never_runs_on_the_thread_that_moved_the_clock()
    {
        // The regression test for the B6 deadlock. A fake clock fires due timers on whichever thread advances or even
        // reads the time, and the round reads the time while holding its lock. A tick that ran inline there would wait
        // for RoundService's gate with the round's lock held, and deadlock against a buzz holding the gate.
        var time = new ClockTime();
        var movingTheClock = new ThreadLocal<bool>();
        var ranInline = false;
        var ticked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var ticker = new Ticker(_ =>
        {
            ranInline |= movingTheClock.Value;
            ticked.TrySetResult();
            return Task.CompletedTask;
        });
        using var clock = await StartAsync(ticker, time);

        movingTheClock.Value = true;
        time.Advance(RoundClock.Interval);
        movingTheClock.Value = false;

        await ticked.Task.WaitAsync(Timeout);
        Assert.False(ranInline);
        await clock.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task A_tick_that_throws_does_not_stop_the_clock()
    {
        var time = new ClockTime();
        var first = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var second = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var ticker = new Ticker(count =>
        {
            if (count == 1)
            {
                first.TrySetResult();
                throw new InvalidOperationException("tick failed");
            }

            second.TrySetResult();
            return Task.CompletedTask;
        });
        using var clock = await StartAsync(ticker, time);

        time.Advance(RoundClock.Interval);
        await first.Task.WaitAsync(Timeout);
        time.Advance(RoundClock.Interval);

        await second.Task.WaitAsync(Timeout);
        await clock.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Nothing_ticks_until_a_whole_interval_has_passed()
    {
        var time = new ClockTime();
        var ticks = 0;
        var ticked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var ticker = new Ticker(count =>
        {
            ticks = count;
            ticked.TrySetResult();
            return Task.CompletedTask;
        });
        using var clock = await StartAsync(ticker, time);

        time.Advance(RoundClock.Interval - TimeSpan.FromMilliseconds(1));
        Assert.Equal(0, ticks);

        time.Advance(TimeSpan.FromMilliseconds(1));
        await ticked.Task.WaitAsync(Timeout);
        await clock.StopAsync(CancellationToken.None);
    }
}
