import type { JoinCodeMemory } from '@/domain/joinCodeMemory';

/** In-memory `JoinCodeMemory`: `code` is what the phone "remembers", `remembered` lists what was written. */
export class FakeJoinCodeMemory implements JoinCodeMemory {
  code: string | undefined;
  readonly remembered: string[] = [];

  constructor(code?: string) {
    this.code = code;
  }

  recall(): string | undefined {
    return this.code;
  }

  remember(code: string): void {
    this.code = code;
    this.remembered.push(code);
  }
}
