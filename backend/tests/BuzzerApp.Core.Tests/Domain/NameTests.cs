using BuzzerApp.Core.Domain;

namespace BuzzerApp.Core.Tests.Domain;

public class NameTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("  alice ", "ALICE")]
    [InlineData("Alice", "ALICE")]
    [InlineData("a b", "A B")]
    public void Normalize_trims_and_uppercases(string input, string expected) =>
        Assert.Equal(expected, NameNormalizer.Normalize(input));

    [Fact]
    public void Team_rename_updates_name_and_normalized_name_together()
    {
        var team = new Team(1, "  Rage Quitters ", "red", "rage-quitters", 0, Now);
        Assert.Equal("Rage Quitters", team.Name);
        Assert.Equal("RAGE QUITTERS", team.NormalizedName);

        team.Rename("smurfs  ");

        Assert.Equal("smurfs", team.Name);
        Assert.Equal("SMURFS", team.NormalizedName);
    }

    [Fact]
    public void Player_name_setters_keep_normalized_copies_in_step()
    {
        var player = new Player(1, " Alice Smith ", " Ace ", PlayerRole.Player, teamId: 3, Now);
        Assert.Equal("ALICE SMITH", player.NormalizedRealName);
        Assert.Equal("ACE", player.NormalizedDisplayName);

        player.SetRealName("Alicia Smith");
        player.SetDisplayName("Ace2");

        Assert.Equal("Alicia Smith", player.RealName);
        Assert.Equal("ALICIA SMITH", player.NormalizedRealName);
        Assert.Equal("Ace2", player.DisplayName);
        Assert.Equal("ACE2", player.NormalizedDisplayName);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_names_are_rejected(string blank)
    {
        Assert.Throws<ArgumentException>(() => new Team(1, blank, "red", "x", 0, Now));
        var player = new Player(1, "Alice", "Ace", PlayerRole.Player, null, Now);
        Assert.Throws<ArgumentException>(() => player.SetRealName(blank));
        Assert.Throws<ArgumentException>(() => player.SetDisplayName(blank));
    }
}
