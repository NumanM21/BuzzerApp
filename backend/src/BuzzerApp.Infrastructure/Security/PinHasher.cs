using BuzzerApp.Core.Domain;
using BuzzerApp.Core.Security;
using Microsoft.AspNetCore.Identity;

namespace BuzzerApp.Infrastructure.Security;

/// <summary>Adapter so Core and the Api depend on <see cref="IPinHasher"/> while Identity's hashing stays in Infrastructure.</summary>
public sealed class PinHasher : IPinHasher
{
    private readonly PasswordHasher<Player> _hasher = new();

    public string Hash(Player player, string pin) => _hasher.HashPassword(player, pin);

    public PinVerifyResult Verify(Player player, string hash, string pin) =>
        _hasher.VerifyHashedPassword(player, hash, pin) switch
        {
            PasswordVerificationResult.Success => PinVerifyResult.Success,
            PasswordVerificationResult.SuccessRehashNeeded => PinVerifyResult.SuccessRehashNeeded,
            _ => PinVerifyResult.Failed,
        };
}
