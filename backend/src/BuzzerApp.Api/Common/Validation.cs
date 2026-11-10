using System.Text.RegularExpressions;
using BuzzerApp.Core.Security;

namespace BuzzerApp.Api.Common;

/// <summary>Collects field errors so a request reports every problem at once instead of one per round trip.</summary>
public sealed partial class ValidationErrors
{
    public const int PersonNameMin = 2;
    public const int PersonNameMax = 20;
    public const int TeamNameMin = 2;
    public const int TeamNameMax = 24;

    private readonly Dictionary<string, string[]> _errors = [];

    public bool HasErrors => _errors.Count > 0;

    public ValidationErrors PersonName(string field, string? value, string label) =>
        Length(field, value, PersonNameMin, PersonNameMax, label);

    public ValidationErrors TeamName(string field, string? value, string label) =>
        Length(field, value, TeamNameMin, TeamNameMax, label);

    /// <summary>For PATCH bodies: null means "leave unchanged", anything else must be a valid name.</summary>
    public ValidationErrors OptionalPersonName(string field, string? value, string label) =>
        value is null ? this : PersonName(field, value, label);

    /// <summary>
    /// A colour or icon key. Lower-case only, because the unique index on a team's colour compares exact strings:
    /// accepting "Red" next to "red" would let a second team take the same colour.
    /// </summary>
    public ValidationErrors Key(string field, string? value, string label)
    {
        if (value is null || !KeyPattern().IsMatch(value.Trim()))
        {
            Add(field, $"{label} must be 1–50 lower-case letters, digits or hyphens.");
        }

        return this;
    }

    public ValidationErrors Error(string field, string message)
    {
        Add(field, message);
        return this;
    }

    public ValidationErrors Pin(string field, string? value)
    {
        if (!PinFormat.IsValid(value))
        {
            Add(field, "The PIN must be exactly 4 digits.");
        }

        return this;
    }

    public ValidationErrors Required(string field, string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            Add(field, $"{label} is required.");
        }

        return this;
    }

    public ValidationErrors Positive(string field, int? value, string label)
    {
        if (value is null or <= 0)
        {
            Add(field, $"{label} is required.");
        }

        return this;
    }

    public IResult ToResult() => Results.ValidationProblem(_errors);

    private ValidationErrors Length(string field, string? value, int min, int max, string label)
    {
        var length = value?.Trim().Length ?? 0;
        if (length < min || length > max)
        {
            Add(field, $"{label} must be {min}–{max} characters.");
        }

        return this;
    }

    private void Add(string field, string message) => _errors[field] = [message];

    [GeneratedRegex(@"^[a-z0-9-]{1,50}\z")]
    private static partial Regex KeyPattern();
}
