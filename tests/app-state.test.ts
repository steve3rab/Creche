import { it, expect, vi, afterEach } from 'vitest';
import { run, state, refresh, meetingReminders } from '../src/composables/app';
import { api } from '../src/services/api';
import { newMeeting, configSchema } from '../src/domain/models';
vi.mock('../src/services/api', () => ({ api: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  state.meetings = [];
  state.config = null;
});
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
it('garde l’interface occupée jusqu’à la fin de toutes les opérations', async () => {
  let finish!: () => void;
  const first = run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await run(async () => 42);
  expect(state.busy).toBe(true);
  finish();
  await first;
  expect(state.busy).toBe(false);
});
it('une erreur libère l’état occupé et devient un message intégré', async () => {
  await run(async () => {
    throw new Error('Écriture refusée');
  });
  expect(state.error).toBe('Écriture refusée');
  expect(state.busy).toBe(false);
});
it('une ancienne lecture lente ne remplace pas les données rafraîchies', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(async (url) =>
    url === '/reunions'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : [],
  );
  const old = refresh();
  vi.mocked(api).mockResolvedValue([]);
  await refresh();
  finish([{ id: 'ancienne-reunion' }]);
  await old;
  expect(state.meetings).toEqual([]);
});
it('ne rappelle que les réunions non closes dans la fenêtre de rappel configurée', () => {
  state.config = configSchema.parse({ schemaVersion: 1, association: 'Test', rappelJours: 2 });
  const dans1Jour = { ...newMeeting(), id: 'a', date: daysFromNow(1), statut: 'A_VENIR' as const };
  const dans5Jours = { ...newMeeting(), id: 'b', date: daysFromNow(5), statut: 'A_VENIR' as const };
  const hier = { ...newMeeting(), id: 'c', date: daysFromNow(-1), statut: 'A_VENIR' as const };
  const closeDemain = {
    ...newMeeting(),
    id: 'd',
    date: daysFromNow(1),
    statut: 'CLOTUREE' as const,
  };
  const archiveeDemain = { ...newMeeting(), id: 'e', date: daysFromNow(1), archive: true };
  state.meetings = [dans1Jour, dans5Jours, hier, closeDemain, archiveeDemain];
  expect(meetingReminders.value.map((m) => m.id)).toEqual(['a']);
});
it('respecte le réglage rappelJours quand il change', () => {
  const dans5Jours = { ...newMeeting(), id: 'b', date: daysFromNow(5), statut: 'A_VENIR' as const };
  state.meetings = [dans5Jours];
  state.config = configSchema.parse({ schemaVersion: 1, association: 'Test', rappelJours: 3 });
  expect(meetingReminders.value).toEqual([]);
  state.config = configSchema.parse({ schemaVersion: 1, association: 'Test', rappelJours: 5 });
  expect(meetingReminders.value.map((m) => m.id)).toEqual(['b']);
});
