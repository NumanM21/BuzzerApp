using BuzzerApp.Core.Scoring;

namespace BuzzerApp.Core.Tests.Scoring;

public class ScoreMathTests
{
    [Theory]
    [InlineData(10, 1, ScoreDirection.Add, 10)]
    [InlineData(10, 3, ScoreDirection.Add, 30)]
    [InlineData(10, 1, ScoreDirection.Remove, -10)]
    [InlineData(5, 4, ScoreDirection.Remove, -20)]
    public void Valid_input_gives_signed_amount(int amount, int multiplier, ScoreDirection direction, int expected)
    {
        var result = ScoreMath.SignedAmount(amount, multiplier, direction);

        Assert.True(result.Success);
        Assert.Equal(expected, result.Value);
        Assert.Null(result.Error);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(int.MinValue)]
    public void Amount_must_be_positive(int amount)
    {
        var result = ScoreMath.SignedAmount(amount, 1, ScoreDirection.Add);

        Assert.False(result.Success);
        Assert.Equal(ScoreErrors.AmountNotPositive, result.Error);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(101)]
    [InlineData(int.MaxValue)]
    public void Multiplier_outside_1_to_100_is_rejected(int multiplier)
    {
        var result = ScoreMath.SignedAmount(10, multiplier, ScoreDirection.Add);

        Assert.False(result.Success);
        Assert.Equal(ScoreErrors.MultiplierOutOfRange, result.Error);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(100)]
    public void Multiplier_bounds_are_inclusive(int multiplier)
    {
        var result = ScoreMath.SignedAmount(7, multiplier, ScoreDirection.Add);

        Assert.True(result.Success);
        Assert.Equal(7 * multiplier, result.Value);
    }

    [Fact]
    public void Undefined_direction_is_rejected()
    {
        var result = ScoreMath.SignedAmount(10, 1, (ScoreDirection)42);

        Assert.False(result.Success);
        Assert.Equal(ScoreErrors.InvalidDirection, result.Error);
    }

    [Theory]
    [InlineData(ScoreDirection.Add)]
    [InlineData(ScoreDirection.Remove)]
    public void Overflow_is_an_error_not_an_exception(ScoreDirection direction)
    {
        var result = ScoreMath.SignedAmount(int.MaxValue, 2, direction);

        Assert.False(result.Success);
        Assert.Equal(ScoreErrors.Overflow, result.Error);
    }

    [Fact]
    public void Largest_amount_without_overflow_succeeds_both_ways()
    {
        Assert.Equal(int.MaxValue, ScoreMath.SignedAmount(int.MaxValue, 1, ScoreDirection.Add).Value);
        Assert.Equal(-int.MaxValue, ScoreMath.SignedAmount(int.MaxValue, 1, ScoreDirection.Remove).Value);
    }
}
