# Regional Anatomy Atlas

An interactive, cross-linked human anatomy atlas for PA / PANCE study. It's a static site built with [Astro](https://astro.build). Content lives in plain Markdown files that you can edit without touching the code.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321, reloads when you edit content
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run check      # type-check the code
npm run lint       # check the YAML syntax of every entry (the build checks the schema)
npm run check:links  # after a build: every internal link in dist/ resolves
```

Requires Node 22.12 or later.

Every pull request runs these checks automatically (`.github/workflows/ci.yml`): lint, type check, a build that
fails on links to missing entries, and the link check.

## Where things live

| Path | What |
|---|---|
| `content/structures/<region>/<id>.md` | **One file per structure.** This is where you edit. |
| `content/templates/` | Copy-ready templates, one per structure type |
| `content/regions.yaml` | Region names, order, sub-regions |
| `content/images.yaml` | Image registry (public domain / CC0 only, enforced) |
| `content/models.yaml` | 3D model registry: parts, views, credit (public domain, CC0 or CC BY 4.0) |
| `public/models/` | 3D model files (`.glb`) and their preview images |
| `public/images/` | Image files |
| `docs/SCHEMA.md` | **The content schema.** Read this before editing. |
| `src/content.config.ts` | Machine-readable schema (validation) |
| `src/diagrams/` | Original SVG schematics |
| `src/scripts/model-viewer.ts` | The 3D viewer (three.js), loaded only when a reader opens a model |
| `src/lib/atlas.ts` | Linking, backlinks, verify-flag collection |

## Adding an entry

1. Copy `content/templates/<type>.md` to `content/structures/<region>/<new-id>.md`.
2. Fill it in, linking to other entries with `[[other-id]]` and flagging uncertain facts with `{{verify: reason}}`.
3. With `npm run dev` running, the page appears at `/<region>/<new-id>/`. Any schema error shows in the browser and terminal, naming the file and field.

## Pages

- `/`: region index
- `/<region>/`: every structure in a region, grouped by type, with completeness bars
- `/<region>/<id>/`: structure page (anatomy, clinical, imaging, exam, self-quiz)
- `/search/`: search with region, type and high-yield filters. The quick search is in the header; press `/` to open it.
- `/review/`: every `{{verify}}` flag, links to entries not yet written, and incomplete entries
- `/credits/`: every image's and 3D model's source and license

## Deploy

Push to `main` and the GitHub Action in `.github/workflows/deploy.yml` publishes to GitHub Pages. First, enable Pages once in repo Settings → Pages → Source: GitHub Actions. The output in `dist/` is plain static files, so Netlify, Cloudflare Pages or any static host works too.

## Content policy

- Terminology follows Terminologia Anatomica (English equivalents in `name`, Latin in `taName`).
- Images are public domain only (for example, Gray's Anatomy 1918 plates from Wikimedia Commons), with source and license recorded. Material from Netter, Rohen, Grant's or other copyrighted atlases is never used.
- 3D models may also be CC BY 4.0 (for example, the Human Reference Atlas organs built from the Visible Human Project), credited under the viewer and on `/credits/`.
- Anything uncertain is tagged `{{verify}}`, to be checked against your textbook (Netter).
