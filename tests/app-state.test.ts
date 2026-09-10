import { it, expect, vi, afterEach } from 'vitest';
import { run, state, refresh } from '../src/composables/app';
import { api } from '../src/services/api';
vi.mock('../src/services/api', () => ({ api: vi.fn() }));
afterEach(() => vi.resetAllMocks());
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
