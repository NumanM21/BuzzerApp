import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { FinalizeResponse } from '@/api/types';
import { deferred } from '@/test/deferred';
import { makeFinalizeResponse } from '@/test/factories';
import { FakeArchiveApi } from '@/test/fakes/FakeArchiveApi';
import { EventAdminViewModel } from './EventAdminViewModel';

function setup() {
  const archive = new FakeArchiveApi();
  archive.finalizeResponse = makeFinalizeResponse({
    eventId: 7,
    year: 2031,
    finalizedAt: '2031-01-01T23:15:00.000Z',
  });
  return { vm: new EventAdminViewModel(archive), archive };
}

describe('EventAdminViewModel', () => {
  describe('before anything is finalized', () => {
    it('has no export link and no finalize time', () => {
      const { vm } = setup();

      expect(vm.exportUrl).toBeUndefined();
      expect(vm.exportFileName).toBeUndefined();
      expect(vm.finalizedText).toBeUndefined();
      expect(vm.isConfirming).toBe(false);
    });

    it('asks before finalizing: nothing is sent until it is confirmed', () => {
      const { vm, archive } = setup();

      vm.askToFinalize();

      expect(vm.isConfirming).toBe(true);
      expect(archive.calls).toEqual([]);
    });

    it('sends nothing when the confirmation is cancelled', () => {
      const { vm, archive } = setup();
      vm.askToFinalize();

      vm.cancel();

      expect(vm.isConfirming).toBe(false);
      expect(archive.calls).toEqual([]);
      expect(vm.exportUrl).toBeUndefined();
    });
  });

  describe('finalizing', () => {
    it('closes the confirmation and offers the export link for the finalized event', async () => {
      const { vm, archive } = setup();
      vm.askToFinalize();

      await vm.confirm();

      expect(archive.calls).toEqual(['finalize']);
      expect(vm.isConfirming).toBe(false);
      expect(vm.exportUrl).toBe('/api/archive/7/export');
      expect(vm.exportFileName).toBe('buzzer-archive-2031.json');
    });

    it('says when it was finalized, in the viewer’s time', async () => {
      const { vm } = setup();
      vm.askToFinalize();

      await vm.confirm();

      expect(vm.finalizedText).toMatch(/^Finalized at \d{1,2}[:.]\d{2}/);
    });

    it('can be repeated: the newest answer replaces the earlier one', async () => {
      const { vm, archive } = setup();
      vm.askToFinalize();
      await vm.confirm();
      archive.finalizeResponse = makeFinalizeResponse({ eventId: 7, year: 2031, finalizedAt: '2031-01-02T08:00:00.000Z' });
      const first = vm.finalizedText;

      vm.askToFinalize();
      await vm.confirm();

      expect(archive.calls).toEqual(['finalize', 'finalize']);
      expect(vm.finalizedText).not.toBe(first);
    });

    it('sends only one finalize however often confirm is tapped', async () => {
      const { vm, archive } = setup();
      const answer = deferred<FinalizeResponse>();
      let sent = 0;
      archive.finalize = () => {
        sent += 1;
        return answer.promise;
      };
      vm.askToFinalize();

      const presses = [vm.confirm(), vm.confirm(), vm.confirm()];
      expect(vm.form.isSubmitting).toBe(true);
      answer.resolve(makeFinalizeResponse());
      await Promise.all(presses);

      expect(sent).toBe(1);
    });
  });

  describe('when the server refuses', () => {
    it('keeps the confirmation open and shows the server’s sentence, with no export link', async () => {
      const { vm, archive } = setup();
      archive.failNext(ApiError.network());
      vm.askToFinalize();

      await vm.confirm();

      expect(vm.isConfirming).toBe(true);
      expect(vm.form.formError).toBe('Could not reach the server. Check your connection and try again.');
      expect(vm.exportUrl).toBeUndefined();
    });

    it('does not show an old error when the confirmation is opened again', async () => {
      const { vm, archive } = setup();
      archive.failNext(ApiError.network());
      vm.askToFinalize();
      await vm.confirm();
      vm.cancel();

      vm.askToFinalize();

      expect(vm.form.formError).toBeUndefined();
    });

    it('works on the next try', async () => {
      const { vm, archive } = setup();
      archive.failNext(ApiError.network());
      vm.askToFinalize();
      await vm.confirm();

      await vm.confirm();

      expect(vm.isConfirming).toBe(false);
      expect(vm.exportUrl).toBe('/api/archive/7/export');
    });
  });
});
