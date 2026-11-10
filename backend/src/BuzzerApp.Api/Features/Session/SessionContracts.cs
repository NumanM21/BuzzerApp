using BuzzerApp.Core.Domain;

namespace BuzzerApp.Api.Features.Session;

public sealed record RegisterRequest(string? JoinCode, string? RealName, string? DisplayName, string? Pin, int? TeamId);

public sealed record SignInRequest(string? JoinCode, string? RealName, string? Pin);

public sealed record MeResponse(int PlayerId, string RealName, string DisplayName, PlayerRole Role, int? TeamId, string? TeamName);
