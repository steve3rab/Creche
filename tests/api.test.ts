import { it, expect, vi, afterEach } from 'vitest';
import { api } from '../src/services/api';

function jsonResponse(value: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => value,
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

it('envoie la méthode, le corps JSON et l’en-tête associée, puis retourne la réponse', async () => {
  const fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const result = await api<{ ok: boolean }>('/config', 'PUT', { association: 'Test' });
  expect(result).toEqual({ ok: true });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/config');
  expect(options.method).toBe('PUT');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(options.body).toBe(JSON.stringify({ association: 'Test' }));
});

it('n’envoie ni corps ni en-tête Content-Type sans corps fourni', async () => {
  const fetch = vi.fn().mockResolvedValue(jsonResponse([]));
  vi.stubGlobal('fetch', fetch);
  await api('/notes');
  const [, options] = fetch.mock.calls[0];
  expect(options.body).toBeUndefined();
  expect(options.headers).toBeUndefined();
});

it('transforme une erreur réseau en message compréhensible', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
  await expect(api('/config')).rejects.toThrow(
    'Le serveur local est inaccessible. Relancez Filoustics, puis réessayez.',
  );
});

it('distingue un dépassement de délai de l’injoignabilité du serveur', async () => {
  const timeout = new Error('The operation was aborted');
  timeout.name = 'TimeoutError';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
  await expect(api('/config')).rejects.toThrow(
    'Le serveur met trop de temps à répondre. Vérifiez le résultat avant de recommencer.',
  );
});

it('refuse une réponse dont le type de contenu n’est pas JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'text/html' } }),
  );
  await expect(api('/config')).rejects.toThrow('Réponse inattendue du serveur local.');
});

it('refuse une réponse JSON annoncée mais illisible sans lever d’erreur brute', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    }),
  );
  await expect(api('/config')).rejects.toThrow('Réponse inattendue du serveur local.');
});

it('reprend le message d’erreur fourni par le serveur pour une réponse en échec', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ error: 'Identifiant déjà utilisé' }, false, 409)),
  );
  await expect(api('/notes', 'POST', {})).rejects.toThrow('Identifiant déjà utilisé');
});

it('retombe sur un message générique si la réponse en échec ne fournit aucun détail', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
  await expect(api('/notes', 'POST', {})).rejects.toThrow('Erreur du serveur local');
});
