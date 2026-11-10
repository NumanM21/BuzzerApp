using System.Security.Claims;
using BuzzerApp.Api.Common;
using BuzzerApp.Core.Domain;
using Microsoft.AspNetCore.Http;

namespace BuzzerApp.Api.Tests.Common;

public class CurrentUserTests
{
    private static Player MakePlayer(PlayerRole role, int id = 7, int eventId = 3) =>
        new(eventId, "Real Name", "Display", role, teamId: role == PlayerRole.Player ? 2 : null, DateTimeOffset.UnixEpoch) { Id = id };

    private static CurrentUser For(ClaimsPrincipal principal) =>
        new(new HttpContextAccessor { HttpContext = new DefaultHttpContext { User = principal } });

    [Fact]
    public void The_cookie_principal_carries_only_player_id_event_id_and_role()
    {
        var principal = CurrentUser.CreatePrincipal(MakePlayer(PlayerRole.Player), "test");

        // D23: a team id or a name in the cookie would go stale after a move or rename.
        Assert.Equal(
            new[] { AppClaims.EventId, AppClaims.PlayerId, AppClaims.Role }.Order().ToArray(),
            principal.Claims.Select(c => c.Type).Order().ToArray());
    }

    [Fact]
    public void Reads_player_event_and_role_back_from_the_claims()
    {
        var user = For(CurrentUser.CreatePrincipal(MakePlayer(PlayerRole.Player, id: 7, eventId: 3), "test"));

        Assert.Equal(7, user.PlayerId);
        Assert.Equal(3, user.EventId);
        Assert.False(user.IsAdmin);
    }

    [Fact]
    public void An_admin_role_claim_makes_IsAdmin_true()
    {
        var user = For(CurrentUser.CreatePrincipal(MakePlayer(PlayerRole.Admin), "test"));

        Assert.True(user.IsAdmin);
    }

    [Fact]
    public void A_missing_claim_fails_loudly_instead_of_returning_a_default_id()
    {
        var user = For(new ClaimsPrincipal(new ClaimsIdentity()));

        Assert.Throws<InvalidOperationException>(() => user.PlayerId);
        Assert.Throws<InvalidOperationException>(() => user.EventId);
    }

    [Fact]
    public void A_malformed_claim_fails_loudly()
    {
        var identity = new ClaimsIdentity([new Claim(AppClaims.PlayerId, "abc")], "test");

        Assert.Throws<InvalidOperationException>(() => For(new ClaimsPrincipal(identity)).PlayerId);
    }

    [Fact]
    public void Without_an_http_request_it_throws()
    {
        var user = new CurrentUser(new HttpContextAccessor());

        Assert.Throws<InvalidOperationException>(() => user.IsAdmin);
    }
}
