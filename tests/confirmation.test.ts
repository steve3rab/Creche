import { it, expect } from 'vitest';
import { askConfirmation, answerConfirmation, confirmation } from '../src/composables/confirmation';

it('résout avec la réponse donnée et libère l’état en attente', async () => {
  const pending = askConfirmation('Confirmer ?');
  expect(confirmation.value?.message).toBe('Confirmer ?');
  answerConfirmation(true);
  await expect(pending).resolves.toBe(true);
  expect(confirmation.value).toBeUndefined();
});

it('refuse un second appel pendant qu’une confirmation est déjà en attente', async () => {
  const first = askConfirmation('Première question ?');
  const second = askConfirmation('Deuxième question ?');
  await expect(second).resolves.toBe(false);
  // The first request must be untouched by the rejected second call.
  expect(confirmation.value?.message).toBe('Première question ?');
  answerConfirmation(true);
  await expect(first).resolves.toBe(true);
});

it('accepte une nouvelle question une fois la précédente résolue', async () => {
  const first = askConfirmation('Une question ?');
  answerConfirmation(false);
  await expect(first).resolves.toBe(false);
  const second = askConfirmation('Une autre question ?');
  answerConfirmation(true);
  await expect(second).resolves.toBe(true);
});
