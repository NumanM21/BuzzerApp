namespace BuzzerApp.Api.Features.Archive;

public sealed record FinalizeResponse(int EventId, int Year, int SchemaVersion, DateTimeOffset FinalizedAt);

/// <summary>The exported document, ready to download. Not JSON-serialised itself: the endpoint sends the bytes as a file.</summary>
public sealed record ArchiveFile(byte[] Content, string FileName);
