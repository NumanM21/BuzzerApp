using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BuzzerApp.Infrastructure.Persistence;

/// <summary>
/// Reads what a failed save means. Lives next to the DbContext so the PostgreSQL-specific part (SQLSTATE codes) stays
/// in Infrastructure and the Api only asks "was that a unique violation?".
/// </summary>
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

    /// <summary>True when the unique index that failed covers the given column, e.g. to say which of two names clashed.</summary>
    public static bool IsUniqueViolationOn(this DbUpdateException ex, string column) =>
        ex.IsUniqueViolation(out var constraint) && constraint is not null && constraint.Contains(column, StringComparison.Ordinal);

    /// <summary>
    /// True when the save failed on a foreign key. A delete guard that checks "is anything using this?" first can still
    /// lose a race with a request inserting a referencing row, and the Restrict FK is what stops it.
    /// </summary>
    public static bool IsForeignKeyViolation(this DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation };
}
