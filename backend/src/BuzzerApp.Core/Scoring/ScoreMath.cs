namespace BuzzerApp.Core.Scoring;

public static class ScoreMath
{
    public const int MinMultiplier = 1;
    public const int MaxMultiplier = 100;

    /// <summary>
    /// Turns the admin's "amount × multiplier, add or remove" input into the signed value stored
    /// on a ledger row. Invalid input is returned as an error rather than thrown, because it comes
    /// straight from a request body.
    /// </summary>
    public static ScoreAmountResult SignedAmount(int amount, int multiplier, ScoreDirection direction)
    {
        if (amount <= 0)
        {
            return ScoreAmountResult.Fail(ScoreErrors.AmountNotPositive);
        }

        if (multiplier is < MinMultiplier or > MaxMultiplier)
        {
            return ScoreAmountResult.Fail(ScoreErrors.MultiplierOutOfRange);
        }

        // Enum values from JSON aren't guaranteed to be defined members.
        if (direction is not (ScoreDirection.Add or ScoreDirection.Remove))
        {
            return ScoreAmountResult.Fail(ScoreErrors.InvalidDirection);
        }

        int magnitude;
        try
        {
            magnitude = checked(amount * multiplier);
        }
        catch (OverflowException)
        {
            return ScoreAmountResult.Fail(ScoreErrors.Overflow);
        }

        // Negating a positive int can't overflow (only int.MinValue can't be negated).
        return ScoreAmountResult.Ok(direction == ScoreDirection.Remove ? -magnitude : magnitude);
    }
}
