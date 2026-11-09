namespace BuzzerApp.Core.Scoring;

// Stable codes rather than messages: the frontend maps them to text and tests assert them,
// so changing a value here is a breaking API change.
public static class ScoreErrors
{
    public const string AmountNotPositive = "score.amountNotPositive";
    public const string MultiplierOutOfRange = "score.multiplierOutOfRange";
    public const string InvalidDirection = "score.invalidDirection";
    public const string Overflow = "score.overflow";
}
