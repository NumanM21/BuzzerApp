namespace BuzzerApp.Core.Archive;

// Plain inputs for ArchiveBuilder: the caller (the endpoint) reads the database, Core never sees EF.
// The ids exist only to link players to teams; they are not written into the document.

public sealed record ArchiveTeamInput(int Id, string Name, string ColorKey, string IconKey, int Total);

/// <summary>Admins are passed in too (they may have ledger rows from before a promotion); the builder is what leaves them out.</summary>
public sealed record ArchivePlayerInput(int Id, string DisplayName, string RealName, int? TeamId, bool IsAdmin, int Total);
