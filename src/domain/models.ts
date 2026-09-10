import { z } from 'zod';
import {
  cleanSignature,
  defaultSignatureHtml,
  isLogoDataUrl,
  migrateSignature,
} from './branding.js';

export const meetingTypes = ['CA', 'BUREAU', 'AGO', 'AGE', 'PARENTS', 'AUTRE'] as const;
export const meetingStatuses = [
  'BROUILLON',
  'CONVOCATION_A_ENVOYER',
  'CONVOCATION_ENVOYEE',
  'A_VENIR',
  'TERMINEE',
  'PV_A_REDIGER',
  'PV_A_VALIDER',
  'CLOTUREE',
] as const;
export const actionStatuses = ['A_FAIRE', 'EN_COURS', 'TERMINE', 'ANNULE'] as const;
export const categories = [
  'proces-verbaux',
  'statuts',
  'reglements',
  'conventions',
  'administratif',
  'divers',
] as const;
export const eventTypes = [
  'Réunion',
  'AG',
  'CA',
  'Bureau',
  'CAF',
  'PMI',
  'Mairie',
  'Échéance',
  'Document',
  'Action',
  'Vacances',
  'Fermeture',
  'Absences',
  'Autre',
] as const;
export const roles = [
  'Présidente',
  'Vice-président',
  'Trésorier',
  'Vice-trésorière',
  'Secrétaire',
  'Secrétaire adjoint',
  'Administrateur',
  'Membre',
  'Autre',
];
export const labels: Record<string, string> = {
  CA: 'Conseil d’administration',
  BUREAU: 'Bureau',
  AGO: 'Assemblée générale ordinaire',
  AGE: 'Assemblée générale extraordinaire',
  PARENTS: 'Réunion parents',
  AUTRE: 'Autre',
  BROUILLON: 'Brouillon',
  CONVOCATION_A_ENVOYER: 'Convocation à envoyer',
  CONVOCATION_ENVOYEE: 'Convocation envoyée',
  A_VENIR: 'À venir',
  TERMINEE: 'Terminée',
  PV_A_REDIGER: 'PV à rédiger',
  PV_A_VALIDER: 'PV à valider',
  CLOTUREE: 'Clôturée',
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé',
  'proces-verbaux': 'Procès-verbaux',
  statuts: 'Statuts',
  reglements: 'Règlements',
  conventions: 'Conventions',
  administratif: 'Administratif',
  divers: 'Divers',
};
const text = z.string().max(30000);
const short = z.string().trim().max(240);
export const idSchema = z.string().uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Date invalide',
  );
const optionalDate = z.union([dateSchema, z.literal('')]).default('');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z.union([time, z.literal('')]).default('');
const base = {
  schemaVersion: z.literal(1),
  id: idSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};
export const pointSchema = z.object({
  id: idSchema,
  titre: short.min(1),
  noteInterne: text.default(''),
  discussion: text.default(''),
  decision: text.default(''),
  vote: z
    .object({
      pour: z.number().int().min(0),
      contre: z.number().int().min(0),
      abstention: z.number().int().min(0),
    })
    .nullable()
    .default(null),
  spontanee: z.boolean().default(false),
});
export const participantSchema = z.object({
  membreId: idSchema,
  nom: short.min(1),
  prenomEnfant: short.optional(),
  etat: z.enum(['PRESENT', 'ABSENT', 'EXCUSE', 'PROCURATION']),
  mandataire: short.default(''),
  mandataireId: z.union([idSchema, z.literal('')]).optional(),
});
export const meetingSchema = z
  .object({
    ...base,
    type: z.enum(meetingTypes),
    typeSecondaire: z.union([z.enum(meetingTypes), z.literal('')]).default(''),
    titre: short.default(''),
    date: dateSchema,
    heureDebut: time,
    heureFin: optionalTime,
    lieu: short,
    statut: z.enum(meetingStatuses),
    notes: text.default(''),
    participants: z.array(participantSchema).max(500),
    ordreDuJour: z.array(pointSchema).max(200),
    decisions: z.array(text).default([]),
    documents: z.array(idSchema).default([]),
    archive: z.boolean().default(false),
    convocationEnvoyeeLe: optionalDate,
    pvValideLe: z.string().datetime().nullable().default(null),
    generations: z.record(z.string().datetime()).default({}),
  })
  .refine((m) => !m.typeSecondaire || m.typeSecondaire !== m.type, {
    message: 'Choisissez deux types différents.',
    path: ['typeSecondaire'],
  });
