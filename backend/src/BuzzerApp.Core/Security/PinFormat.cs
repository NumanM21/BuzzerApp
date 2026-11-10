namespace BuzzerApp.Core.Security;

/// <summary>
/// The single definition of a valid PIN, used by registration, sign-in and the seeded admins. Two definitions drifted
/// apart once (one accepted non-ASCII digits), which would have let an admin PIN be configured that sign-in refuses.
/// </summary>
public static class PinFormat
{
    public const int Length = 4;

    // ASCII digits only: char.IsDigit also accepts digits from other scripts, which a phone's number pad can't type.
    public static bool IsValid(string? pin) => pin is { Length: Length } && pin.All(char.IsAsciiDigit);
}
