// @ts-check
/**
 * Astro integration that runs after `astro build` and writes two files into the
 * output folder:
 *
 *   offline.json — every page and image (3D models count as images) with its size, used by the
 *                  "Save for offline" buttons on the home page.
 *   sw.js        — the service worker, with the app-shell file list and a
 *                  version hash baked in, so each deploy refreshes the cache.
 *
 * All paths are relative to the site root, so the same build works at "/" and
 * under a GitHub Pages sub-path.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// Pages and data saved automatically when the site is first opened.
const SHELL_PAGES = ['', 'quiz/', 'flashcards/', 'search/', 'offline/'];
const SHELL_FILES = ['search-index.json', 'quiz-bank.json', 'flashcard-bank.json', 'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

/** @returns {import('astro').AstroIntegration} */
export default function offline() {
  return {
    name: 'atlas-offline',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await walk(root)).map((p) => relative(root, p).split(sep).join('/')).sort();
        const template = await readFile(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8');
        const hash = createHash('sha256').update(template);
        const pages = [];
        const images = [];
        let pagesBytes = 0;
        let imagesBytes = 0;
        const assets = [];

        for (const f of files) {
          if (f === 'sw.js' || f === 'offline.json') continue;
          const size = (await stat(join(root, f))).size;
          if (f.startsWith('images/') || f.startsWith('models/')) {
            images.push(f);
            imagesBytes += size;
            hash.update(`${f}:${size}\n`);
            continue;
          }
          hash.update(f + '\n');
          hash.update(await readFile(join(root, f)));
          if (f.endsWith('index.html')) {
            pages.push(f.slice(0, -'index.html'.length));
            pagesBytes += size;
          } else if (f.startsWith('_astro/')) {
            assets.push(f);
          }
        }

        // region index pages (one level deep) are part of the shell too
        const regionPages = pages.filter((p) => /^[a-z-]+\/$/.test(p) && !SHELL_PAGES.includes(p));
        const shell = [...SHELL_PAGES, ...regionPages, ...SHELL_FILES.filter((f) => files.includes(f)), ...assets];
        const version = hash.digest('hex').slice(0, 12);

        await writeFile(join(root, 'offline.json'), JSON.stringify({ version, pages, pagesBytes, images, imagesBytes }));
        await writeFile(
          join(root, 'sw.js'),
          template.replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell)),
        );
        logger.info(`sw.js ${version}: ${shell.length} shell files; ${pages.length} pages, ${images.length} images listed for offline`);
      },
    },
  };
}
