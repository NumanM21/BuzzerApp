namespace BuzzerApp.Api.Common;

public enum ErrorKind
{
    /// <summary>One or more request fields are wrong; <see cref="Error.Fields"/> says which.</summary>
    Validation,
    BadRequest,
    Unauthorized,
    NotFound,
    Conflict,
    TooManyRequests,
}

/// <summary>
/// Why a feature service refused a request, in terms of the app rather than of HTTP. <see cref="ResultHttp"/> is the
/// one place that turns it into a status code and a ProblemDetails body, so services never build responses and every
/// feature reports the same kind of failure the same way.
/// </summary>
public sealed record Error(
    ErrorKind Kind,
    string Title,
    string? Detail = null,
    IReadOnlyDictionary<string, string[]>? Fields = null,
    TimeSpan? RetryAfter = null)
{
    public static Error NotFound(string title, string? detail = null) => new(ErrorKind.NotFound, title, detail);

    public static Error Conflict(string title, string detail) => new(ErrorKind.Conflict, title, detail);

    public static Error BadRequest(string title, string? detail = null) => new(ErrorKind.BadRequest, title, detail);

    public static Error Unauthorized(string title) => new(ErrorKind.Unauthorized, title);

    public static Error TooManyRequests(string title, string detail, TimeSpan retryAfter) =>
        new(ErrorKind.TooManyRequests, title, detail, RetryAfter: retryAfter);

    /// <summary>A single wrong field, for checks that need the database (an unknown team id) and so run after <see cref="ValidationErrors"/>.</summary>
    public static Error Invalid(string field, string message) =>
        new(ErrorKind.Validation, "One or more validation errors occurred.", Fields: new Dictionary<string, string[]> { [field] = [message] });
}

/// <summary>The outcome of a feature service call that returns nothing on success.</summary>
public readonly struct Result
{
    private Result(Error? error) => Error = error;

    public Error? Error { get; }

    public bool IsSuccess => Error is null;

    public static Result Success => default;

    public static implicit operator Result(Error error) => new(error);
}

/// <summary>
/// The outcome of a feature service call: a value, or the <see cref="Error"/> that stopped it. Expected refusals
/// (not found, name taken, invalid input) are results, not exceptions, the same way Core's <c>RoundResult</c> works.
/// </summary>
public readonly struct Result<T>
{
    private readonly T? _value;

    private Result(T value) => _value = value;

    private Result(Error error) => Error = error;

    public Error? Error { get; }

    public bool IsSuccess => Error is null;

    public T Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException($"The result is an error ({Error!.Kind}: {Error.Title}); check IsSuccess first.");

    public static implicit operator Result<T>(T value) => new(value);

    public static implicit operator Result<T>(Error error) => new(error);
}
