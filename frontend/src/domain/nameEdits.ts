/** A person's two names as the server has them; the real name is null when the viewer may not see it. */
export interface PersonNames {
  displayName: string;
  realName: string | null;
}

/** Only the names that changed, so the server leaves the others alone (a missing field means "unchanged"). */
export interface NameChanges {
  displayName?: string;
  realName?: string;
}

/**
 * What to send after an edit. Names are compared after trimming (the server trims too), so adding a trailing space
 * is no change, while "bob" → "Bob" is. An empty result means "just close the dialog": nothing is sent.
 */
export function changedNames(original: PersonNames, edited: { displayName: string; realName: string }): NameChanges {
  const changes: NameChanges = {};
  const displayName = edited.displayName.trim();
  const realName = edited.realName.trim();
  if (displayName !== original.displayName.trim()) {
    changes.displayName = displayName;
  }
  if (realName !== (original.realName ?? '').trim()) {
    changes.realName = realName;
  }
  return changes;
}
