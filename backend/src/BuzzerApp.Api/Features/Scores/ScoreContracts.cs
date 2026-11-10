using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Api.Features.Scores;

public enum ScoreTarget
{
    Team,
    Player,
}

// Every field is nullable so a missing one is reported as a validation error. A non-nullable enum would silently
// become its first member, and a forgotten "direction" would then add points instead of failing.
public sealed record AdjustmentRequest(
    ScoreTarget? Target, int? TargetId, int? Amount, int? Multiplier, ScoreDirection? Direction, string? Reason);

public sealed record AdjustmentResponse(
    long Id,
    ScoreTarget Target,
    int TargetId,
    string TargetName,
    int Amount,
    string? Reason,
    long? ReversesAdjustmentId,
    bool IsReversed,
    DateTimeOffset CreatedAt,
    string CreatedByDisplayName);

public sealed record TeamScoreResponse(int TeamId, string Name, string ColorKey, string IconKey, int Total, int Rank);

public sealed record PlayerScoreResponse(int PlayerId, string DisplayName, string RealName, int? TeamId, string? TeamName, int Total);
