// The server's JSON shapes (docs/FrontendSteps.md Appendix A), written exactly as the server sends them.
// F0 needs only the team shapes for the test factories; F2 adds the rest.

export interface Member {
  playerId: number;
  displayName: string;
  /** Present for admins and on the caller's own row only. */
  realName: string | null;
}

export interface Team {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  sortOrder: number;
  members: Member[];
}
