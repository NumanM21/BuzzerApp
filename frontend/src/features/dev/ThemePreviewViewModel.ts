import { makeAutoObservable } from 'mobx';
import { buzzerVisualStates, type BuzzerVisualState } from '@/domain/buzzer';
import { PERSON_NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH } from '@/domain/names';
import { buildQueueRows, type QueueRow } from '@/domain/queueRows';
import type { TeamQueueEntry } from '@/domain/round';
import type { PackKeys, ThemeCatalog } from '@/domain/themeCatalog';
import { Loadable } from '@/mvvm/Loadable';

export const MIN_PREVIEW_TEAMS = 1;
export const MAX_PREVIEW_TEAMS = 13;
const INITIAL_PREVIEW_TEAMS = 4;

/** A key no pack uses, to show what a pack draws for a key it doesn't know. */
export const UNKNOWN_KEY = 'not-in-this-pack';

export interface PreviewMember {
  id: number;
  displayName: string;
  realName: string | null;
  isViewer: boolean;
}

export interface BuzzerSample {
  state: BuzzerVisualState;
  /** Set for `queued`, the one state that shows a position. */
  queuePosition?: number;
}

export interface PreviewTeam {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  members: PreviewMember[];
}

/**
 * The `/dev/theme` page: which pack to preview, how many teams to lay out, and sample data built from the selected
 * pack's own keys. It knows the pack's keys but nothing about how they look; the view draws them with the theme.
 *
 * This is the reference example of a view model: dependencies through the constructor, server-style data in a
 * `Loadable`, state changed only through methods, and everything the view shows exposed as ready-made getters.
 */
export class ThemePreviewViewModel {
  selectedPackKey: string;
  teamCount = INITIAL_PREVIEW_TEAMS;
  /** Counts buzzer presses, so a phone can show that one tap is one press. */
  buzzerPresses = 0;
  readonly packKeys: readonly string[];
  readonly buzzerSamples: readonly BuzzerSample[] = buzzerVisualStates.map((state) =>
    state === 'queued' ? { state, queuePosition: 2 } : { state },
  );
  readonly sampleScores: readonly number[] = [0, 7, 120, -15, 99999];

  private readonly themes: ThemeCatalog;
  private readonly keys: Loadable<PackKeys>;

  constructor(themes: ThemeCatalog) {
    this.themes = themes;
    this.packKeys = themes.themeKeys;
    this.selectedPackKey = themes.themeKeys[0] ?? '';
    // The fetcher reads the selected key when it runs, so `load()` always loads the pack selected at that moment.
    this.keys = new Loadable(() => this.themes.loadKeys(this.selectedPackKey));
    // Injected services and values that never change aren't state: `false` keeps MobX from wrapping them in proxies.
    // (A store or a Loadable passed in is fine either way; it is already observable.)
    makeAutoObservable<ThemePreviewViewModel, 'themes' | 'keys'>(
      this,
      { themes: false, keys: false, packKeys: false, buzzerSamples: false, sampleScores: false },
      { autoBind: true },
    );
  }

  activate(): void {
    void this.keys.ensureLoaded();
  }

  selectPack(packKey: string): void {
    if (packKey === this.selectedPackKey || !this.packKeys.includes(packKey)) {
      return;
    }
    this.selectedPackKey = packKey;
    void this.keys.load();
  }

  setTeamCount(count: number): void {
    if (!Number.isFinite(count)) {
      return;
    }
    this.teamCount = Math.min(MAX_PREVIEW_TEAMS, Math.max(MIN_PREVIEW_TEAMS, Math.round(count)));
  }

  pressBuzzer(): void {
    this.buzzerPresses += 1;
  }

  get isLoading(): boolean {
    return this.keys.value === undefined && this.keys.isLoading;
  }

  get loadError(): string | undefined {
    return this.keys.error?.message;
  }

  /** The team colour the sample buzzers use for the states that take the player's team colour. */
  get buzzerTeamColorKey(): string {
    return this.keys.value?.colorKeys[0] ?? UNKNOWN_KEY;
  }

  /**
   * `teamCount` teams as the grids will see them. Colours and icons repeat when there are more teams than the pack
   * has keys. The edges a layout must survive are always present: the first team has no members, and the second
   * has the longest allowed team name and a member with the longest allowed display name.
   */
  get sampleTeams(): PreviewTeam[] {
    const { colorKeys, iconKeys } = this.keys.value ?? { colorKeys: [], iconKeys: [] };
    if (colorKeys.length === 0 || iconKeys.length === 0) {
      return [];
    }
    let nextMemberId = 1;
    return Array.from({ length: this.teamCount }, (_, index) => {
      const teamNumber = index + 1;
      const memberCount = index % 4;
      const members = Array.from({ length: memberCount }, (_, memberIndex): PreviewMember => {
        const id = nextMemberId++;
        return {
          id,
          displayName: teamNumber === 2 ? longName('Player', PERSON_NAME_MAX_LENGTH) : `Player ${id}`,
          realName: memberIndex === 0 ? `Real Name ${id}` : null,
          isViewer: id === 1,
        };
      });
      return {
        id: teamNumber,
        name: teamNumber === 2 ? longName('Team', TEAM_NAME_MAX_LENGTH) : `Team ${teamNumber}`,
        colorKey: colorKeys[index % colorKeys.length],
        iconKey: iconKeys[index % iconKeys.length],
        members,
      };
    });
  }

  /**
   * The sample teams as a queue, in the opposite order to the team list (a queue's order is the buzz order, not the
   * teams' order): the first third have answered wrong, the next is answering, the rest wait. The viewer's team is
   * the third in line, and with two or more teams the last one is missing from the "teams list", so its row shows
   * the pack's fallback visual.
   */
  get sampleQueue(): QueueRow[] {
    const teams = [...this.sampleTeams].reverse();
    const passedCount = Math.floor(teams.length / 3);
    const queue: TeamQueueEntry[] = teams.map((team, index) => ({
      position: index + 1,
      teamId: team.id,
      teamName: team.name,
      buzzedByDisplayName: `Player ${team.id}`,
      status: index < passedCount ? 'passed' : index === passedCount ? 'current' : 'waiting',
    }));
    const known = teams.length > 1 ? teams.slice(0, -1) : teams;
    const looks = new Map(known.map((team) => [team.id, { colorKey: team.colorKey, iconKey: team.iconKey }]));
    return buildQueueRows(queue, teams[Math.min(2, teams.length - 1)]?.id, looks);
  }

  /** One card per team colour in the pack, spares included, then one for a key the pack doesn't know. */
  get colorCards(): PreviewTeam[] {
    const { colorKeys, iconKeys } = this.keys.value ?? { colorKeys: [], iconKeys: [] };
    if (colorKeys.length === 0 || iconKeys.length === 0) {
      return [];
    }
    const cards = colorKeys.map((colorKey, index) => ({
      id: index + 1,
      name: colorKey,
      colorKey,
      iconKey: iconKeys[index % iconKeys.length],
      members: [],
    }));
    return [
      ...cards,
      { id: cards.length + 1, name: 'Fallback', colorKey: UNKNOWN_KEY, iconKey: UNKNOWN_KEY, members: [] },
    ];
  }
}

/** `prefix` padded with letters to exactly `length` characters, e.g. "Team Abcdefghijklmnopqrs". */
function longName(prefix: string, length: number): string {
  const filler = 'Abcdefghijklmnopqrstuvwxyz';
  return `${prefix} ${filler}`.slice(0, length);
}
