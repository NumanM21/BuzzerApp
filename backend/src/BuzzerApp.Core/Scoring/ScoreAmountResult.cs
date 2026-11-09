namespace BuzzerApp.Core.Scoring;

/// <summary>
/// <paramref name="Value"/> is only meaningful when <paramref name="Success"/> is true;
/// <paramref name="Error"/> is a stable code from <see cref="ScoreErrors"/> otherwise.
/// </summary>
public sealed record ScoreAmountResult(bool Success, int Value, string? Error)
{
    public static ScoreAmountResult Ok(int value) => new(true, value, null);

    public static ScoreAmountResult Fail(string error) => new(false, 0, error);
}
