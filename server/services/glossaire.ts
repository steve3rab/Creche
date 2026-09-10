import { glossaryEntrySchema, type GlossaryEntry } from '../../src/domain/models.js';
import { DataError, type Storage } from './storage.js';

// Two entries sharing a key would make "@clé" expansion ambiguous, so the key must
// be unique across the glossary (case-insensitive, since typing rarely matches case).
export async function saveGlossaryEntry(store: Storage, value: unknown, create = false) {
  const entry = glossaryEntrySchema.parse(value);
  const rows = (await store.list('glossaire')) as GlossaryEntry[];
  const duplicate = rows.find(
    (r) => r.id !== entry.id && r.cle.toLocaleLowerCase('fr') === entry.cle.toLocaleLowerCase('fr'),
  );
  if (duplicate) throw new DataError('Cette clé est déjà utilisée.', 409);
  return store.saveRecord('glossaire', entry, create);
}
