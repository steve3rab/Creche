import { describe, it, expect } from 'vitest';
import {
  meetingSchema,
  newMeeting,
  newBase,
  actionSchema,
  dateSchema,
  pdfName,
  meetingFolder,
  migrate,
  sortMeetings,
  sortEvents,
  eventSchema,
  overdue,
  dayDelta,
  meetingStatuses,
  memberSchema,
  meetingTypeLabel,
  eventContainsDate,
  eventCategoryClass,
  shiftSchema,
  contactSchema,
} from '../src/domain/models';
import { resolveInside } from '../server/services/storage';
import { documentHtml } from '../server/services/pdf';
import { configSchema } from '../src/domain/models';
import path from 'node:path';
describe('Modèle métier', () => {
  it('lit les membres anciens et conserve un nom complet sans imposer le prénom enfant', () => {
    const legacy = {
      ...newBase(),
      prenom: 'Marie-Claire',
      nom: 'Le Gall',
      fonction: 'Membre',
      dateEntree: '2025-01-01',
    };
    const converted = memberSchema.parse(legacy);
    expect(converted.nomComplet).toBe('Marie-Claire Le Gall');
    expect(converted.prenomEnfant).toBe('');
    expect(memberSchema.parse({ ...converted, prenomEnfant: 'Léon' }).prenomEnfant).toBe('Léon');
    expect(legacy.dateEntree).toBe('2025-01-01');
    expect(
      memberSchema.safeParse({ ...newBase(), nomComplet: '', fonction: 'Membre' }).success,
    ).toBe(false);
  });
  it('combine deux types dans les PDF et refuse un doublon', () => {
    const m = meetingSchema.parse({ ...newMeeting(), typeSecondaire: 'BUREAU' });
    expect(meetingTypeLabel(m, true)).toBe('CA + BUREAU');
    expect(pdfName(m, 'convocation')).toContain('_CA-BUREAU_');
    expect(
      documentHtml(m, configSchema.parse({ schemaVersion: 1, association: 'Test' }), 'convocation'),
    ).toContain('Conseil d’administration + Bureau');
    expect(meetingSchema.safeParse({ ...m, typeSecondaire: 'CA' }).success).toBe(false);
  });
  it('normalise les dates anciennes et couvre toute une période inclusive', () => {
    const old = eventSchema.parse({
      ...newBase(),
      titre: 'Date',
      date: '2026-09-01',
      categorie: 'Autre',
    });
    expect(old.dateFin).toBe(old.date);
    const range = eventSchema.parse({ ...old, dateFin: '2026-10-03', categorie: 'Vacances' });
    expect(eventContainsDate(range, '2026-09-20')).toBe(true);
    expect(eventContainsDate(range, '2026-10-03')).toBe(true);
    expect(eventContainsDate(range, '2026-10-04')).toBe(false);
    expect(eventSchema.safeParse({ ...old, dateFin: '2026-08-31' }).success).toBe(false);
  });
  it('accepte la catégorie Absences et colore Vacances/Fermeture/Absences en mauve, Action en bleu', () => {
    expect(
      eventSchema.safeParse({
        ...newBase(),
        titre: 'Absence exceptionnelle',
        date: '2026-09-01',
        categorie: 'Absences',
      }).success,
    ).toBe(true);
    expect(
      eventSchema.safeParse({
        ...newBase(),
        titre: 'Fermeture exceptionnelle',
        date: '2026-09-01',
        categorie: 'Fermeture',
      }).success,
    ).toBe(true);
    expect(eventCategoryClass('Vacances')).toBe('category-vacances');
    expect(eventCategoryClass('Fermeture')).toBe('category-vacances');
    expect(eventCategoryClass('Absences')).toBe('category-vacances');
    expect(eventCategoryClass('Action')).toBe('category-action');
    expect(eventCategoryClass('Autre')).toBe('');
  });
  it('crée des identifiants uniques et un brouillon valide', () => {
    const a = newMeeting(),
      b = newMeeting();
    expect(a.id).not.toBe(b.id);
    expect(meetingSchema.parse(a).statut).toBe('BROUILLON');
    expect(meetingStatuses).toContain('PV_A_VALIDER');
  });
  it('refuse dates, statuts et votes invalides', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(meetingSchema.safeParse({ ...newMeeting(), statut: 'NO' }).success).toBe(false);
    expect(
      meetingSchema.safeParse({
        ...newMeeting(),
        ordreDuJour: [
          { id: crypto.randomUUID(), titre: 'Vote', vote: { pour: -1, contre: 0, abstention: 0 } },
        ],
      }).success,
    ).toBe(false);
  });
  it('génère des chemins et noms déterministes', () => {
    const m = { ...newMeeting(), date: '2026-09-15' };
    expect(pdfName(m, 'pv')).toBe('PV_CA_2026-09-15.pdf');
    expect(meetingFolder(m)).toBe(`reunions/2026/2026-09-15_CA_${m.id}`);
    expect(resolveInside(path.resolve('tmp'), 'reunions/test')).toBe(
      path.resolve('tmp/reunions/test'),
    );
  });
  it.each([
    '../secrets',
    'a/../../secrets',
    'a\\..\\secrets',
    'C:\\secret',
    '/etc/passwd',
    'a/./b',
  ])('bloque %s', (v) => expect(() => resolveInside(path.resolve('tmp'), v)).toThrow());
  it('préserve la sérialisation et refuse une migration inconnue', () => {
    const m = newMeeting();
    expect(meetingSchema.parse(migrate(JSON.parse(JSON.stringify(m))))).toEqual(m);
    expect(() => migrate({ schemaVersion: 2 })).toThrow();
  });
  it('trie les réunions et événements sans modifier la source', () => {
    const a = { ...newMeeting(), date: '2026-10-01' },
      b = { ...newMeeting(), date: '2026-09-01' };
    const rows = [a, b];
    expect(sortMeetings(rows)[0]).toBe(b);
    expect(rows[0]).toBe(a);
    const e = (date: string) =>
      eventSchema.parse({ ...newBase(), titre: 'Test', date, categorie: 'Autre' });
    expect(sortEvents([e(a.date), e(b.date)])[0].date).toBe(b.date);
  });
  it('calcule les retards sans inclure les actions terminées', () => {
    const a = actionSchema.parse({
      ...newBase(),
      titre: 'Mairie',
      dateCreation: '2026-09-01',
      echeance: '2026-09-02',
      statut: 'A_FAIRE',
    });
    expect(overdue(a, '2026-09-07')).toBe(true);
    expect(overdue({ ...a, statut: 'TERMINE' }, '2026-09-07')).toBe(false);
    expect(dayDelta('2026-09-08', '2026-09-07')).toBe(1);
  });
  it('échappe le contenu HTML et exclut les notes internes', () => {
    const m = newMeeting();
    m.ordreDuJour.push({
      id: crypto.randomUUID(),
      titre: '<script>test</script>',
      noteInterne: 'SECRET INTERNE',
      discussion: 'Échanges',
      decision: 'Validé',
      vote: null,
      spontanee: false,
    });
    const html = documentHtml(
      m,
      configSchema.parse({ schemaVersion: 1, association: 'Association' }),
      'pv',
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('SECRET INTERNE');
    expect(html).toContain('A4');
  });
});
describe('Planning, contacts et rappels', () => {
  it('valide un créneau de garde et refuse une heure de fin antérieure ou égale au début', () => {
    const base = {
      ...newBase(),
      date: '2026-09-15',
      heureDebut: '08:00',
      membreId: crypto.randomUUID(),
      membre: 'Léa Martin',
    };
    expect(shiftSchema.safeParse({ ...base, heureFin: '12:00' }).success).toBe(true);
    expect(shiftSchema.safeParse({ ...base, heureFin: '08:00' }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...base, heureFin: '07:00' }).success).toBe(false);
  });
  it('un créneau de garde n’a pas de statut de présence par défaut, et accepte présent ou absent', () => {
    const base = {
      ...newBase(),
      date: '2026-09-15',
      heureDebut: '08:00',
      heureFin: '12:00',
      membreId: crypto.randomUUID(),
      membre: 'Léa Martin',
    };
    expect(shiftSchema.parse(base).statut).toBeNull();
    expect(shiftSchema.parse({ ...base, statut: 'PRESENT' }).statut).toBe('PRESENT');
    expect(shiftSchema.parse({ ...base, statut: 'ABSENT' }).statut).toBe('ABSENT');
    expect(shiftSchema.safeParse({ ...base, statut: 'EN_RETARD' }).success).toBe(false);
  });
  it('exige un nom pour un contact mais accepte des coordonnées vides', () => {
    const contact = contactSchema.parse({ ...newBase(), nom: 'CAF de Paris' });
    expect(contact.structure).toBe('');
    expect(contact.email).toBe('');
    expect(contactSchema.safeParse({ ...newBase(), nom: '' }).success).toBe(false);
  });
  it('rejette un e-mail de contact mal formé', () => {
    expect(
      contactSchema.safeParse({ ...newBase(), nom: 'Assurance', email: 'pas-un-email' }).success,
    ).toBe(false);
  });
  it('applique un rappel par défaut de 3 jours et borne le réglage entre 0 et 30', () => {
    const config = configSchema.parse({ schemaVersion: 1, association: 'Test' });
    expect(config.rappelJours).toBe(3);
    expect(
      configSchema.safeParse({ schemaVersion: 1, association: 'Test', rappelJours: 31 }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ schemaVersion: 1, association: 'Test', rappelJours: -1 }).success,
    ).toBe(false);
    expect(
      configSchema.parse({ schemaVersion: 1, association: 'Test', rappelJours: 0 }).rappelJours,
    ).toBe(0);
  });
});
