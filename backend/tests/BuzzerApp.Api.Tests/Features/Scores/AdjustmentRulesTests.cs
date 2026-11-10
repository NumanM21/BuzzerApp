using BuzzerApp.Api.Common;
using BuzzerApp.Api.Features.Scores;
using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Api.Tests.Features.Scores;

/// <summary>The checks on a score adjustment request that need no database. No host, no PostgreSQL.</summary>
public class AdjustmentRulesTests
{
    private static AdjustmentRequest Request(
        ScoreTarget? target = ScoreTarget.Team, int? targetId = 7, int? amount = 5, int? multiplier = null,
        ScoreDirection? direction = ScoreDirection.Add, string? reason = null) =>
        new(target, targetId, amount, multiplier, direction, reason);

    private static IReadOnlyDictionary<string, string[]> FieldsOf(Result<AdjustmentDraft> result)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorKind.Validation, result.Error!.Kind);
        return result.Error.Fields!;
    }

    [Theory]
    [InlineData(ScoreTarget.Team, 5, null, ScoreDirection.Add, 5)]
    [InlineData(ScoreTarget.Player, 5, null, ScoreDirection.Remove, -5)]
    [InlineData(ScoreTarget.Team, 5, 1, ScoreDirection.Add, 5)]
    [InlineData(ScoreTarget.Team, 5, 3, ScoreDirection.Add, 15)]
    [InlineData(ScoreTarget.Player, 4, 100, ScoreDirection.Remove, -400)]
    public void A_valid_request_becomes_a_draft_with_the_signed_amount(
        ScoreTarget target, int amount, int? multiplier, ScoreDirection direction, int expectedSigned)
    {
        var result = AdjustmentRules.Validate(Request(target, targetId: 12, amount, multiplier, direction));

        Assert.True(result.IsSuccess);
        Assert.Equal(new AdjustmentDraft(target, 12, expectedSigned, null), result.Value);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("  bonus round  ", "bonus round")]
    public void The_reason_is_trimmed_and_a_blank_one_is_no_reason(string? typed, string? stored)
    {
        Assert.Equal(stored, AdjustmentRules.Validate(Request(reason: typed)).Value.Reason);
    }

    [Fact]
    public void A_reason_of_exactly_the_column_length_is_allowed_and_one_more_is_not()
    {
        Assert.True(AdjustmentRules.Validate(Request(reason: new string('x', AdjustmentRules.MaxReasonLength))).IsSuccess);
        Assert.Equal(["reason"], FieldsOf(AdjustmentRules.Validate(Request(reason: new string('x', AdjustmentRules.MaxReasonLength + 1)))).Keys);
    }

    public static TheoryData<ScoreTarget?, int?, int?, int?, ScoreDirection?, string> Invalid => new()
    {
        // target,          targetId, amount,       multiplier, direction,             the field that must be reported
        { null,             7,        5,            null,       ScoreDirection.Add,    "target" },
        { (ScoreTarget)7,   7,        5,            null,       ScoreDirection.Add,    "target" },      // a number that is no enum member
        { ScoreTarget.Team, null,     5,            null,       ScoreDirection.Add,    "targetId" },
        { ScoreTarget.Team, 0,        5,            null,       ScoreDirection.Add,    "targetId" },
        { ScoreTarget.Team, -3,       5,            null,       ScoreDirection.Add,    "targetId" },
        { ScoreTarget.Team, 7,        null,         null,       ScoreDirection.Add,    "amount" },
        { ScoreTarget.Team, 7,        0,            null,       ScoreDirection.Add,    "amount" },
        { ScoreTarget.Team, 7,        -5,           null,       ScoreDirection.Add,    "amount" },
        { ScoreTarget.Team, 7,        int.MaxValue, 2,          ScoreDirection.Add,    "amount" },      // overflows when multiplied
        { ScoreTarget.Team, 7,        5,            0,          ScoreDirection.Add,    "multiplier" },
        { ScoreTarget.Team, 7,        5,            -1,         ScoreDirection.Add,    "multiplier" },
        { ScoreTarget.Team, 7,        5,            101,        ScoreDirection.Add,    "multiplier" },
        { ScoreTarget.Team, 7,        5,            null,       null,                  "direction" },   // a missing direction must not default to "add"
        { ScoreTarget.Team, 7,        5,            null,       (ScoreDirection)7,     "direction" },
    };

    [Theory]
    [MemberData(nameof(Invalid))]
    public void An_invalid_field_is_reported_by_name_and_no_draft_is_made(
        ScoreTarget? target, int? targetId, int? amount, int? multiplier, ScoreDirection? direction, string field)
    {
        var result = AdjustmentRules.Validate(Request(target, targetId, amount, multiplier, direction));

        Assert.Equal([field], FieldsOf(result).Keys);
    }

    [Fact]
    public void Every_invalid_field_is_reported_in_one_go()
    {
        // A missing amount and direction must not hide the bad multiplier: the form shows all four problems at once.
        var result = AdjustmentRules.Validate(new AdjustmentRequest(null, null, null, 500, null, new string('x', 300)));

        Assert.Equal(["amount", "direction", "multiplier", "reason", "target", "targetId"], FieldsOf(result).Keys.Order());
    }

    [Theory]
    [InlineData(0L, 5L, true)]
    [InlineData(int.MaxValue - 5L, 5L, true)]       // lands exactly on the largest total
    [InlineData(int.MaxValue - 5L, 6L, false)]
    [InlineData(int.MinValue + 5L, -5L, true)]      // and exactly on the smallest
    [InlineData(int.MinValue + 5L, -6L, false)]
    [InlineData((long)int.MaxValue, (long)int.MinValue, true)]
    public void A_row_fits_only_if_the_new_total_stays_an_int(long current, long delta, bool fits)
    {
        Assert.Equal(fits, AdjustmentRules.FitsInTotal(current, delta));
    }
}
