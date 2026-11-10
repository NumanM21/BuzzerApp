using System.Globalization;
using System.Security.Claims;
using BuzzerApp.Core.Domain;

namespace BuzzerApp.Api.Common;

/// <summary>
/// The signed-in caller, taken from the auth cookie's claims only. Team and names are not claims,
/// so anything needing them must query the DB.
/// </summary>
public interface ICurrentUser
{
    int PlayerId { get; }
    int EventId { get; }
    bool IsAdmin { get; }
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal Principal => accessor.HttpContext?.User
        ?? throw new InvalidOperationException("There is no active HTTP request.");

    public int PlayerId => ReadInt(AppClaims.PlayerId);
    public int EventId => ReadInt(AppClaims.EventId);
    public bool IsAdmin => Principal.IsInRole(nameof(PlayerRole.Admin));

    // A missing or malformed claim means the endpoint was reachable without the auth policy; failing loudly beats guessing an id.
    private int ReadInt(string claimType) =>
        int.TryParse(Principal.FindFirstValue(claimType), NumberStyles.None, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw new InvalidOperationException($"The '{claimType}' claim is missing or invalid; is this endpoint authorized?");

    public static ClaimsPrincipal CreatePrincipal(Player player, string authenticationType)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(AppClaims.PlayerId, player.Id.ToString(CultureInfo.InvariantCulture)),
            new Claim(AppClaims.EventId, player.EventId.ToString(CultureInfo.InvariantCulture)),
            new Claim(AppClaims.Role, player.Role.ToString()),
        ], authenticationType, nameType: AppClaims.PlayerId, roleType: AppClaims.Role);
        return new ClaimsPrincipal(identity);
    }
}
