namespace BuzzerApp.Core.Rounds;

// Stable codes rather than messages: the frontend maps them to text and tests assert them,
// so changing a value here is a breaking API change.
public static class RoundErrors
{
    public const string NotIdle = "round.notIdle";
    public const string NotOpen = "round.notOpen";
    public const string WindowClosed = "round.windowClosed";
    public const string UnknownPlayer = "round.unknownPlayer";
    public const string NotLocked = "round.notLocked";
    public const string EmptyRoster = "round.emptyRoster";
    public const string DuplicatePlayer = "round.duplicatePlayer";
}
