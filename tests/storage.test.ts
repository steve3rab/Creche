import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Storage, atomicJson } from '../server/services/storage';
import { saveNote, saveAction } from '../server/services/notes';
import { saveGlossaryEntry } from '../server/services/glossaire';
import {
  newMeeting,
  meetingSchema,
  meetingFolder,
  configSchema,
  newBase,
  memberSchema,
  noteSchema,
  glossaryEntrySchema,
  shiftSchema,
  contactSchema,
} from '../src/domain/models';
let dir: string, s: Storage;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'filoustics-unit-'));
  s = new Storage(dir);
  await s.init(
    configSchema.parse({ schemaVersion: 1, association: 'Association test', retention: 3 }),
  );
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
describe('Stockage réel dans un répertoire temporaire', () => {
  it('ouvre un ancien dossier sans notes et restaure les sauvegardes avant et après leur ajout', async () => {
    const file = await s.safe('notes.json');
    await fs.rm(file);
    expect(await s.list('notes')).toEqual([]);
    await s.verify();
    await expect(fs.access(file)).rejects.toThrow();
    const legacy = await s.snapshot();
    const note = noteSchema.parse({
      ...newBase(),
      titre: 'Repère',
      contenu: 'Texte conservé',
      categorie: 'Fonctionnement',
    });
    await s.saveRecord('notes', note, true);
    const restored = await s.restore(legacy.id);
    expect(await s.list('notes')).toEqual([]);
    await s.restore(restored.recovery);
    expect(await s.list('notes')).toMatchObject([{ titre: 'Repère', contenu: 'Texte conservé' }]);
  });
  it('restaure une note depuis la corbeille et refuse d’écraser un fichier de notes corrompu', async () => {
    const note = noteSchema.parse({
      ...newBase(),
      titre: 'CAF',
      contenu: 'Financement',
      categorie: 'Partenaires',
    });
    await s.saveRecord('notes', note, true);
    await s.deleteRecord('notes', note.id);
    const [trash] = await s.trash();
    await s.restoreTrash(trash.id);
    expect(await s.list('notes')).toHaveLength(1);
    const file = await s.safe('notes.json');
    await fs.writeFile(file, '{CORROMPU');
    await expect(s.saveRecord('notes', note)).rejects.toThrow('Fichier invalide');
    expect(await fs.readFile(file, 'utf8')).toBe('{CORROMPU');
  });
  it('convertit un ancien membre en mémoire puis sauvegarde l’original avant édition', async () => {
    const original = {
      schemaVersion: 1,
      items: [
        {
          ...newBase(),
          nom: 'Martin',
          prenom: 'Léa',
          fonction: 'Membre',
          dateEntree: '2020-01-01',
        },
      ],
    };
    const file = await s.safe('membres.json');
    await fs.writeFile(file, JSON.stringify(original));
    const [member] = await s.list('membres');
    expect(member).toMatchObject({ nomComplet: 'Léa Martin', prenomEnfant: '' });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual(original);
    await s.saveRecord('membres', { ...member, prenomEnfant: 'Milo' });
    expect((await s.list('membres'))[0]).toMatchObject({ dateEntree: '2020-01-01' });
    const [backup] = await s.backups();
    expect(
      JSON.parse(await fs.readFile(await s.safe(`sauvegardes/${backup.id}/membres.json`), 'utf8')),
    ).toEqual(original);
    await s.restore(backup.id);
    expect((await s.list('membres'))[0]).toMatchObject({
      nomComplet: 'Léa Martin',
      prenomEnfant: '',
    });
  });
  it('archive un PV validé sans le déverrouiller', async () => {
    const m = await s.saveMeeting(newMeeting(), true);
    const locked = await s.setValidation(m.id, true);
    const archived = await s.setArchive(m.id, true);
    expect(archived.archive).toBe(true);
    expect(archived.pvValideLe).toBe(locked.pvValideLe);
    await expect(s.saveMeeting(archived)).rejects.toThrow('PV validé');
  });
  it('conserve le dossier et les documents lors d’un changement de date', async () => {
    const m = await s.saveMeeting(newMeeting(), true),
      file = await s.meetingFile(m.id);
    const updated = await s.saveMeeting({ ...m, date: '2027-01-12', type: 'BUREAU' });
    expect(await s.meetingFile(m.id)).toBe(file);
    expect((await s.meeting(m.id)).date).toBe('2027-01-12');
    expect((await s.saveMeeting({ ...updated, lieu: 'Nouveau lieu' })).lieu).toBe('Nouveau lieu');
  });
  it('refuse une sauvegarde altérée sans toucher aux données actuelles', async () => {
    const m = await s.saveMeeting(newMeeting(), true),
      b = await s.snapshot();
    const file = await s.safe(`sauvegardes/${b.id}/config.json`);
    const c = JSON.parse(await fs.readFile(file, 'utf8'));
    c.association = 'Modifiée';
    await fs.writeFile(file, JSON.stringify(c));
    await expect(s.restore(b.id)).rejects.toThrow('Intégrité');
    expect((await s.meeting(m.id)).id).toBe(m.id);
    expect((await s.config()).association).toBe('Association test');
  });
  it('bloque les modifications après une restauration interrompue', async () => {
    await fs.writeFile(await s.safe('restauration-en-cours.json'), '{}');
    await expect(s.saveMeeting(newMeeting(), true)).rejects.toThrow('Restauration interrompue');
  });
  it('initialise, crée, lit et modifie une réunion', async () => {
    let m = await s.saveMeeting(newMeeting(), true);
    expect(await s.meeting(m.id)).toEqual(m);
    m = await s.saveMeeting({ ...m, lieu: 'Salle verte' });
    expect((await s.meeting(m.id)).lieu).toBe('Salle verte');
    expect(await s.verify()).toEqual({ ok: true });
  });
  it('retrouve une réunion et son fichier malgré les PDF et HTML voisins dans son dossier', async () => {
    const m = await s.saveMeeting(newMeeting(), true);
    const dir = await s.meetingDir(m.id);
    for (const name of ['Convocation.pdf', 'OrdreDuJour.pdf', 'PV.pdf', 'PV.html'])
      await fs.writeFile(await s.safe(`${dir}/${name}`), 'contenu factice');
    expect(await s.meetings()).toHaveLength(1);
    expect((await s.meeting(m.id)).id).toBe(m.id);
    const { meeting, file } = await s.meetingWithFile(m.id);
    expect(meeting.id).toBe(m.id);
    expect(file).toBe(await s.meetingFile(m.id));
    await expect(s.meetingWithFile(crypto.randomUUID())).rejects.toThrow('introuvable');
  });
  it('sauvegarde et restaure un état complet', async () => {
    let m = await s.saveMeeting(newMeeting(), true);
    const b = await s.snapshot();
    m = await s.saveMeeting({ ...m, lieu: 'Nouveau' });
    await s.restore(b.id);
    expect((await s.meeting(m.id)).lieu).toBe('À la crèche');
  });
  it('préserve l’original lors d’une interruption avant rename et nettoie le tmp', async () => {
    const m = await s.saveMeeting(newMeeting(), true),
      file = await s.safe(`${meetingFolder(m)}/reunion.json`);
    await expect(
      atomicJson(file, { ...m, lieu: 'Interrompu' }, meetingSchema, async () => {
        throw new Error('Coupure simulée');
      }),
    ).rejects.toThrow('Coupure');
    expect(meetingSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')))).toEqual(m);
    expect((await s.files('reunions')).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });
  it('refuse de réécrire un JSON corrompu et restaure une sauvegarde', async () => {
    const m = await s.saveMeeting(newMeeting(), true),
      b = await s.snapshot(),
      file = await s.safe(`${meetingFolder(m)}/reunion.json`);
    await fs.writeFile(file, '{CORROMPU');
    await expect(s.saveMeeting({ ...m, lieu: 'Ne pas écrire' })).rejects.toThrow(
      'Fichier invalide',
    );
    expect(await fs.readFile(file, 'utf8')).toBe('{CORROMPU');
    await s.restore(b.id);
    expect((await s.meeting(m.id)).id).toBe(m.id);
  });
  it('déplace une réunion dans la corbeille et la restaure', async () => {
    const m = await s.saveMeeting(newMeeting(), true);
    await s.deleteRecord('reunions', m.id);
    expect(await s.meetings()).toHaveLength(0);
    const [t] = await s.trash();
    await s.restoreTrash(t.id);
    expect(await s.meeting(m.id)).toEqual(m);
  });
  it('supprime un membre de façon récupérable puis vide la corbeille avec sauvegarde', async () => {
    const m = memberSchema.parse({
      ...newBase(),
      nom: 'Test',
      prenom: 'Marie',
      fonction: 'Membre',
    });
    await s.saveRecord('membres', m, true);
    await s.deleteRecord('membres', m.id);
    const [t] = await s.trash();
    await s.restoreTrash(t.id);
    expect(await s.list('membres')).toHaveLength(1);
    await s.deleteRecord('membres', m.id);
    await s.emptyTrash();
    expect(await s.trash()).toHaveLength(0);
    expect((await s.backups()).length).toBeGreaterThan(0);
  });
  it('refuse traversée, jonctions, modifications de PV validé et écriture obsolète', async () => {
    await expect(s.safe('../secret')).rejects.toThrow();
    const m = await s.saveMeeting(newMeeting(), true);
    await s.saveMeeting({ ...m, lieu: 'V2' });
    await expect(s.saveMeeting({ ...m, lieu: 'Obsolète' })).rejects.toThrow('changé');
    const locked = await s.setValidation(m.id, true);
    await expect(s.saveMeeting(locked)).rejects.toThrow('PV validé');
    const open = await s.setValidation(m.id, false);
    expect((await s.saveMeeting(open)).pvValideLe).toBeNull();
  });
  it('borne le nombre de sauvegardes', async () => {
    for (let i = 0; i < 5; i++) await s.snapshot();
    expect(await s.backups()).toHaveLength(3);
  });
  it('une note « à affiner » génère une action, qui la ramène à Normal une fois terminée', async () => {
    const note = noteSchema.parse({
      ...newBase(),
      titre: 'Revoir le barème CNAF',
      contenu: 'À reformuler avec le trésorier.',
      categorie: 'Réglementation',
      importance: 'AFFINER',
    });
    const saved = (await saveNote(s, note, true)) as typeof note & { actionId: string };
    expect(saved.actionId).toBeTruthy();
    const actions = await s.list('actions');
    expect(actions).toMatchObject([
      { titre: 'Affiner la note : Revoir le barème CNAF', statut: 'A_FAIRE', noteSource: note.id },
    ]);
    const [action] = actions;

    // Re-saving the still-flagged note must not create a second action.
    await saveNote(s, saved);
    expect(await s.list('actions')).toHaveLength(1);

    // Completing the linked action drops the note back to Normal and clears the link.
    await saveAction(s, { ...action, statut: 'TERMINE' });
    const [reverted] = await s.list('notes');
    expect(reverted).toMatchObject({ importance: 'NORMAL', actionId: '' });
  });
  it('recrée l’action liée si elle a été supprimée pendant que la note reste « à affiner »', async () => {
    const note = noteSchema.parse({
      ...newBase(),
      titre: 'Vérifier les coordonnées CRIP',
      contenu: 'À jour chaque année.',
      categorie: 'Réglementation',
      importance: 'AFFINER',
    });
    const saved = (await saveNote(s, note, true)) as typeof note & { actionId: string };
    await s.deleteRecord('actions', saved.actionId);
    expect(await s.list('actions')).toHaveLength(0);
    const resaved = (await saveNote(s, saved)) as typeof note & { actionId: string };
    expect(resaved.actionId).toBeTruthy();
    expect(resaved.actionId).not.toBe(saved.actionId);
    expect(await s.list('actions')).toHaveLength(1);
  });
  it('lit un glossaire absent comme une liste vide (anciens dossiers)', async () => {
    expect(await s.list('glossaire')).toEqual([]);
    await s.verify();
  });
  it('refuse deux entrées de glossaire avec la même clé, sans tenir compte de la casse', async () => {
    const first = glossaryEntrySchema.parse({
      ...newBase(),
      cle: 'CRIP',
      valeur: 'Cellule de Recueil des Informations Préoccupantes',
      description: '',
    });
    const saved = await saveGlossaryEntry(s, first, true);
    const second = glossaryEntrySchema.parse({
      ...newBase(),
      cle: 'crip',
      valeur: 'Doublon',
      description: '',
    });
    await expect(saveGlossaryEntry(s, second, true)).rejects.toThrow('déjà utilisée');
    expect(await s.list('glossaire')).toHaveLength(1);

    // Re-saving the same entry under its own key must not conflict with itself.
    const updated = await saveGlossaryEntry(s, { ...saved, valeur: 'Mise à jour' });
    expect(updated).toMatchObject({ valeur: 'Mise à jour' });
  });
  it('étiquette une entrée de glossaire supprimée avec sa clé, pas son identifiant', async () => {
    const entry = await saveGlossaryEntry(
      s,
      glossaryEntrySchema.parse({
        ...newBase(),
        cle: 'pmi',
        valeur: 'Protection',
        description: '',
      }),
      true,
    );
    await s.deleteRecord('glossaire', entry.id);
    const [trash] = await s.trash();
    expect(trash.label).toBe('pmi');
    await s.restoreTrash(trash.id);
    expect(await s.list('glossaire')).toMatchObject([{ cle: 'pmi' }]);
  });
  it('bloque les jonctions hors du dossier', async () => {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), 'filoustics-outside-'));
    try {
      await fs.symlink(external, path.join(dir, 'link'), 'junction');
      await expect(s.safe('link/secret.json')).rejects.toThrow('jonctions');
    } finally {
      await fs.rm(path.join(dir, 'link'));
      await fs.rm(external, { recursive: true });
    }
  });
  it('ouvre un ancien dossier sans planning ni contacts et les traite comme vides', async () => {
    await fs.rm(await s.safe('planning.json'));
    await fs.rm(await s.safe('contacts.json'));
    expect(await s.list('planning')).toEqual([]);
    expect(await s.list('contacts')).toEqual([]);
    await s.verify();
    const legacySnapshot = await s.snapshot();
    const shift = shiftSchema.parse({
      ...newBase(),
      date: '2026-09-15',
      heureDebut: '08:00',
      heureFin: '12:00',
      membreId: crypto.randomUUID(),
      membre: 'Léa Martin',
    });
    await s.saveRecord('planning', shift, true);
    expect(await s.list('planning')).toHaveLength(1);
    await s.restore(legacySnapshot.id);
    expect(await s.list('planning')).toEqual([]);
  });
  it('crée, modifie et étiquette dans la corbeille un créneau de garde par sa date et son heure', async () => {
    const shift = await s.saveRecord(
      'planning',
      shiftSchema.parse({
        ...newBase(),
        date: '2026-09-15',
        heureDebut: '08:00',
        heureFin: '12:00',
        membreId: crypto.randomUUID(),
        membre: 'Léa Martin',
      }),
      true,
    );
    const updated = await s.saveRecord('planning', { ...shift, heureFin: '13:00' });
    expect(updated.heureFin).toBe('13:00');
    await s.deleteRecord('planning', shift.id);
    const [trash] = await s.trash();
    expect(trash.label).toBe('2026-09-15 08:00–13:00');
    await s.restoreTrash(trash.id);
    expect(await s.list('planning')).toMatchObject([{ heureFin: '13:00' }]);
  });
  it('crée une série hebdomadaire de créneaux partageant un serieId, bornée à deux ans', async () => {
    const membreId = crypto.randomUUID();
    const created = await s.saveShiftSeries({
      date: '2026-09-01',
      jusquau: '2026-09-22',
      heureDebut: '08:00',
      heureFin: '12:00',
      membreId,
      membre: 'Léa Martin',
      notes: '',
    });
    expect(created.map((c) => c.date)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
    ]);
    expect(new Set(created.map((c) => c.serieId)).size).toBe(1);
    expect(new Set(created.map((c) => c.id)).size).toBe(created.length);
    expect(await s.list('planning')).toHaveLength(4);
    await expect(
      s.saveShiftSeries({
        date: '2026-01-01',
        jusquau: '2028-06-01',
        heureDebut: '08:00',
        heureFin: '12:00',
        membreId,
        membre: 'Léa Martin',
        notes: '',
      }),
    ).rejects.toThrow('deux ans');
  });
  it('modifie uniquement les occurrences futures d’une série', async () => {
    const membreId = crypto.randomUUID();
    const [first, , third] = await s.saveShiftSeries({
      date: '2026-09-01',
      jusquau: '2026-09-15',
      heureDebut: '08:00',
      heureFin: '12:00',
      membreId,
      membre: 'Léa Martin',
      notes: '',
    });
    const updated = await s.updateShiftSeries(first.serieId, third.date, {
      heureDebut: '09:00',
      heureFin: '13:00',
      membreId,
      membre: 'Hugo Petit',
      notes: 'Changement',
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: third.id, heureDebut: '09:00', membre: 'Hugo Petit' });
    const all = await s.list('planning');
    expect(all.find((row) => row.id === first.id)).toMatchObject({
      heureDebut: '08:00',
      membre: 'Léa Martin',
    });
    expect(all.find((row) => row.id === third.id)).toMatchObject({
      heureDebut: '09:00',
      membre: 'Hugo Petit',
    });
  });
  it('déplace les occurrences futures d’une série dans la corbeille, laisse le passé intact', async () => {
    const membreId = crypto.randomUUID();
    const [first, second, third] = await s.saveShiftSeries({
      date: '2026-09-01',
      jusquau: '2026-09-15',
      heureDebut: '08:00',
      heureFin: '12:00',
      membreId,
      membre: 'Léa Martin',
      notes: '',
    });
    const result = await s.deleteShiftSeries(first.serieId, second.date);
    expect(result.count).toBe(2);
    const remaining = await s.list('planning');
    expect(remaining).toMatchObject([{ id: first.id }]);
    const trashed = await s.trash();
    expect(trashed.map((t) => t.label).sort()).toEqual(
      [second, third].map((x) => `${x.date} ${x.heureDebut}–${x.heureFin}`).sort(),
    );
    await expect(s.deleteShiftSeries(first.serieId, second.date)).rejects.toThrow(
      'Série introuvable',
    );
  });
  it('crée, recherche et supprime un contact de façon récupérable', async () => {
    const contact = await s.saveRecord(
      'contacts',
      contactSchema.parse({ ...newBase(), nom: 'CAF de Paris', structure: 'CAF' }),
      true,
    );
    expect(await s.list('contacts')).toHaveLength(1);
    await s.deleteRecord('contacts', contact.id);
    expect(await s.list('contacts')).toEqual([]);
    const [trash] = await s.trash();
    expect(trash.label).toBe('CAF de Paris');
    await s.restoreTrash(trash.id);
    expect(await s.list('contacts')).toMatchObject([{ nom: 'CAF de Paris' }]);
  });
});
