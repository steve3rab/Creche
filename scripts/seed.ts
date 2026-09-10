import { Storage, atomicBytes, atomicJson } from '../server/services/storage.js';
import {
  newMeeting,
  newBase,
  memberSchema,
  actionSchema,
  eventSchema,
  documentSchema,
  envelope,
  meetingSchema,
  meetingFolder,
  configSchema,
  type Member,
} from '../src/domain/models.js';
export async function seed(store: Storage) {
  await store.init(
    configSchema.parse({
      schemaVersion: 1,
      association: 'Les Filoustics',
      adresse: '12, rue des Tilleuls\n75012 Paris',
      secretaire: 'Camille Bernard',
      president: 'Léa Martin',
    }),
  );
  const stable = () => ({
    ...newBase(),
    createdAt: '2026-09-07T09:00:00.000Z',
    updatedAt: '2026-09-07T09:00:00.000Z',
  });
  const members = [
    ['Léa', 'Martin', 'Président'],
    ['Hugo', 'Petit', 'Trésorier'],
    ['Camille', 'Bernard', 'Secrétaire'],
    ['Sarah', 'Robert', 'Administrateur'],
    ['Thomas', 'Dubois', 'Membre'],
  ].map(([prenom, nom, fonction]) =>
    memberSchema.parse({
      ...stable(),
      prenom,
      nom,
      fonction,
      email: `${prenom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()}@exemple.test`,
    }),
  );
  await atomicJson(
    await store.safe('membres.json'),
    { schemaVersion: 1, items: members },
    envelope(memberSchema),
  );
  const meetings = [
    {
      type: 'CA',
      titre: 'Conseil d’administration',
      date: '2026-09-15',
      lieu: 'Salle des parents',
      statut: 'CONVOCATION_A_ENVOYER',
    },
    {
      type: 'BUREAU',
      titre: 'Réunion de rentrée',
      date: '2026-09-24',
      lieu: 'À la crèche',
      statut: 'BROUILLON',
    },
    {
      type: 'AGO',
      titre: 'Assemblée générale de juin',
      date: '2026-06-18',
      lieu: 'Salle associative',
      statut: 'PV_A_VALIDER',
    },
  ].map((row) =>
    meetingSchema.parse({
      ...newMeeting(),
      ...stable(),
      ...row,
      participants: members.slice(0, 3).map((m: Member) => ({
        membreId: m.id,
        nom: m.nomComplet,
        etat: 'PRESENT',
        mandataire: '',
      })),
      ordreDuJour:
        row.type === 'CA'
          ? [
              'Validation du précédent PV',
              'Organisation de la rentrée',
              'Vie de l’association',
              'Questions diverses',
            ].map((titre) => ({
              id: crypto.randomUUID(),
              titre,
              noteInterne: '',
              discussion: '',
              decision: '',
              vote: null,
            }))
          : [],
    }),
  );
  for (const m of meetings)
    await atomicJson(await store.safe(`${meetingFolder(m)}/reunion.json`), m, meetingSchema);
  const actions = [
    ['Contacter la mairie', 'Léa Martin', '2026-09-05', 'A_FAIRE'],
    ['Actualiser le règlement intérieur', 'Camille Bernard', '2026-09-18', 'EN_COURS'],
    ['Faire signer le dernier PV', 'Hugo Petit', '2026-09-21', 'A_FAIRE'],
  ].map(([titre, responsable, echeance, statut]) =>
    actionSchema.parse({
      ...stable(),
      titre,
      responsable,
      echeance,
      statut,
      dateCreation: '2026-09-01',
    }),
  );
  await atomicJson(
    await store.safe('actions.json'),
    { schemaVersion: 1, items: actions },
    envelope(actionSchema),
  );
  const events = [
    ['Retour du dossier CAF', '2026-09-10', 'CAF'],
    ['Rencontre avec la PMI', '2026-09-17', 'PMI'],
    ['Renouvellement de la convention', '2026-09-22', 'Mairie'],
    ['Dépôt du rapport annuel', '2026-09-30', 'Document'],
  ].map(([titre, date, categorie]) => eventSchema.parse({ ...stable(), titre, date, categorie }));
  await atomicJson(
    await store.safe('agenda.json'),
    { schemaVersion: 1, items: events },
    envelope(eventSchema),
  );
  const docs = [];
  for (const [nom, categorie, description] of [
    ['Statuts — exemple.txt', 'statuts', 'Document fictif de démonstration'],
    ['Convention mairie — exemple.txt', 'conventions', 'Exemple sans valeur contractuelle'],
  ]) {
    const d = documentSchema.parse({
      ...stable(),
      nom,
      categorie,
      description,
      fichier: '',
      taille: 0,
    });
    const bytes = Buffer.from(
      'DONNÉES FICTIVES\nCe document illustre le classement documentaire de Filoustics.\n',
    );
    d.fichier = `documents/${d.categorie}/${d.id}.txt`;
    d.taille = bytes.length;
    await atomicBytes(await store.safe(d.fichier), bytes);
    docs.push(d);
  }
  await atomicJson(
    await store.safe('documents.json'),
    { schemaVersion: 1, items: docs },
    envelope(documentSchema),
  );
  await store.snapshot();
  return { members, meetings, actions, events, docs };
}
