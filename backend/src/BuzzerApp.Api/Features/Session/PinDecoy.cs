using System.Security.Cryptography;
using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;

namespace BuzzerApp.Api.Features.Session;

/// <summary>
/// Gives sign-in the same cost for unknown names as for wrong PINs. Without it, "no such player" returns
/// instantly while "wrong PIN" pays for a hash, and response time would reveal which real names exist.
/// </summary>
public sealed class PinDecoy
{
    private readonly IPinHasher _hasher;
    private readonly Player _player = new(eventId: 0, "decoy", "decoy", PlayerRole.Player, teamId: null, DateTimeOffset.UnixEpoch);
    private readonly string _hash;

    public PinDecoy(IPinHasher hasher)
    {
        _hasher = hasher;
        // Random, so the decoy can never match a real PIN guess by accident.
        _hash = hasher.Hash(_player, RandomNumberGenerator.GetInt32(10_000).ToString("D4", System.Globalization.CultureInfo.InvariantCulture));
    }

    public void SpendVerifyCost(string pin) => _hasher.Verify(_player, _hash, pin);
}
