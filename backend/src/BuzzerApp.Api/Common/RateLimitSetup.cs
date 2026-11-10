using System.Threading.RateLimiting;

namespace BuzzerApp.Api.Common;

public static class RateLimitPolicies
{
    public const string JoinCode = "join-code";
}

public static class RateLimitSetup
{
    // Generous on purpose (D24): the whole venue shares one public IP, and ~40 people join within the same few minutes.
    // Each phone loads the team list (again on every refocus) and then registers, so the join rush alone is well over
    // 100 requests a minute; the original 30 would have turned people away. 300 still makes guessing a join code slow.
    private const int DefaultPerIpPermitLimit = 300;

    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        // Configurable so a deployment can tune it without a release, and so tests (which all share one IP) can change it.
        var perIpPermitLimit = config.GetValue("RateLimiting:JoinCodePerMinute", DefaultPerIpPermitLimit);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (ctx, _) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    ctx.HttpContext.Response.Headers.RetryAfter = ResultHttp.RetryAfterSeconds(retryAfter);
                }

                // No body written here: UseStatusCodePages turns the empty 429 into ProblemDetails.
                return ValueTask.CompletedTask;
            };

            options.AddPolicy(RateLimitPolicies.JoinCode, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = perIpPermitLimit,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));
        });
        return services;
    }
}
