import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { meetingWriteSchema } from '../../src/domain/participants.js';
import {
  categories,
  collectionSchemas,
  configSchema,
  envelope,
  meetingFolder,
  meetingSchema,
  migrate,
  shiftPatchSchema,
  shiftSchema,
  shiftTemplateSchema,
  type Collection,
  type Config,
  type Shift,
} from '../../src/domain/models.js';

// Same-weekday, weekly dates from start to end (both inclusive), computed on local
// calendar days (noon anchor) so no DST transition can shift a date by one day.
function weeklyDates(start: string, until: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const end = new Date(`${until}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
    );
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

// Older workspaces and backups predate these collections; reads and backups treat a
// missing file as empty rather than corrupt.
const optionalCollections: Collection[] = ['notes', 'glossaire', 'planning', 'contacts'];
const backupFilePattern = new RegExp(
  `^(?:(?:config|${Object.keys(collectionSchemas).join('|')})\\.json$|reunions/|documents/|corbeille/)`,
);
export class DataError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const exists = async (p: string) => {
  try {
    await fs.lstat(p);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
};
export function resolveInside(root: string, relative: string) {
  if (
    !relative ||
    /[<>:"\\|?*\x00-\x1f]/.test(relative) ||
    relative
      .split('/')
      .some(
        (x) =>
          x === '..' ||
          x === '.' ||
          /[. ]$/.test(x) ||
          /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(x),
      ) ||
    path.isAbsolute(relative) ||
    /^[a-z]:/i.test(relative)
  )
    throw new DataError('Chemin interdit');
  const result = path.resolve(root, relative),
    rel = path.relative(path.resolve(root), result);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
    throw new DataError('Chemin hors du répertoire de travail');
  return result;
}
export async function noLinks(target: string) {
  const abs = path.resolve(target),
    parsed = path.parse(abs);
  let current = parsed.root;
  for (const part of abs.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new DataError('Liens symboliques et jonctions interdits');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}
export async function atomicJson<T>(
  file: string,
  value: T,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  beforeRename?: () => Promise<void>,
) {
  await noLinks(file);
  const parsed = schema.parse(value);
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const h = await fs.open(temp, 'wx');
    try {
      await h.writeFile(JSON.stringify(parsed, null, 2) + '\n', 'utf8');
      await h.sync();
    } finally {
      await h.close();
    }
    schema.parse(JSON.parse(await fs.readFile(temp, 'utf8')));
    await beforeRename?.();
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function atomicBytes(file: string, bytes: Uint8Array) {
  await noLinks(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const h = await fs.open(temp, 'wx');
    try {
      await h.writeFile(bytes);
      await h.sync();
    } finally {
      await h.close();
    }
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  files: z.array(z.string()),
  hashes: z.record(z.string()),
});
const trashSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  original: z.string(),
  label: z.string(),
  date: z.string(),
  kind: z.enum(['file', 'record']),
  collection: z.string().optional(),
  record: z.unknown().optional(),
});
export class Storage {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public root: string) {
    this.root = path.resolve(root);
  }
  async safe(relative: string) {
    const p = resolveInside(this.root, relative);
    await noLinks(p);
    return p;
  }
  async serial<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.queue.then(fn);
    this.queue = job.catch(() => {});
    return job;
  }
  async read<T>(relative: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    try {
      return schema.parse(
        migrate(JSON.parse(await fs.readFile(await this.safe(relative), 'utf8'))),
      );
    } catch (e) {
      if (e instanceof DataError) throw e;
      throw new DataError(
        `Fichier invalide ou inaccessible : ${relative}. Aucune donnée écrasée. Restaurez une sauvegarde dans Paramètres.`,
        422,
      );
    }
  }
  async init(config: Config) {
    await noLinks(this.root);
    await fs.mkdir(this.root, { recursive: true });
    const entries = await fs.readdir(this.root);
    if (entries.length) {
      await this.verify();
      return;
    }
    for (const d of [
      'reunions',
      'documents',
      'sauvegardes',
      'corbeille',
      'logs',
      ...categories.map((c) => `documents/${c}`),
    ])
      await fs.mkdir(await this.safe(d), { recursive: true });
    await atomicJson(await this.safe('config.json'), config, configSchema);
    for (const name of Object.keys(collectionSchemas))
      await atomicJson(
        await this.safe(`${name}.json`),
        { schemaVersion: 1, items: [] },
        envelope(z.unknown()),
      );
  }
  async config() {
    return this.read('config.json', configSchema);
  }
  async list<K extends Collection>(
    name: K,
  ): Promise<Array<z.infer<(typeof collectionSchemas)[K]>>> {
    if (optionalCollections.includes(name) && !(await exists(await this.safe(`${name}.json`))))
      return [];
    const items = (await this.read(`${name}.json`, envelope(collectionSchemas[name]))).items;
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new DataError(
        `Identifiants dupliqués dans ${name}.json. Restaurez une sauvegarde.`,
        422,
      );
    return items;
  }
  async files(relative: string): Promise<string[]> {
    const result: string[] = [];
    const base = await this.safe(relative);
    if (!(await exists(base))) return result;
    for (const entry of await fs.readdir(base, { withFileTypes: true })) {
      const rel = `${relative}/${entry.name}`;
      await this.safe(rel);
      if (entry.isDirectory()) result.push(...(await this.files(rel)));
      else if (entry.isFile()) result.push(rel);
      else throw new DataError('Type de fichier interdit');
    }
    return result;
  }
  async meetings() {
    const files = (await this.files('reunions')).filter((f) => f.endsWith('/reunion.json'));
    const items = await Promise.all(files.map((f) => this.read(f, meetingSchema)));
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new DataError('Identifiants de réunions dupliqués. Restaurez une sauvegarde.', 422);
    return items;
  }
  async meeting(id: string) {
    const m = (await this.meetings()).find((x) => x.id === id);
    if (!m) throw new DataError('Réunion introuvable', 404);
    return m;
  }
  async meetingFile(id: string) {
    for (const f of (await this.files('reunions')).filter((f) => f.endsWith('/reunion.json'))) {
      if ((await this.read(f, meetingSchema)).id === id) return f;
    }
    throw new DataError('Réunion introuvable', 404);
  }
  async meetingDir(id: string) {
    return (await this.meetingFile(id)).replace(/\/reunion\.json$/, '');
  }
  async assertReady() {
    if (await exists(await this.safe('restauration-en-cours.json')))
      throw new DataError(
        'Restauration interrompue. Relancez la restauration dans Paramètres avant toute modification.',
        409,
      );
  }
  async verify() {
    await this.config();
    for (const c of Object.keys(collectionSchemas) as Collection[]) await this.list(c);
    await this.meetings();
    for (const d of await this.list('documents')) {
      if ('fichier' in d && !(await exists(await this.safe(d.fichier))))
        throw new DataError('Document manquant : ' + d.nom, 422);
    }
    return { ok: true };
  }
  async snapshot(prune = true) {
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '_' + randomUUID().slice(0, 8),
      dest = `sauvegardes/${id}`;
    const files = [
      'config.json',
      ...(await this.collectionFiles()),
      ...(await this.files('reunions')),
      ...(await this.files('documents')),
      ...(await this.files('corbeille')),
    ].filter((f) => !f.endsWith('.tmp'));
    const hashes: Record<string, string> = {};
    for (const f of files) {
      if (await exists(await this.safe(f))) {
        const bytes = await fs.readFile(await this.safe(f));
        await atomicBytes(await this.safe(`${dest}/${f}`), bytes);
        hashes[f] = createHash('sha256').update(bytes).digest('hex');
      }
    }
    await atomicJson(
      await this.safe(`${dest}/manifest.json`),
      { schemaVersion: 1, createdAt: new Date().toISOString(), files, hashes },
      manifestSchema,
    );
    if (prune) {
      let retention = 20;
      try {
        retention = (await this.config()).retention;
      } catch {
        /* A corrupt config must not prevent a recovery snapshot. */
      }
      const backups = await this.backups();
      for (const old of backups.slice(retention))
        await fs.rm(await this.safe(`sauvegardes/${old.id}`), { recursive: true });
    }
    return { id };
  }
  async backups() {
    const base = await this.safe('sauvegardes');
    if (!(await exists(base))) return [];
    const rows = [];
    for (const id of await fs.readdir(base)) {
      if (await exists(await this.safe(`sauvegardes/${id}/manifest.json`))) rows.push({ id });
    }
    return rows.sort((a, b) => b.id.localeCompare(a.id));
  }
  private async collectionFiles() {
    const files = Object.keys(collectionSchemas).map((name) => `${name}.json`);
    const missing = await Promise.all(
      optionalCollections.map(async (name) =>
        (await exists(await this.safe(`${name}.json`))) ? null : `${name}.json`,
      ),
    );
    return files.filter((file) => !missing.includes(file));
  }
  async restore(id: string) {
    const source = `sauvegardes/${id}`;
    const manifest = await this.read(`${source}/manifest.json`, manifestSchema);
    const staged = new Storage(await this.safe(source));
    await staged.verify();
    const expected = [
      'config.json',
      ...(await staged.collectionFiles()),
      ...(await staged.files('reunions')),
      ...(await staged.files('documents')),
      ...(await staged.files('corbeille')),
    ].filter((f) => !f.endsWith('.tmp'));
    if (
      new Set(manifest.files).size !== manifest.files.length ||
      expected.length !== manifest.files.length ||
      expected.some((f) => !manifest.files.includes(f))
    )
      throw new DataError('Manifeste de sauvegarde incomplet ou incohérent.', 422);
    for (const f of manifest.files) {
      if (!backupFilePattern.test(f)) throw new DataError('Sauvegarde invalide');
      const file = await staged.safe(f);
      if (
        manifest.hashes &&
        createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex') !== manifest.hashes[f]
      )
        throw new DataError('Intégrité de sauvegarde incorrecte : ' + f, 422);
    }
    // Keep a complete raw recovery snapshot, including corrupt originals, before touching current data.
    const recovery = await this.snapshot(false);
    await atomicJson(
      await this.safe('restauration-en-cours.json'),
      { schemaVersion: 1, source: id, recovery: recovery.id },
      z.object({ schemaVersion: z.literal(1), source: z.string(), recovery: z.string() }),
    );
    const current = [
      ...(
        await Promise.all(
          optionalCollections.map(async (name) =>
            (await exists(await this.safe(`${name}.json`))) ? `${name}.json` : null,
          ),
        )
      ).filter((f): f is string => f !== null),
      ...(await this.files('reunions')),
      ...(await this.files('documents')),
      ...(await this.files('corbeille')),
    ];
    for (const f of manifest.files)
      await atomicBytes(await this.safe(f), await fs.readFile(await staged.safe(f)));
    for (const f of current.filter((f) => !manifest.files.includes(f)))
      await fs.rm(await this.safe(f));
    await this.verify();
    await fs.rm(await this.safe('restauration-en-cours.json'));
    return { ok: true, recovery: recovery.id };
  }
  async saveConfig(value: unknown) {
    await this.assertReady();
    const v = configSchema.parse(value);
    await this.config();
    await this.snapshot();
    await atomicJson(await this.safe('config.json'), v, configSchema);
    return v;
  }
  async saveMeeting(value: unknown, create = false) {
    await this.assertReady();
    const m = meetingWriteSchema.parse(value);
    const all = await this.meetings();
    const old = all.find((x) => x.id === m.id);
    if (create && old) throw new DataError('Identifiant déjà utilisé', 409);
    if (!create && !old) throw new DataError('Réunion introuvable', 404);
    if (old?.pvValideLe)
      throw new DataError('PV validé : rouvrez-le explicitement avant modification.', 409);
    if (m.pvValideLe) throw new DataError('Utilisez la validation explicite du PV.', 409);
    if (old && old.updatedAt !== m.updatedAt)
      throw new DataError('Cette réunion a changé. Rechargez la fiche.', 409);
    m.createdAt = old?.createdAt ?? m.createdAt;
    const members = await this.list('membres');
    for (const participant of m.participants) {
      const member = members.find((member) => member.id === participant.membreId);
      if (member && 'prenomEnfant' in member) participant.prenomEnfant = member.prenomEnfant;
    }
    m.updatedAt = new Date().toISOString();
    await this.snapshot();
    if (
      old &&
      (old.date !== m.date || old.type !== m.type || old.typeSecondaire !== m.typeSecondaire)
    )
      m.generations = {};
    // Keep the initial folder stable: changing a date never requires a multi-file move.
    const file = old ? await this.meetingFile(old.id) : `${meetingFolder(m)}/reunion.json`;
    await atomicJson(await this.safe(file), m, meetingSchema);
    return m;
  }
  async setValidation(id: string, validate: boolean) {
    await this.assertReady();
    const m = await this.meeting(id);
    if (validate) meetingWriteSchema.parse(m);
    await this.snapshot();
    m.pvValideLe = validate ? new Date().toISOString() : null;
    m.statut = validate ? 'CLOTUREE' : 'PV_A_VALIDER';
    m.updatedAt = new Date().toISOString();
    await atomicJson(await this.safe(await this.meetingFile(id)), m, meetingSchema);
    return m;
  }
  async setArchive(id: string, archive: boolean) {
    await this.assertReady();
    const m = await this.meeting(id);
    await this.snapshot();
    m.archive = archive;
    m.updatedAt = new Date().toISOString();
    await atomicJson(await this.safe(await this.meetingFile(id)), m, meetingSchema);
    return m;
  }
  async saveRecord<K extends Collection>(
    name: K,
    value: unknown,
    create = false,
  ): Promise<z.infer<(typeof collectionSchemas)[K]>> {
    await this.assertReady();
    const schema = collectionSchemas[name];
    const v = schema.parse(value) as z.infer<(typeof collectionSchemas)[K]>,
      rows = await this.list(name),
      i = rows.findIndex((r) => r.id === v.id);
    if (create && i !== -1) throw new DataError('Identifiant déjà utilisé', 409);
    if (!create && i === -1) throw new DataError('Élément introuvable', 404);
    if (i !== -1 && rows[i].updatedAt !== v.updatedAt)
      throw new DataError('Cet élément a changé. Rechargez la page.', 409);
    await this.snapshot();
    v.updatedAt = new Date().toISOString();
    if (i === -1) rows.push(v);
    else rows[i] = v;
    await atomicJson(
      await this.safe(`${name}.json`),
      { schemaVersion: 1, items: rows },
      envelope(schema),
    );
    return v;
  }
  async deleteRecord(name: Collection | 'reunions', id: string) {
    await this.assertReady();
    await this.snapshot();
    const tid = randomUUID();
    if (name === 'reunions') {
      const m = await this.meeting(id);
      if (m.pvValideLe) throw new DataError('Rouvrez le PV validé avant suppression.', 409);
      const original = await this.meetingDir(id);
      await atomicJson(
        await this.safe(`corbeille/${tid}/meta.json`),
        {
          schemaVersion: 1,
          id: tid,
          original,
          label: m.titre,
          date: new Date().toISOString(),
          kind: 'file',
        },
        trashSchema,
      );
      await fs.rename(await this.safe(original), await this.safe(`corbeille/${tid}/contenu`));
    } else {
      const rows = await this.list(name),
        item = rows.find((x) => x.id === id);
      if (!item) throw new DataError('Élément introuvable', 404);
      await atomicJson(
        await this.safe(`corbeille/${tid}/meta.json`),
        {
          schemaVersion: 1,
          id: tid,
          original: `${name}.json`,
          label:
            'titre' in item
              ? item.titre
              : 'nom' in item
                ? item.nom
                : 'nomComplet' in item
                  ? item.nomComplet
                  : 'cle' in item
                    ? item.cle
                    : 'heureDebut' in item
                      ? `${item.date} ${item.heureDebut}–${item.heureFin}`
                      : id,
          date: new Date().toISOString(),
          kind: 'record',
          collection: name,
          record: item,
        },
        trashSchema,
      );
      if (name === 'documents' && 'fichier' in item)
        await fs.rename(await this.safe(item.fichier), await this.safe(`corbeille/${tid}/contenu`));
      await atomicJson(
        await this.safe(`${name}.json`),
        { schemaVersion: 1, items: rows.filter((x) => x.id !== id) },
        envelope(collectionSchemas[name]),
      );
    }
    return { ok: true };
  }
  // Materializes a weekly-repeating shift as one record per week — the same members
  // usually cover the same slot all year, so a single form fills the whole series
  // instead of one save per week; each occurrence stays independently editable.
  async saveShiftSeries(template: unknown): Promise<Shift[]> {
    await this.assertReady();
    const t = shiftTemplateSchema.parse(template);
    const dates = weeklyDates(t.date, t.jusquau);
    if (dates.length > 104)
      throw new DataError('La répétition est limitée à deux ans (104 semaines).', 400);
    const serieId = randomUUID();
    const now = new Date().toISOString();
    const created = dates.map((date) =>
      shiftSchema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        date,
        heureDebut: t.heureDebut,
        heureFin: t.heureFin,
        membreId: t.membreId,
        membre: t.membre,
        notes: t.notes,
        serieId,
      }),
    );
    await this.snapshot();
    const rows = await this.list('planning');
    await atomicJson(
      await this.safe('planning.json'),
      { schemaVersion: 1, items: [...rows, ...created] },
      envelope(shiftSchema),
    );
    return created;
  }
  async updateShiftSeries(serieId: string, fromDate: string, patch: unknown): Promise<Shift[]> {
    await this.assertReady();
    const p = shiftPatchSchema.parse(patch);
    const rows = await this.list('planning');
    if (!rows.some((r) => r.serieId === serieId && r.date >= fromDate))
      throw new DataError('Série introuvable', 404);
    await this.snapshot();
    const now = new Date().toISOString();
    const updated = rows.map((r) =>
      r.serieId === serieId && r.date >= fromDate
        ? shiftSchema.parse({ ...r, ...p, updatedAt: now })
        : r,
    );
    await atomicJson(
      await this.safe('planning.json'),
      { schemaVersion: 1, items: updated },
      envelope(shiftSchema),
    );
    return updated.filter((r) => r.serieId === serieId && r.date >= fromDate);
  }
  async deleteShiftSeries(serieId: string, fromDate: string) {
    await this.assertReady();
    const rows = await this.list('planning');
    const targeted = rows.filter((r) => r.serieId === serieId && r.date >= fromDate);
    if (!targeted.length) throw new DataError('Série introuvable', 404);
    await this.snapshot();
    for (const item of targeted) {
      const tid = randomUUID();
      await atomicJson(
        await this.safe(`corbeille/${tid}/meta.json`),
        {
          schemaVersion: 1,
          id: tid,
          original: 'planning.json',
          label: `${item.date} ${item.heureDebut}–${item.heureFin}`,
          date: new Date().toISOString(),
          kind: 'record',
          collection: 'planning',
          record: item,
        },
        trashSchema,
      );
    }
    const remaining = rows.filter((r) => !(r.serieId === serieId && r.date >= fromDate));
    await atomicJson(
      await this.safe('planning.json'),
      { schemaVersion: 1, items: remaining },
      envelope(shiftSchema),
    );
    return { ok: true, count: targeted.length };
  }
  async trash() {
    const files = (await this.files('corbeille')).filter((x) => x.endsWith('/meta.json'));
    return Promise.all(files.map((f) => this.read(f, trashSchema)));
  }
  async restoreTrash(id: string) {
    await this.assertReady();
    const meta = await this.read(`corbeille/${id}/meta.json`, trashSchema);
    await this.snapshot();
    if (meta.kind === 'file') {
      const target = await this.safe(meta.original);
      if (await exists(target))
        throw new DataError('Un élément existe déjà à cet emplacement.', 409);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(await this.safe(`corbeille/${id}/contenu`), target);
    } else {
      const name = z
          .enum([
            'membres',
            'agenda',
            'actions',
            'documents',
            'notes',
            'glossaire',
            'planning',
            'contacts',
          ])
          .parse(meta.collection),
        item = collectionSchemas[name].parse(meta.record),
        rows = await this.list(name);
      if (rows.some((r) => r.id === item.id)) throw new DataError('Élément déjà présent.', 409);
      if ('fichier' in item) {
        const target = await this.safe(item.fichier);
        if (await exists(target)) throw new DataError('Fichier déjà présent', 409);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rename(await this.safe(`corbeille/${id}/contenu`), target);
      }
      rows.push(item);
      await atomicJson(
        await this.safe(`${name}.json`),
        { schemaVersion: 1, items: rows },
        envelope(collectionSchemas[name]),
      );
    }
    await fs.rm(await this.safe(`corbeille/${id}`), { recursive: true });
    return { ok: true };
  }
  async emptyTrash() {
    await this.assertReady();
    await this.snapshot();
    for (const row of await this.trash())
      await fs.rm(await this.safe(`corbeille/${row.id}`), { recursive: true });
    return { ok: true };
  }
}