const legacyMemberSchema = z.object({
  ...base,
  nom: short.min(1),
  prenom: short.min(1),
  fonction: short,
  email: z.union([z.string().email(), z.literal('')]).default(''),
  telephone: short.default(''),
  actif: z.boolean().default(true),
  dateEntree: optionalDate,
  dateSortie: optionalDate,
  notes: text.default(''),
});
const currentMemberSchema = z.object({
  ...base,
  nomComplet: short.min(1),
  prenomEnfant: short.default(''),
  fonction: short.transform((value) =>
    value === 'Président'
      ? 'Présidente'
      : value === 'Trésorier adjoint'
        ? 'Vice-trésorière'
        : value,
  ),
  email: z.union([z.string().email(), z.literal('')]).default(''),
  telephone: short.default(''),
  actif: z.boolean().default(true),
  // Retain historical values when present; they are no longer requested in the UI.
  dateEntree: z.union([dateSchema, z.literal('')]).optional(),
  dateSortie: z.union([dateSchema, z.literal('')]).optional(),
  notes: text.default(''),
});
// Read legacy members without rewriting the file; the next explicit save is backed up.
export const memberSchema = z.union([
  currentMemberSchema,
  legacyMemberSchema.transform((m) =>
    currentMemberSchema.parse({ ...m, nomComplet: `${m.prenom} ${m.nom}` }),
  ),
]);
export const actionSchema = z.object({
  ...base,
  titre: short.min(1),
  description: text.default(''),
  responsable: short.default(''),
  responsableId: z.union([idSchema, z.literal('')]).default(''),
  dateCreation: dateSchema,
  echeance: optionalDate,
  statut: z.enum(actionStatuses),
  reunionSource: z.union([idSchema, z.literal('')]).default(''),
  decisionSource: z.union([idSchema, z.literal('')]).default(''),
  noteSource: z.union([idSchema, z.literal('')]).default(''),
});
export const eventSchema = z
  .object({
    ...base,
    titre: short.min(1),
    date: dateSchema,
    dateFin: optionalDate,
    heure: optionalTime,
    categorie: z.enum(eventTypes),
    description: text.default(''),
    reunionId: z.union([idSchema, z.literal('')]).default(''),
    actionId: z.union([idSchema, z.literal('')]).default(''),
    termine: z.boolean().default(false),
  })
  .refine((e) => !e.dateFin || e.dateFin >= e.date, {
    message: 'La fin doit être le même jour ou après le début.',
    path: ['dateFin'],
  })
  .transform((e) => ({ ...e, dateFin: e.dateFin || e.date }));
