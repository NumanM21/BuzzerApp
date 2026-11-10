using System.Globalization;

namespace BuzzerApp.Api.Common;

/// <summary>Turns a service <see cref="Result{T}"/> into an HTTP response. The only place that maps an <see cref="ErrorKind"/> to a status code.</summary>
public static class ResultHttp
{
    public static IResult ToHttp<T>(this Result<T> result, Func<T, IResult> onSuccess) =>
        result.IsSuccess ? onSuccess(result.Value) : result.Error!.ToHttp();

    public static IResult ToHttp(this Result result, Func<IResult> onSuccess) =>
        result.IsSuccess ? onSuccess() : result.Error!.ToHttp();

    /// <summary>200 with the value as the body.</summary>
    public static IResult ToOk<T>(this Result<T> result) => result.ToHttp(value => Results.Ok(value));

    public static IResult ToHttp(this Error error) => error.Kind switch
    {
        ErrorKind.Validation => Results.ValidationProblem(new Dictionary<string, string[]>(error.Fields ?? new Dictionary<string, string[]>())),
        ErrorKind.TooManyRequests => new RetryAfterResult(error.RetryAfter ?? TimeSpan.Zero, Problem(error, StatusCodes.Status429TooManyRequests)),
        ErrorKind.BadRequest => Problem(error, StatusCodes.Status400BadRequest),
        ErrorKind.Unauthorized => Problem(error, StatusCodes.Status401Unauthorized),
        ErrorKind.NotFound => Problem(error, StatusCodes.Status404NotFound),
        ErrorKind.Conflict => Problem(error, StatusCodes.Status409Conflict),
        _ => throw new ArgumentOutOfRangeException(nameof(error), error.Kind, "Unmapped error kind."),
    };

    /// <summary>Whole seconds, rounded up, as the Retry-After header wants. Shared with the rate-limiter middleware.</summary>
    public static string RetryAfterSeconds(TimeSpan retryAfter) =>
        ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);

    private static IResult Problem(Error error, int statusCode) =>
        Results.Problem(statusCode: statusCode, title: error.Title, detail: error.Detail);

    private sealed class RetryAfterResult(TimeSpan retryAfter, IResult inner) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.Headers.RetryAfter = RetryAfterSeconds(retryAfter);
            return inner.ExecuteAsync(httpContext);
        }
    }
}
