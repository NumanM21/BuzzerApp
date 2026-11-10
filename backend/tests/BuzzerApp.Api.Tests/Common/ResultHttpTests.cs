using BuzzerApp.Api.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.DependencyInjection;

namespace BuzzerApp.Api.Tests.Common;

/// <summary>The one mapping from a service's <see cref="Error"/> to an HTTP response, and the Result types around it.</summary>
public class ResultHttpTests
{
    public static TheoryData<Error, int> Problems => new()
    {
        { Error.BadRequest("Only players can be on a team.", "Admins don't belong to a team."), 400 },
        { Error.Unauthorized("Your session is no longer valid."), 401 },
        { Error.NotFound("Team not found."), 404 },
        { Error.NotFound("No archive for that event.", "Finalize the event first."), 404 },
        { Error.Conflict("Conflict.", "A team with that name already exists."), 409 },
    };

    [Theory]
    [MemberData(nameof(Problems))]
    public void Each_kind_of_error_is_a_problem_with_its_own_status_title_and_detail(Error error, int status)
    {
        var problem = Assert.IsType<ProblemHttpResult>(error.ToHttp());

        Assert.Equal(status, problem.StatusCode);
        Assert.Equal(error.Title, problem.ProblemDetails.Title);
        Assert.Equal(error.Detail, problem.ProblemDetails.Detail);
    }

    [Fact]
    public void Every_error_kind_is_mapped()
    {
        // A new kind added to the enum without a status code would otherwise only fail on the first request that hits it.
        foreach (var kind in Enum.GetValues<ErrorKind>())
        {
            Assert.NotNull(new Error(kind, "title").ToHttp());
        }
    }

    [Fact]
    public void A_validation_error_is_a_400_listing_the_fields()
    {
        var error = new ValidationErrors().TeamName("name", "A", "Team name").Pin("pin", "12").ToError();

        var problem = Assert.IsType<ProblemHttpResult>(error.ToHttp());

        Assert.Equal(400, problem.StatusCode);
        var details = Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.Equal(["name", "pin"], details.Errors.Keys.Order());
    }

    [Fact]
    public void A_single_invalid_field_reads_the_same_as_one_from_the_validator()
    {
        var problem = Assert.IsType<ProblemHttpResult>(Error.Invalid("teamId", "Choose one of the listed teams.").ToHttp());

        var details = Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.Equal(["Choose one of the listed teams."], details.Errors["teamId"]);
    }

    [Theory]
    [InlineData(0.2, "1")]      // rounded up: "retry after 0 seconds" would invite an immediate retry
    [InlineData(1.0, "1")]
    [InlineData(299.1, "300")]
    public async Task Too_many_requests_is_a_429_with_retry_after_in_whole_seconds(double seconds, string header)
    {
        var http = new DefaultHttpContext { RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider() };
        http.Response.Body = new MemoryStream();

        await Error.TooManyRequests("Too many sign-in attempts.", "Wait a few minutes before trying again.", TimeSpan.FromSeconds(seconds))
            .ToHttp().ExecuteAsync(http);

        Assert.Equal(429, http.Response.StatusCode);
        Assert.Equal(header, http.Response.Headers.RetryAfter.ToString());
    }

    [Fact]
    public void A_successful_result_gives_its_value_to_the_success_mapping()
    {
        Result<string> result = "made";

        var http = result.ToHttp(value => Results.Created("/somewhere", value));

        Assert.True(result.IsSuccess);
        Assert.Equal("made", Assert.IsType<Created<string>>(http).Value);
    }

    [Fact]
    public void A_failed_result_never_reaches_the_success_mapping_and_has_no_value()
    {
        Result<string> result = Error.NotFound("Team not found.");

        var http = result.ToHttp(_ => throw new InvalidOperationException("must not be called"));

        Assert.False(result.IsSuccess);
        Assert.Equal(404, Assert.IsType<ProblemHttpResult>(http).StatusCode);
        Assert.Throws<InvalidOperationException>(() => result.Value);
    }

    [Fact]
    public void A_result_without_a_value_maps_success_and_failure_the_same_way()
    {
        Result deleted = Result.Success;
        Result refused = Error.Conflict("Conflict.", "This team has players.");

        Assert.IsType<NoContent>(deleted.ToHttp(Results.NoContent));
        Assert.Equal(409, Assert.IsType<ProblemHttpResult>(refused.ToHttp(Results.NoContent)).StatusCode);
    }
}
