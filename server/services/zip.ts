import path from 'node:path';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { DataError, exists, type Storage } from './storage.js';

// Turns an association name into a filesystem/URL-safe token for the zip filename.
function slug(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'association'
  );
}

// Streams an existing, already-verified backup folder as a single .zip download —
// the "off-site" copy a member can save to a USB key or a personal cloud drive.
// The zip's root holds the same files as the backup (config.json, collections,
// reunions/, documents/, corbeille/), so it is a complete, browsable copy.
export async function streamBackupZip(
  res: Response,
  store: Storage,
  backupId: string,
  association: string,
) {
  const source = await store.safe(`sauvegardes/${backupId}`);
  if (!(await exists(path.join(source, 'manifest.json'))))
    throw new DataError('Sauvegarde introuvable', 404);
  const filename = `Filoustics_${slug(association)}_${backupId}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  await new Promise<void>((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (error) => {
      res.destroy(error);
      reject(error);
    });
    res.on('close', resolve);
    archive.pipe(res);
    archive.directory(source, false);
    void archive.finalize();
  });
}
