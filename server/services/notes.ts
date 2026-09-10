import {
  actionSchema,
  newBase,
  today,
  type Action,
  type Note,
} from '../../src/domain/models.js';
import type { Storage } from './storage.js';

// A note marked "à affiner" needs an owner and a deadline, which notes don't have —
// so it gets a linked action instead. The link is self-healing: if the action was
// deleted or never created, saving the note (still flagged) creates a fresh one.
export async function saveNote(store: Storage, value: unknown, create = false) {
  let note = { ...(value as Note) };
  if (note.importance === 'AFFINER') {
    const actions = await store.list('actions');
    const linked = note.actionId && actions.some((a) => a.id === note.actionId);
    if (!linked) {
      const action = actionSchema.parse({
        ...newBase(),
        titre: `Affiner la note : ${note.titre}`.slice(0, 240),
        description: 'Créée automatiquement : cette note est marquée « à affiner ».',
        dateCreation: today(),
        statut: 'A_FAIRE',
        noteSource: note.id,
      });
      await store.saveRecord('actions', action, true);
      note = { ...note, actionId: action.id };
    }
  }
  return store.saveRecord('notes', note, create);
}

// Finishing or cancelling the action that a note generated closes the loop: the
// note no longer needs attention, so it drops back to Normal importance.
export async function saveAction(store: Storage, value: unknown, create = false) {
  const action = (await store.saveRecord('actions', value, create)) as Action;
  if (action.noteSource && (action.statut === 'TERMINE' || action.statut === 'ANNULE')) {
    const note = (await store.list('notes')).find((n) => n.id === action.noteSource) as
      | Note
      | undefined;
    if (note && note.importance === 'AFFINER' && note.actionId === action.id)
      await store.saveRecord('notes', { ...note, importance: 'NORMAL', actionId: '' });
  }
  return action;
}
