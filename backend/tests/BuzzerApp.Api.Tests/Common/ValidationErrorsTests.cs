using BuzzerApp.Api.Common;
using Microsoft.AspNetCore.Http.HttpResults;

namespace BuzzerApp.Api.Tests.Common;

public class ValidationErrorsTests
{
    [Theory]
    [InlineData("Al", false)]
    [InlineData("A", true)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData(null, true)]
    [InlineData("12345678901234567890", false)]   // exactly 20
    [InlineData("123456789012345678901", true)]   // 21
    [InlineData("  Al  ", false)]                  // length is measured after trimming
    [InlineData("  A   ", true)]
    public void PersonName_enforces_2_to_20_characters_after_trim(string? value, bool expectError)
    {
        var errors = new ValidationErrors().PersonName("realName", value, "Real name");

        Assert.Equal(expectError, errors.HasErrors);
    }

    [Theory]
    [InlineData("Ab", false)]
    [InlineData("123456789012345678901234", false)]   // 24
    [InlineData("1234567890123456789012345", true)]   // 25
    [InlineData("A", true)]
    public void TeamName_enforces_2_to_24_characters(string value, bool expectError)
    {
        Assert.Equal(expectError, new ValidationErrors().TeamName("name", value, "Team name").HasErrors);
    }

    [Theory]
    [InlineData("1234", false)]
    [InlineData("0000", false)]
    [InlineData("123", true)]
    [InlineData("12345", true)]
    [InlineData("12a4", true)]
    [InlineData("", true)]
    [InlineData(null, true)]
    [InlineData(" 123", true)]
    [InlineData("1234\n", true)]            // `$` would accept this; `\z` must not
    [InlineData("١٢٣٤", true)]              // Arabic-Indic digits: `\d` would accept these
    public void Pin_must_be_exactly_four_ascii_digits(string? value, bool expectError)
    {
        Assert.Equal(expectError, new ValidationErrors().Pin("pin", value).HasErrors);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData(0, true)]
    [InlineData(-3, true)]
    [InlineData(1, false)]
    public void Positive_rejects_missing_zero_and_negative(int? value, bool expectError)
    {
        Assert.Equal(expectError, new ValidationErrors().Positive("teamId", value, "A team").HasErrors);
    }

    [Fact]
    public void Collects_every_failing_field_so_the_client_sees_them_all_at_once()
    {
        var result = new ValidationErrors()
            .PersonName("realName", "A", "Real name")
            .PersonName("displayName", "", "Display name")
            .Pin("pin", "12a4")
            .ToResult();

        var problem = Assert.IsType<ProblemHttpResult>(result);
        var details = Assert.IsType<Microsoft.AspNetCore.Http.HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.Equal(["displayName", "pin", "realName"], details.Errors.Keys.Order().ToArray());
        Assert.Equal(400, details.Status);
    }

    [Fact]
    public void A_field_reports_a_single_message_even_if_checked_twice()
    {
        var result = new ValidationErrors().Required("joinCode", null, "The join code").Required("joinCode", " ", "The join code");

        Assert.True(result.HasErrors);
    }

    [Fact]
    public void No_errors_means_HasErrors_is_false()
    {
        var errors = new ValidationErrors().PersonName("realName", "Alice", "Real name").Pin("pin", "1234");

        Assert.False(errors.HasErrors);
    }
}
