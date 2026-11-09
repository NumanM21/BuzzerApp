using BuzzerApp.Core.Domain;

namespace BuzzerApp.Core.Security;

public enum PinVerifyResult
{
    Failed,
    Success,

    /// <summary>The PIN is right but the stored hash uses outdated settings; the caller should save a fresh hash.</summary>
    SuccessRehashNeeded,
}

public interface IPinHasher
{
    string Hash(Player player, string pin);
    PinVerifyResult Verify(Player player, string hash, string pin);
}
