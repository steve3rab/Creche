import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import {
  Storage,
  DataError,
  atomicJson,
  atomicBytes,
  exists,
  noLinks,
} from './services/storage.js';
import {
  configSchema,
  documentSchema,
  pdfName,
  idSchema,
  type Collection,
  type Document,
} from '../src/domain/models.js';
import { documentHtml, generatePdf, reopenMeeting, validateMeeting } from './services/pdf.js';
import { validateBranding } from './services/pdf-branding.js';
import { saveAction, saveNote } from './services/notes.js';
import { saveGlossaryEntry } from './services/glossaire.js';
import { streamBackupZip } from './services/zip.js';

const pointerSchema = z.object({ schemaVersion: z.literal(1), workspace: z.string().min(1) });
export async function createApp(options: { configDir: string; workspace?: string; port: number }) {
  const app = express();
  let store: Storage | undefined;
  const pointer = path.join(options.configDir, 'application.json');
  await fs.mkdir(options.configDir, { recursive: true });
  if (options.workspace) store = new Storage(options.workspace);
  else if (await exists(pointer)) {
    const c = pointerSchema.parse(JSON.parse(await fs.readFile(pointer, 'utf8')));
    store = new Storage(c.workspace);
  }
  // Host and Origin guards protect the unauthenticated loopback API from other websites.
  app.use((req, res, next) => {
    if (req.headers.host !== `127.0.0.1:${options.port}`) {
      res.status(403).json({ error: 'Hôte refusé' });
      return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${options.port}`) {
      res.status(403).json({ error: 'Origine refusée' });
      return;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ error: 'Origine refusée' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!req.path.startsWith('/api/'))
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '30mb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ application: 'filoustics-secretariat', status: 'ok' }),
  );
  const db = () => {
    if (!store) throw new DataError('Choisissez un répertoire de travail.', 409);
    return store;
  };
  const confirmed = (body: unknown) => z.object({ confirm: z.literal(true) }).parse(body);
  const id = (value: unknown) => idSchema.parse(value);
  app.get('/api/setup', async (_req, res) => {
    res.json({ configured: !!store, workspace: store?.root ?? '' });
  });
  app.post('/api/setup', async (req, res) => {
    const body = z
      .object({ workspace: z.string().min(3), association: z.string().trim().min(1) })
      .parse(req.body);
    if (!path.isAbsolute(body.workspace) || body.workspace.startsWith('\\\\'))
      throw new DataError('Choisissez un chemin local absolu.');
    await noLinks(body.workspace);
    const next = new Storage(body.workspace);
    await next.init(configSchema.parse({ schemaVersion: 1, association: body.association }));
    await atomicJson(pointer, { schemaVersion: 1, workspace: next.root }, pointerSchema);
    store = next;
    res.json({ ok: true });
  });
  app.get('/api/config', async (_req, res) => res.json(await db().config()));
  app.put('/api/config', async (req, res) => {
    const currentStore = db();
    res.json(
      await currentStore.serial(async () => {
        const config = configSchema.parse(req.body);
        const previous = await currentStore.config();
        if (
          config.signatureHtml !== previous.signatureHtml ||
          config.logoDataUrl !== previous.logoDataUrl
        )
          await validateBranding(config);
        return currentStore.saveConfig(config);
      }),
    );
  });
  app.get('/api/reunions', async (_req, res) => res.json(await db().meetings()));
  app.post('/api/reunions', async (req, res) =>
    res.json(await db().serial(() => db().saveMeeting(req.body, true))),
  );
  app.get('/api/reunions/:id', async (req, res) => res.json(await db().meeting(id(req.params.id))));
  app.post('/api/reunions/:id/archive', async (req, res) => {
    const body = z.object({ archive: z.boolean() }).parse(req.body);
    res.json(await db().serial(() => db().setArchive(id(req.params.id), body.archive)));
  });
  app.put('/api/reunions/:id', async (req, res) => {
    if (id(req.params.id) !== req.body.id) throw new DataError('Identifiant incohérent');
    res.json(await db().serial(() => db().saveMeeting(req.body)));
  });
  app.delete('/api/reunions/:id', async (req, res) => {
    confirmed(req.body);
    res.json(await db().serial(() => db().deleteRecord('reunions', id(req.params.id))));
  });
  for (const kind of ['convocation', 'ordre-du-jour', 'pv']) {
    app.post(`/api/reunions/:id/${kind}`, async (req, res) =>
      res.json(await db().serial(() => generatePdf(db(), id(req.params.id), kind))),
    );
  }
  app.get('/api/reunions/:id/preview/:kind', async (req, res) => {
    const kind = z.enum(['convocation', 'ordre-du-jour', 'pv']).parse(req.params.kind),
      m = await db().meeting(id(req.params.id));
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );
    res.type('html').send(
      documentHtml(
        m,
        await db().config(),
        kind,
        (await db().list('actions')).filter(
          (a): a is import('../src/domain/models.js').Action =>
            'reunionSource' in a && a.reunionSource === m.id,
        ),
        (await db().list('membres')).filter(
          (member): member is import('../src/domain/models.js').Member => 'nomComplet' in member,
        ),
      ),
    );
  });
  app.get('/api/reunions/:id/pdf/:kind', async (req, res) => {
    const kind = z.enum(['convocation', 'ordre-du-jour', 'pv']).parse(req.params.kind),
      m = await db().meeting(id(req.params.id));
    res.type('pdf').sendFile(await db().safe(`${await db().meetingDir(m.id)}/${pdfName(m, kind)}`));
  });
  app.post('/api/reunions/:id/valider', async (req, res) =>
    res.json(await db().serial(() => validateMeeting(db(), id(req.params.id)))),
  );
  app.post('/api/reunions/:id/rouvrir', async (req, res) => {
    confirmed(req.body);
    res.json(await db().serial(() => reopenMeeting(db(), id(req.params.id))));
  });
  // Notes flagged "à affiner" get a linked action, and finishing that action drops
  // the note back to Normal; glossary keys must stay unique — these collections need
  // that extra orchestration.
  const save: Partial<
    Record<Collection, (store: Storage, value: unknown, create?: boolean) => Promise<unknown>>
  > = { actions: saveAction, notes: saveNote, glossaire: saveGlossaryEntry };
  for (const name of [
    'membres',
    'agenda',
    'actions',
    'notes',
    'glossaire',
    'planning',
    'contacts',
  ] as Collection[]) {
    const saveFn = save[name] ?? ((store, value, create) => store.saveRecord(name, value, create));
    app.get(`/api/${name}`, async (_req, res) => res.json(await db().list(name)));
    app.post(`/api/${name}`, async (req, res) =>
      res.json(await db().serial(() => saveFn(db(), req.body, true))),
    );
    app.put(`/api/${name}/:id`, async (req, res) => {
      if (id(req.params.id) !== req.body.id) throw new DataError('Identifiant incohérent');
      res.json(await db().serial(() => saveFn(db(), req.body)));
    });
    app.delete(`/api/${name}/:id`, async (req, res) => {
      confirmed(req.body);
      res.json(await db().serial(() => db().deleteRecord(name, id(req.params.id))));
    });
  }
  app.get('/api/documents', async (_req, res) => res.json(await db().list('documents')));
  app.post('/api/documents', async (req, res) => {
    const { document, content } = z
      .object({ document: documentSchema, content: z.string().max(28000000) })
      .parse(req.body);
    res.json(
      await db().serial(async () => {
        await db().assertReady();
        await db().list('documents');
        const ext = path.extname(document.nom).toLowerCase();
        if (
          !['.pdf', '.txt', '.png', '.jpg', '.jpeg', '.docx', '.xlsx', '.odt', '.ods'].includes(ext)
        )
          throw new DataError('Format non pris en charge');
        const bytes = Buffer.from(content, 'base64');
        if (bytes.length > 20 * 1024 * 1024) throw new DataError('Fichier limité à 20 Mo');
        if (ext === '.pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
          throw new DataError('PDF invalide');
        document.fichier = `documents/${document.categorie}/${document.id}${ext}`;
        document.taille = bytes.length;
        if (await exists(await db().safe(document.fichier)))
          throw new DataError('Fichier déjà présent', 409);
        await db().snapshot();
        await atomicBytes(await db().safe(document.fichier), bytes);
        return db().saveRecord('documents', document, true);
      }),
    );
  });
  app.put('/api/documents/:id', async (req, res) => {
    const item = documentSchema.parse(req.body);
    if (id(req.params.id) !== item.id) throw new DataError('Identifiant incohérent');
    res.json(
      await db().serial(async () => {
        await db().assertReady();
        const old = (await db().list('documents')).find((d) => d.id === item.id) as
          Document | undefined;
        if (!old) throw new DataError('Document introuvable', 404);
        if (path.extname(old.nom).toLowerCase() !== path.extname(item.nom).toLowerCase())
          throw new DataError('Conservez l’extension du fichier.');
        if (old.updatedAt !== item.updatedAt)
          throw new DataError('Le document a changé. Rechargez la liste.', 409);
        item.fichier = `documents/${item.categorie}/${item.id}${path.extname(old.fichier)}`;
        item.taille = old.taille;
        await db().snapshot();
        if (item.fichier !== old.fichier) {
          await atomicBytes(
            await db().safe(item.fichier),
            await fs.readFile(await db().safe(old.fichier)),
          );
        }
        const result = await db().saveRecord('documents', item);
        if (item.fichier !== old.fichier) await fs.rm(await db().safe(old.fichier));
        return result;
      }),
    );
  });
  app.get('/api/documents/:id/ouvrir', async (req, res) => {
    const d = (await db().list('documents')).find((d) => d.id === id(req.params.id)) as
      Document | undefined;
    if (!d) throw new DataError('Document introuvable', 404);
    const file = await db().safe(d.fichier);
    if (['.pdf', '.png', '.jpg', '.jpeg', '.txt'].includes(path.extname(d.fichier))) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.sendFile(file);
    } else res.download(file, d.nom);
  });
  app.delete('/api/documents/:id', async (req, res) => {
    confirmed(req.body);
    res.json(await db().serial(() => db().deleteRecord('documents', id(req.params.id))));
  });
  app.get('/api/sauvegardes', async (_req, res) => res.json(await db().backups()));
  app.post('/api/sauvegardes', async (_req, res) =>
    res.json(await db().serial(() => db().snapshot())),
  );
  app.get('/api/sauvegardes/:id/export', async (req, res) => {
    const backup = z
      .string()
      .regex(/^[\w-]+$/)
      .parse(req.params.id);
    await streamBackupZip(res, db(), backup, (await db().config()).association);
  });
  app.post('/api/sauvegardes/:id/restaurer', async (req, res) => {
    confirmed(req.body);
    const backup = z
      .string()
      .regex(/^[\w-]+$/)
      .parse(req.params.id);
    res.json(await db().serial(() => db().restore(backup)));
  });
  app.get('/api/corbeille', async (_req, res) => res.json(await db().trash()));
  app.post('/api/corbeille/:id/restaurer', async (req, res) => {
    confirmed(req.body);
    res.json(await db().serial(() => db().restoreTrash(id(req.params.id))));
  });
  app.delete('/api/corbeille', async (req, res) => {
    confirmed(req.body);
    res.json(await db().serial(() => db().emptyTrash()));
  });
  app.post('/api/verifier', async (_req, res) => res.json(await db().verify()));
  app.post('/api/ouvrir-repertoire', async (_req, res) => {
    await noLinks(db().root);
    if (!(await exists(db().root)))
      throw new DataError(
        'Le répertoire de travail est introuvable. Il a peut-être été déplacé ou supprimé.',
        404,
      );
    if (process.platform !== 'win32')
      throw new DataError('Ouverture de l’explorateur de fichiers non disponible sur ce système.');
    const explorer = path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe');
    const child = spawn(explorer, [db().root], {
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } catch {
      throw new DataError('Impossible d’ouvrir l’explorateur de fichiers Windows.');
    }
    child.unref();
    res.json({ ok: true });
  });
  app.get('/api/logs', async (_req, res) => {
    res.type('text/plain').send(
      await fs
        .readFile(path.join(options.configDir, 'logs', 'application.log'), 'utf8')
        .catch((e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return 'Aucune erreur enregistrée.';
          throw e;
        }),
    );
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Opération inconnue' }));
  app.use(
    (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        error instanceof DataError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : typeof error === 'object' &&
                error &&
                'type' in error &&
                error.type === 'entity.parse.failed'
              ? 400
              : typeof error === 'object' &&
                  error &&
                  'type' in error &&
                  error.type === 'entity.too.large'
                ? 413
                : 500;
      const message =
        status === 413
          ? 'Le contenu envoyé dépasse la taille autorisée.'
          : typeof error === 'object' &&
              error &&
              'type' in error &&
              error.type === 'entity.parse.failed'
            ? 'Le contenu JSON envoyé est invalide.'
            : error instanceof z.ZodError
              ? 'Données invalides : ' +
                error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(';')
              : error instanceof Error
                ? error.message
                : 'Erreur inconnue';
      const logDir = path.join(options.configDir, 'logs');
      void fs
        .mkdir(logDir, { recursive: true })
        .then(() =>
          fs.appendFile(
            path.join(logDir, 'application.log'),
            JSON.stringify({
              timestamp: new Date().toISOString(),
              niveau: 'error',
              action: req.method + ' ' + req.route?.path,
              message:
                status === 422
                  ? 'Fichier illisible ou incompatible'
                  : error instanceof z.ZodError
                    ? 'Entrée non conforme'
                    : error instanceof DataError
                      ? 'Opération refusée'
                      : 'Erreur de lecture ou écriture locale',
              contexte: {
                status,
                code:
                  typeof error === 'object' && error && 'code' in error
                    ? String(error.code)
                    : undefined,
              },
            }) + '\n',
          ),
        )
        .catch(() => process.stderr.write('Impossible d’écrire le journal local.\n'));
      res.status(status).json({ error: message });
    },
  );
  return app;
}
