#!/usr/bin/env node
/**
 * Syncs gallery images from content/ to the R2 bucket and maintains
 * content/images-manifest.json (the committed source of truth the site
 * builds from — the image files themselves are gitignored).
 *
 * Usage:
 *   npm run images:sync                 probe, upload changed files, write manifest
 *   npm run images:sync -- --dry-run    report what would happen, change nothing
 *   npm run images:sync -- --skip-upload  write manifest only (entries marked unsynced)
 *   npm run images:sync -- --prune      also delete R2 objects with no local file
 *   npm run images:sync -- --force      re-upload everything (e.g. to refresh headers)
 *
 * Requires `npx wrangler login` (or CLOUDFLARE_API_TOKEN) for uploads.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';

const BUCKET = 'krapac-images';
const COLLECTIONS = ['galleries', 'hidden-galleries'];
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;
const UPLOAD_CONCURRENCY = 4;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(rootDir, 'content');
const manifestPath = path.join(contentDir, 'images-manifest.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipUpload = args.has('--skip-upload');
const prune = args.has('--prune');
const force = args.has('--force');

const execFileAsync = promisify(execFile);

const contentTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const loadManifest = async () => {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return {};
  }
};

const listLocalImages = async () => {
  const keys = [];
  for (const collection of COLLECTIONS) {
    const dir = path.join(contentDir, collection);
    let files;
    try {
      files = await readdir(dir, { recursive: true });
    } catch {
      continue;
    }
    for (const file of files) {
      if (IMAGE_RE.test(file)) {
        keys.push(`${collection}/${file.split(path.sep).join('/')}`);
      }
    }
  }
  return keys.sort();
};

const uploadToR2 = (key) =>
  execFileAsync('npx', [
    'wrangler',
    'r2',
    'object',
    'put',
    `${BUCKET}/${key}`,
    '--file',
    path.join(contentDir, key),
    '--content-type',
    contentTypes[path.extname(key).toLowerCase()] ?? 'application/octet-stream',
    // Long-lived caching for edge and browsers; site URLs carry a ?v=<hash>
    // version, so replaced images bust the cache despite `immutable`.
    '--cache-control',
    'public, max-age=31536000, immutable',
    '--remote',
  ]);

const deleteFromR2 = (key) =>
  execFileAsync('npx', ['wrangler', 'r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote']);

const runWithConcurrency = async (tasks, limit) => {
  const queue = [...tasks];
  const failures = [];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        try {
          await task();
        } catch (error) {
          failures.push(error);
        }
      }
    })
  );
  return failures;
};

const previousManifest = await loadManifest();
const localKeys = await listLocalImages();
const manifest = {};
const toUpload = [];

for (const key of localKeys) {
  const buffer = await readFile(path.join(contentDir, key));
  const { width, height } = imageSize(buffer);
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const previous = previousManifest[key];
  const synced =
    !force && Boolean(previous && previous.hash === hash && previous.synced);
  manifest[key] = { width, height, hash, synced };
  if (!synced) {
    toUpload.push(key);
  }
}

const orphans = Object.keys(previousManifest).filter((key) => !manifest[key]);

console.log(
  `${localKeys.length} local images, ${toUpload.length} to upload, ${orphans.length} orphaned in manifest`
);

if (dryRun) {
  toUpload.forEach((key) => console.log(`  would upload: ${key}`));
  orphans.forEach((key) =>
    console.log(`  would remove from manifest${prune ? ' and delete from R2' : ''}: ${key}`)
  );
  process.exit(0);
}

if (!skipUpload && toUpload.length > 0) {
  let done = 0;
  const failures = await runWithConcurrency(
    toUpload.map((key) => async () => {
      try {
        await uploadToR2(key);
        manifest[key].synced = true;
        console.log(`  uploaded ${key} (${++done}/${toUpload.length})`);
      } catch (error) {
        console.error(`  FAILED ${key}: ${error.stderr || error.message}`);
        throw error;
      }
    }),
    UPLOAD_CONCURRENCY
  );
  if (failures.length > 0) {
    console.error(`${failures.length} uploads failed — rerun to retry (manifest tracks them as unsynced).`);
  }
}

if (orphans.length > 0) {
  if (prune) {
    for (const key of orphans) {
      try {
        await deleteFromR2(key);
        console.log(`  deleted from R2: ${key}`);
      } catch (error) {
        console.error(`  FAILED to delete ${key}: ${error.stderr || error.message}`);
      }
    }
  } else {
    orphans.forEach((key) =>
      console.log(`  removed from manifest (still in R2, use --prune to delete): ${key}`)
    );
  }
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifestPath}`);

const unsynced = Object.values(manifest).filter((entry) => !entry.synced).length;
if (unsynced > 0) {
  console.warn(`${unsynced} images are not yet uploaded to R2.`);
  process.exitCode = skipUpload ? 0 : 1;
}