export const documentSchema = z.object({
  ...base,
  nom: short
    .min(1)
    .refine((v) => !/[<>:"/\\|?*\x00-\x1f]/.test(v) && !/[. ]$/.test(v), 'Nom de fichier invalide'),
  categorie: z.enum(categories),
  description: text.default(''),
  archive: z.boolean().default(false),
  reunionSource: z.union([idSchema, z.literal('')]).default(''),
  fichier: z.string(),
  taille: z.number().nonnegative(),
});
export const noteImportance = ['NORMAL', 'IMPORTANT', 'PRIORITAIRE', 'AFFINER'] as const;
export const noteImportanceLabels = {
  NORMAL: 'Normal',
  IMPORTANT: 'Important',
  PRIORITAIRE: 'Prioritaire',
  AFFINER: 'À affiner',
};
export const noteSchema = z.object({
  ...base,
  titre: short.min(1, 'Le titre est obligatoire.'),
  contenu: text.trim().min(1, 'Le contenu est obligatoire.'),
  actionId: z.union([idSchema, z.literal('')]).default(''),
  categorie: z.string().trim().min(1, 'La catégorie est obligatoire.').max(80),
  importance: z.enum(noteImportance).default('NORMAL'),
});
export type Note = z.infer<typeof noteSchema>;
export const glossaryEntrySchema = z.object({
  ...base,
  cle: z
    .string()
    .trim()
    .min(1, 'La clé est obligatoire.')
    .max(60, 'La clé est limitée à 60 caractères.')
    .regex(/^[^\s@]+$/, 'La clé ne doit contenir ni espace ni @.'),
  valeur: short.min(1, 'La valeur est obligatoire.'),
  description: text.default(''),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export const configSchema = z.object({
  schemaVersion: z.literal(1),
  association: short.min(1),
  adresse: text.default(''),
  secretaire: short.default(''),
  president: short.default(''),
  signatureHtml: z
    .string()
    .max(4000, 'La signature est limitée à 4 000 caractères HTML.')
    .default(defaultSignatureHtml)
    .transform((value) => cleanSignature(migrateSignature(value))),
  logoDataUrl: z
    .string()
    .max(1_398_150, 'Le logo est limité à 1 Mo.')
    .default('')
    .refine(isLogoDataUrl, 'Choisissez un logo PNG ou JPEG valide de moins de 1 Mo.'),
  retention: z.number().int().min(2).max(100).default(20),
});
export const collectionSchemas = {
  membres: memberSchema,
  agenda: eventSchema,
  actions: actionSchema,
  documents: documentSchema,
  notes: noteSchema,
  glossaire: glossaryEntrySchema,
};
export const envelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ schemaVersion: z.literal(1), items: z.array(item) });
export type Meeting = z.infer<typeof meetingSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Action = z.infer<typeof actionSchema>;
export type AgendaEvent = z.infer<typeof eventSchema>;
export type Document = z.infer<typeof documentSchema>;
export type Config = z.infer<typeof configSchema>;
export type Collection = keyof typeof collectionSchemas;
export function newBase() {
  const now = new Date().toISOString();
  return { schemaVersion: 1 as const, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
export function newMeeting(): Meeting {
  return meetingSchema.parse({
    ...newBase(),
    type: 'CA',
    titre: '',
    date: today(),
    heureDebut: '19:00',
    lieu: 'À la crèche',
    statut: 'BROUILLON',
    participants: [],
    ordreDuJour: [],
  });
}
export function meetingDisplayTitle(meeting: Pick<Meeting, 'titre' | 'type' | 'typeSecondaire'>) {
  return meeting.titre || meetingTypeLabel(meeting);
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayDelta(date: string, reference = today()) {
  return Math.round((Date.parse(date) - Date.parse(reference)) / 86400000);
}
export function dueLabel(date: string, done = false) {
  if (!date || done) return '';
  const n = dayDelta(date);
  return n < 0 ? 'En retard' : n === 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : `Dans ${n} j`;
}
export function overdue(a: Action, reference = today()) {
  return (
    !!a.echeance && !['TERMINE', 'ANNULE'].includes(a.statut) && dayDelta(a.echeance, reference) < 0
  );
}
export function sortMeetings(items: Meeting[]) {
  return [...items].sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
}
export function sortEvents(items: AgendaEvent[]) {
  return [...items].sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}
export function pdfName(m: Meeting, kind: string) {
  return `${kind === 'convocation' ? 'Convocation' : kind === 'ordre-du-jour' ? 'OrdreDuJour' : 'PV'}_${meetingTypeCodes(m).join('-')}_${m.date}.pdf`;
}
export function meetingTypeCodes(m: Pick<Meeting, 'type' | 'typeSecondaire'>) {
  return m.typeSecondaire ? [m.type, m.typeSecondaire] : [m.type];
}
export function meetingTypeLabel(m: Pick<Meeting, 'type' | 'typeSecondaire'>, compact = false) {
  return meetingTypeCodes(m)
    .map((t) => (compact ? t : labels[t]))
    .join(' + ');
}
export function eventContainsDate(e: Pick<AgendaEvent, 'date' | 'dateFin'>, date: string) {
  return e.date <= date && date <= e.dateFin;
}
export function eventCategoryClass(categorie: AgendaEvent['categorie']) {
  return categorie === 'Vacances' || categorie === 'Fermeture' || categorie === 'Absences'
    ? 'category-vacances'
    : categorie === 'Action'
      ? 'category-action'
      : '';
}
export function eventDueLabel(e: Pick<AgendaEvent, 'date' | 'dateFin' | 'termine'>) {
  return e.termine
    ? 'Terminé'
    : e.date !== e.dateFin && eventContainsDate(e, today())
      ? 'En cours'
      : dueLabel(e.dateFin < today() ? e.dateFin : e.date);
}
export function eventDateLabel(e: Pick<AgendaEvent, 'date' | 'dateFin'>) {
  return e.date === e.dateFin
    ? prettyDate(e.date)
    : `${prettyDate(e.date)} → ${prettyDate(e.dateFin)}`;
}
export function meetingFolder(m: Meeting) {
  return `reunions/${m.date.slice(0, 4)}/${m.date}_${m.type}_${m.id}`;
}
// Future migrations are explicit; unknown versions are never rewritten.
export function migrate(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1
  )
    throw new Error('Version de schéma non prise en charge. Restaurez une sauvegarde compatible.');
  return value;
}
export function prettyDate(v: string) {
  return v
    ? new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}
