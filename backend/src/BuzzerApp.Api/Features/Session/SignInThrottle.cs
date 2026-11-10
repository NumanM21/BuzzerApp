using System.Threading.RateLimiting;

namespace BuzzerApp.Api.Features.Session;

/// <summary>
/// Limits sign-in attempts per real name (D24). The rate-limiter middleware runs before the body is read,
/// so it can't see the name; the handler calls this instead. Everyone at the venue shares one public IP,
/// so a per-IP limit here would lock the whole family out after a few typos.
/// </summary>
public sealed class SignInThrottle : IDisposable
{
    public const int PermitLimit = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(5);

    private readonly PartitionedRateLimiter<string> _limiter = PartitionedRateLimiter.Create<string, string>(
        normalizedRealName => RateLimitPartition.GetFixedWindowLimiter(normalizedRealName, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = PermitLimit,
            Window = Window,
            QueueLimit = 0,
        }));

    /// <summary>Counts one attempt. Unknown names are counted too, so the limit can't be used to discover which names exist.</summary>
    public bool TryAcquire(string normalizedRealName, out TimeSpan retryAfter)
    {
        using var lease = _limiter.AttemptAcquire(normalizedRealName);
        if (lease.IsAcquired)
        {
            retryAfter = TimeSpan.Zero;
            return true;
        }

        retryAfter = lease.TryGetMetadata(MetadataName.RetryAfter, out var value) ? value : Window;
        return false;
    }

    public void Dispose() => _limiter.Dispose();
}
