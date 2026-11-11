import { describe, expect, it } from 'vitest';
import { PERSON_NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH } from '@/domain/names';
import { FakeThemeCatalog, makePackKeys } from '@/test/fakes/FakeThemeCatalog';
import { flushPromises } from '@/test/flushPromises';
import {
  MAX_PREVIEW_TEAMS,
  MIN_PREVIEW_TEAMS,
  ThemePreviewViewModel,
  UNKNOWN_KEY,
} from './ThemePreviewViewModel';

// The reference example of a view model test: a fake service through the constructor, no React, no network.

const twoPacks = { first: makePackKeys(3, 2), second: makePackKeys(5, 4) };

async function activated(catalog = new FakeThemeCatalog(twoPacks)) {
  const vm = new ThemePreviewViewModel(catalog);
  vm.activate();
  await flushPromises();
  return { vm, catalog };
}

describe('ThemePreviewViewModel', () => {
  it('starts on the first registered pack and loads its keys when activated', async () => {
    const { vm } = await activated();

    expect(vm.packKeys).toEqual(['first', 'second']);
    expect(vm.selectedPackKey).toBe('first');
    expect(vm.isLoading).toBe(false);
    expect(vm.colorCards.map((card) => card.colorKey)).toEqual([...twoPacks.first.colorKeys, UNKNOWN_KEY]);
  });

  it('is loading until the pack keys arrive', () => {
    const catalog = new FakeThemeCatalog(twoPacks, { manual: true });
    const vm = new ThemePreviewViewModel(catalog);

    vm.activate();

    expect(vm.isLoading).toBe(true);
    expect(vm.sampleTeams).toEqual([]);
  });

  it('loads the keys of the pack it switches to', async () => {
    const { vm } = await activated();

    vm.selectPack('second');
    await flushPromises();

    expect(vm.selectedPackKey).toBe('second');
    expect(vm.colorCards).toHaveLength(twoPacks.second.colorKeys.length + 1);
  });

  it('shows the pack selected last when an earlier pack answers late', async () => {
    const catalog = new FakeThemeCatalog(twoPacks, { manual: true });
    const vm = new ThemePreviewViewModel(catalog);
    vm.activate();
    vm.selectPack('second');

    catalog.resolve('second');
    catalog.resolve('first');
    await flushPromises();

    expect(vm.colorCards).toHaveLength(twoPacks.second.colorKeys.length + 1);
  });

  it('ignores a pack key that is not registered', async () => {
    const { vm, catalog } = await activated();
    const callsBefore = catalog.loadCalls.length;

    vm.selectPack('missing');

    expect(vm.selectedPackKey).toBe('first');
    expect(catalog.loadCalls).toHaveLength(callsBefore);
  });

  it('shows an error when the pack keys cannot be loaded', async () => {
    const catalog = new FakeThemeCatalog(twoPacks);
    catalog.loadKeys = () => Promise.reject(new Error('Pack missing'));
    const vm = new ThemePreviewViewModel(catalog);

    vm.activate();
    await flushPromises();

    expect(vm.loadError).toBe('Pack missing');
  });

  it.each([1, 2, 6, 13])('lays out %i sample teams', async (count) => {
    const { vm } = await activated();

    vm.setTeamCount(count);

    expect(vm.sampleTeams).toHaveLength(count);
    expect(new Set(vm.sampleTeams.map((team) => team.id)).size).toBe(count);
  });

  it.each([
    [0, MIN_PREVIEW_TEAMS],
    [-5, MIN_PREVIEW_TEAMS],
    [99, MAX_PREVIEW_TEAMS],
    [4.6, 5],
  ])('clamps a team count of %d to %d', async (requested, expected) => {
    const { vm } = await activated();

    vm.setTeamCount(requested);

    expect(vm.teamCount).toBe(expected);
  });

  it('ignores a team count that is not a number', async () => {
    const { vm } = await activated();
    const before = vm.teamCount;

    vm.setTeamCount(Number.NaN);

    expect(vm.teamCount).toBe(before);
  });

  it('repeats the pack colours and icons when there are more teams than keys', async () => {
    const { vm } = await activated();

    vm.setTeamCount(MAX_PREVIEW_TEAMS);

    const { colorKeys, iconKeys } = twoPacks.first;
    vm.sampleTeams.forEach((team, index) => {
      expect(team.colorKey).toBe(colorKeys[index % colorKeys.length]);
      expect(team.iconKey).toBe(iconKeys[index % iconKeys.length]);
    });
  });

  it('always includes the layout edges: a team with no members and the longest names', async () => {
    const { vm } = await activated();

    vm.setTeamCount(2);
    const [first, second] = vm.sampleTeams;

    expect(first.members).toEqual([]);
    expect(second.name).toHaveLength(TEAM_NAME_MAX_LENGTH);
    expect(second.members[0].displayName).toHaveLength(PERSON_NAME_MAX_LENGTH);
  });

  it('gives every sample member a unique id and marks one viewer', async () => {
    const { vm } = await activated();

    vm.setTeamCount(MAX_PREVIEW_TEAMS);
    const members = vm.sampleTeams.flatMap((team) => team.members);

    expect(new Set(members.map((member) => member.id)).size).toBe(members.length);
    expect(members.filter((member) => member.isViewer)).toHaveLength(1);
  });

  it.each([1, 2, 3, 6, 13])('queues all %i sample teams, with one answering and one marked as the viewer’s', async (count) => {
    const { vm } = await activated();
    vm.setTeamCount(count);

    const queue = vm.sampleQueue;

    expect(queue.map((row) => row.position)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(queue.filter((row) => row.status === 'current')).toHaveLength(1);
    expect(queue.filter((row) => row.isMine)).toHaveLength(1);
    // Queue order is not team order.
    expect(queue.map((row) => row.teamId)).toEqual(vm.sampleTeams.map((team) => team.id).reverse());
  });

  it('leaves the last queued team out of the teams list, to show the fallback look', async () => {
    const { vm } = await activated();
    vm.setTeamCount(4);

    const queue = vm.sampleQueue;

    expect(queue.at(-1)).toMatchObject({ colorKey: '', iconKey: '' });
    expect(queue.slice(0, -1).every((row) => row.colorKey !== '')).toBe(true);
  });

  it('has no queue until the pack keys arrive', () => {
    const vm = new ThemePreviewViewModel(new FakeThemeCatalog(twoPacks, { manual: true }));

    expect(vm.sampleQueue).toEqual([]);
  });

  it('offers every buzzer state once, with a queue position only for queued', async () => {
    const { vm } = await activated();

    expect(vm.buzzerSamples.map((sample) => sample.state)).toEqual([
      'ready',
      'yourTeamUp',
      'queued',
      'out',
      'waiting',
    ]);
    expect(vm.buzzerSamples.filter((sample) => sample.queuePosition !== undefined)).toEqual([
      { state: 'queued', queuePosition: 2 },
    ]);
  });

  it('paints the sample buzzer in the pack’s first team colour', async () => {
    const { vm } = await activated();

    expect(vm.buzzerTeamColorKey).toBe(twoPacks.first.colorKeys[0]);
  });

  it('counts buzzer presses', async () => {
    const { vm } = await activated();

    vm.pressBuzzer();
    vm.pressBuzzer();

    expect(vm.buzzerPresses).toBe(2);
  });
});
