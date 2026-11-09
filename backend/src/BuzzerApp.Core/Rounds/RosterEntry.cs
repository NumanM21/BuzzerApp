namespace BuzzerApp.Core.Rounds;

// Display name only, never the real name: snapshots built from the roster go to every player.
public sealed record RosterEntry(int PlayerId, string DisplayName, int TeamId, string TeamName);
