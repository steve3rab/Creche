export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Le serveur met trop de temps à répondre. Vérifiez le résultat avant de recommencer.'
        : 'Le serveur local est inaccessible. Relancez Filoustics, puis réessayez.',
    );
  }
  if (!res.headers.get('content-type')?.includes('application/json'))
    throw new Error('Réponse inattendue du serveur local. Relancez Filoustics.');
  let value: unknown;
  try {
    value = await res.json();
  } catch {
    throw new Error('Réponse inattendue du serveur local. Relancez Filoustics.');
  }
  if (!res.ok)
    throw new Error(
      typeof value === 'object' && value && 'error' in value
        ? String(value.error)
        : 'Erreur du serveur local',
    );
  return value as T;
}
