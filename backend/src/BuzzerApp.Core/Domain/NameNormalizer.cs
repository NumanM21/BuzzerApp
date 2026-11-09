namespace BuzzerApp.Core.Domain;

/// <summary>The single definition of "same name" used by every uniqueness check and sign-in lookup.</summary>
public static class NameNormalizer
{
    public static string Normalize(string value) => value.Trim().ToUpperInvariant();
}
