using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BuzzerApp.Api.Common;

public static class DbErrors
{
    /// <summary>
    /// True when the save failed on a unique index. The pre-check queries can't see a row another request is
    /// inserting right now, so the index is the real guard and this is how its failure becomes a 409.
    /// </summary>
    public static bool IsUniqueViolation(this DbUpdateException ex, out string? constraintName)
    {
        if (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg)
        {
            constraintName = pg.ConstraintName;
            return true;
        }

        constraintName = null;
        return false;
    }
}
