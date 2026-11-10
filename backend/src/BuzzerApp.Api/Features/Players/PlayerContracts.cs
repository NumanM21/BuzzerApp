using BuzzerApp.Core.Domain;

namespace BuzzerApp.Api.Features.Players;

public sealed record PlayerResponse(int Id, string RealName, string DisplayName, PlayerRole Role, int? TeamId, string? TeamName);

/// <summary>A null field means "leave it as it is".</summary>
public sealed record EditNamesRequest(string? DisplayName, string? RealName);

public sealed record MovePlayerRequest(int? TeamId);
