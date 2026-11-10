using System.Text.RegularExpressions;

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

    public ValidationErrors Pin(string field, string? value)
    {
        // [0-9] and \z, not \d and $: \d matches non-ASCII digits and $ allows a trailing newline.
        if (value is null || !FourDigits().IsMatch(value))
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

    [GeneratedRegex(@"^[0-9]{4}\z")]
    private static partial Regex FourDigits();
}
