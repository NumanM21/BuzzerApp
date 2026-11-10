using BuzzerApp.Core.Security;

namespace BuzzerApp.Core.Tests.Security;

public class PinFormatTests
{
    [Theory]
    [InlineData("0000")]
    [InlineData("1234")]
    [InlineData("9876")]
    public void Four_ascii_digits_are_valid(string pin) => Assert.True(PinFormat.IsValid(pin));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("12345")]
    [InlineData("12a4")]
    [InlineData(" 123")]
    [InlineData("1234\n")]
    [InlineData("١٢٣٤")]   // Arabic-Indic digits: digits to char.IsDigit, but not what a PIN pad types
    public void Anything_else_is_not(string? pin) => Assert.False(PinFormat.IsValid(pin));
}
