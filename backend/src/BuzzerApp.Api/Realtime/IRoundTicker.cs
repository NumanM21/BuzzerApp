namespace BuzzerApp.Api.Realtime;

/// <summary>
/// What <see cref="RoundClock"/> drives. An interface so the clock can be tested on its own, without a round, a hub or
/// a database behind it.
/// </summary>
public interface IRoundTicker
{
    /// <summary>Locks the round if its grace window has passed. Safe to call at any time, from any thread.</summary>
    Task TickAsync();
}
