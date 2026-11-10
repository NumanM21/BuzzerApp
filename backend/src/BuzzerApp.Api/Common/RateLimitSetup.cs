using System.Threading.RateLimiting;

namespace BuzzerApp.Api.Common;

public static class RateLimitPolicies
{
    public const string JoinCode = "join-code";
}

public static class RateLimitSetup
{
    // Generous on purpose (D24): the whole venue shares one public IP, and ~40 people register within minutes.
    private const int PerIpPermitLimit = 30;

    public static IServiceCollection AddAppRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (ctx, _) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
                }

                // No body written here: UseStatusCodePages turns the empty 429 into ProblemDetails.
                return ValueTask.CompletedTask;
            };

            options.AddPolicy(RateLimitPolicies.JoinCode, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = PerIpPermitLimit,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0,
                    }));
        });
        return services;
    }
}
