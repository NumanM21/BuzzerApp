namespace BuzzerApp.Api.Features.Event;

public sealed record EventInfoResponse(string Name, int Year, string ThemeKey);

public sealed record JoinTeamResponse(int Id, string Name, string ColorKey, string IconKey, int MemberCount);
