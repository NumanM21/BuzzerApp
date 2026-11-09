namespace BuzzerApp.Core.Rounds;

/// <summary>
/// Game-rule outcomes are values, not exceptions. <c>Changed</c> is independent of <c>Success</c>:
/// a buzz that arrives after the grace window fails but still locks the round, so the caller
/// must broadcast and persist even though the buzz itself was rejected.
/// </summary>
public sealed record RoundResult(bool Success, string? Error, bool Changed)
{
    public static RoundResult Ok(bool changed = true) => new(true, null, changed);

    public static RoundResult Fail(string error, bool changed = false) => new(false, error, changed);
}
