import fs from 'node:fs/promises';
const url = 'http://127.0.0.1:4317/api';
async function request(endpoint, body) {
  const response = await fetch(url + endpoint, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data;
}
const expectedWorkspace = process.argv[2];
if (!expectedWorkspace) throw new Error('Indiquez le répertoire de données attendu.');
const setup = await request('/setup');
if (setup.workspace.toLowerCase() !== expectedWorkspace.toLowerCase())
  throw new Error('Le répertoire actif ne correspond pas à celui attendu.');
const notes = JSON.parse(
  await fs.readFile(new URL('./data/notes-initiales.json', import.meta.url), 'utf8'),
);
const existing = await request('/notes');
let created = 0;
for (const note of notes) {
  if (existing.some((item) => item.id === note.id)) continue;
  const now = new Date().toISOString();
  await request('/notes', { ...note, schemaVersion: 1, createdAt: now, updatedAt: now });
  created++;
}
const saved = await request('/notes');
if (!notes.every((note) => saved.some((item) => item.id === note.id)))
  throw new Error('Import incomplet.');
console.log(`${created} notes créées ; ${notes.length} notes du texte fourni présentes.`);
