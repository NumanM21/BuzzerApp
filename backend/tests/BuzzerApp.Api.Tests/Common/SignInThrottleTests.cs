using BuzzerApp.Api.Features.Session;

namespace BuzzerApp.Api.Tests.Common;

public class SignInThrottleTests
{
    [Fact]
    public void Allows_five_attempts_then_blocks_the_sixth_with_a_retry_delay()
    {
        using var throttle = new SignInThrottle();

        for (var i = 0; i < SignInThrottle.PermitLimit; i++)
        {
            Assert.True(throttle.TryAcquire("ALICE", out _), $"attempt {i + 1} should be allowed");
        }

        Assert.False(throttle.TryAcquire("ALICE", out var retryAfter));
        Assert.True(retryAfter > TimeSpan.Zero);
        Assert.True(retryAfter <= SignInThrottle.Window);
    }

    [Fact]
    public void Names_are_counted_independently()
    {
        using var throttle = new SignInThrottle();
        for (var i = 0; i < SignInThrottle.PermitLimit; i++)
        {
            throttle.TryAcquire("ALICE", out _);
        }

        Assert.False(throttle.TryAcquire("ALICE", out _));
        Assert.True(throttle.TryAcquire("BOB", out _));
    }

    [Fact]
    public async Task Concurrent_attempts_never_exceed_the_limit()
    {
        using var throttle = new SignInThrottle();

        var results = await Task.WhenAll(Enumerable.Range(0, 50).Select(_ => Task.Run(() => throttle.TryAcquire("ALICE", out TimeSpan _))));

        Assert.Equal(SignInThrottle.PermitLimit, results.Count(allowed => allowed));
    }
}
