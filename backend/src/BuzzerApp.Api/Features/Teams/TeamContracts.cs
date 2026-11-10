namespace BuzzerApp.Api.Features.Teams;

/// <summary><c>RealName</c> is JSON null unless the caller is an admin or this is their own row (D19).</summary>
public sealed record MemberResponse(int PlayerId, string DisplayName, string? RealName);

public sealed record TeamResponse(int Id, string Name, string ColorKey, string IconKey, int SortOrder, IReadOnlyList<MemberResponse> Members);

public sealed record TeamSummaryResponse(int Id, string Name, string ColorKey, string IconKey, int SortOrder);

public sealed record CreateTeamRequest(string? Name, string? ColorKey, string? IconKey);

public sealed record RenameTeamRequest(string? Name);
