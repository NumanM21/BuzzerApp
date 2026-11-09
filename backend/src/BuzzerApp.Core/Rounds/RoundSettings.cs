namespace BuzzerApp.Core.Rounds;

public sealed record RoundSettings
{
    public TimeSpan GraceWindow { get; init; } = TimeSpan.FromSeconds(2);

    public int MaxRecordedBuzzes { get; init; } = 100;
}
