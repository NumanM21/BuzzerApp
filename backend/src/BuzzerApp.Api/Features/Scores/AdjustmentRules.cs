using BuzzerApp.Api.Common;
using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Api.Features.Scores;

/// <summary>A score adjustment request that has passed every check that doesn't need the database.</summary>
public sealed record AdjustmentDraft(ScoreTarget Target, int TargetId, int SignedAmount, string? Reason);

/// <summary>
/// The rules for a score adjustment request that need no database: which fields are required, the amount and
/// multiplier limits (Core's <see cref="ScoreMath"/>), and the reason. Pure, so every invalid combination is a unit
/// test instead of an HTTP request against PostgreSQL.
/// </summary>
public static class AdjustmentRules
{
    public const int MaxReasonLength = 200;   // the column is varchar(200)

    public static Result<AdjustmentDraft> Validate(AdjustmentRequest request)
    {
        var errors = new ValidationErrors();
        if (request.Target is not (ScoreTarget.Team or ScoreTarget.Player))
        {
            errors.Error("target", "Target must be \"team\" or \"player\".");
        }

        errors.Positive("targetId", request.TargetId, "Target id");

        if (request.Amount is null)
        {
            errors.Error("amount", "Amount is required.");
        }

        if (request.Direction is null)
        {
            errors.Error("direction", "Direction must be \"add\" or \"remove\".");
        }

        // Stand-ins for a missing amount or direction (already reported above) let ScoreMath still check the other
        // fields, so one response lists every problem. A draft is only returned when there are no errors, so the
        // stand-ins never reach the ledger.
        var math = ScoreMath.SignedAmount(request.Amount ?? 1, request.Multiplier ?? ScoreMath.MinMultiplier, request.Direction ?? ScoreDirection.Add);
        if (!math.Success)
        {
            AddMathError(errors, math.Error);
        }

        // Blank is "no reason", stored as null.
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        if (reason is { Length: > MaxReasonLength })
        {
            errors.Error("reason", $"Reason must be at most {MaxReasonLength} characters.");
        }

        if (errors.HasErrors)
        {
            return errors.ToError();
        }

        return new AdjustmentDraft(request.Target!.Value, request.TargetId!.Value, math.Value, reason);
    }

    /// <summary>
    /// Totals are summed as long and shown as int, and a ledger row can never be edited, so a row that would take a
    /// total outside int has to be refused before it is written: once it exists every leaderboard with that target breaks.
    /// </summary>
    public static bool FitsInTotal(long currentTotal, long delta) =>
        currentTotal + delta is >= int.MinValue and <= int.MaxValue;

    private static void AddMathError(ValidationErrors errors, string? code)
    {
        switch (code)
        {
            case ScoreErrors.AmountNotPositive:
                errors.Error("amount", "Amount must be greater than 0.");
                break;
            case ScoreErrors.MultiplierOutOfRange:
                errors.Error("multiplier", $"Multiplier must be between {ScoreMath.MinMultiplier} and {ScoreMath.MaxMultiplier}.");
                break;
            case ScoreErrors.InvalidDirection:
                errors.Error("direction", "Direction must be \"add\" or \"remove\".");
                break;
            case ScoreErrors.Overflow:
                errors.Error("amount", "Amount multiplied by the multiplier is too large.");
                break;
            default:
                errors.Error("amount", "The amount is not valid.");
                break;
        }
    }
}
