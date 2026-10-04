# Content schema

Each structure is a single Markdown file:

```
content/structures/<region>/<id>.md
```

- **`<id>`** is the filename. It must be kebab-case (`median-nerve`) and unique across the whole atlas. Other entries use it to link here.
- All data is in the **YAML frontmatter** between the `---` lines. Every text field is Markdown.
- Files that start with `_` are ignored, so you can use `_draft-foo.md` for work in progress.
- The build **fails loudly** if a field name is misspelled, a required field is missing, a quiz answer letter doesn't exist, an image isn't public-domain, and so on. The error message names the file and the field.
- Copy-ready templates for each type are in `content/templates/`.

## Inline syntax (works in every text field)

| You write | You get |
|---|---|
| `[[median-nerve]]` | A link showing the entry's name: "Median nerve" at the start of a sentence, "median nerve" mid-sentence. Names starting with an eponym or acronym keep their case. |
| `[[median-nerve\|median n.]]` | A link with your own text |
| `{{verify}}` | A yellow **VERIFY** badge |
| `{{verify: some texts say C5–T1}}` | A badge that shows the reason when tapped |

- Links to entries that don't exist yet appear as dashed text and are listed on **/review/**, so typos get caught too.
- Every verify flag is also listed on **/review/**.
- Running `STRICT_LINKS=1 npm run build` turns missing links into build errors.

## Fields shared by every type

| Field | Required | Notes |
|---|---|---|
| `name` | ✓ | Display name in English TA form ("Pronator teres") |
| `type` | ✓ | `bone` `muscle` `nerve` `artery` `vein` `lymphatic` `organ` `joint` `ligament` `space` |
| `region` | ✓ | `back` `thorax` `abdomen` `pelvis-perineum` `upper-limb` `lower-limb` `head-neck` `neuroanatomy` |
| `summary` | ✓ | A one-line description, shown in lists and search results |
| `subregion` | | Groups entries on the region page, e.g. "Forearm" (list in `content/regions.yaml`) |
| `taName` | | Latin Terminologia Anatomica term |
| `aka` | | List of synonyms and eponyms. These are searchable. |
| `tags` | | Free tags, e.g. `brachial-plexus`, `rotator-cuff`. These are searchable. |
| `highYield` | | `true` shows an HY badge and enables a high-yield search filter |
| `status` | | `stub` → `draft` → `reviewed`. **Set `reviewed` once you've checked the entry.** |
| `netterPlate` | | For your own cross-reference; fill it in from your edition |
| `anatomy` | | Section 1. Its fields depend on `type` (see below). |
| `clinical` | | Section 2. List of `{ title, highYield, mechanism, presentation, notes }` |
| `pance` | | Section 2. List of high-yield PANCE pearls, one sentence each |
| `imaging` | | Section 3. `{ xray, ct, mri, ultrasound, keyViews: [] }` |
| `exam` | | Section 4. `{ landmarks, palpation, testing, specialTests: [{ name, technique, positive, significance }] }` |
| `quiz` | | Section 5. List of `{ stem, choices: [4–5], answer: A–E, explanation, tags }` |
| `flashcards` | | Section 5. List of `{ front, back }` |
| `images` | | List of `{ image: <id in content/images.yaml>, caption }` |
| `diagrams` | | List of diagram ids (from `src/diagrams/registry.ts`) |
| `models` | | List of 3D model ids (from `content/models.yaml`) |
| `related` | | Extra "See also" entry ids |
| `sources` | | References consulted for this entry |

## `anatomy:` fields by type

Every type also accepts `location`, `relations` and `notes`. A field that is `[list]` takes a YAML list. All other fields are single Markdown strings.

| Type | Fields |
|---|---|
| **bone** | `classification`, `features` [list], `ossification` |
| **muscle** | `group`, `origin`, `insertion`, `innervation`, `bloodSupply`, `action` [list] |
| **nerve** | `roots`, `origin`, `course`, `branches` [list], `motor`, `sensory` |
| **artery** | `origin`, `course`, `branches` [list], `supplies`, `anastomoses`, `termination` |
| **vein** | `formation`, `course`, `tributaries` [list], `drainage` |
| **lymphatic** | `drains`, `drainsTo` |
| **organ** | `parts` [list], `bloodSupply`, `venousDrainage`, `lymphatics`, `innervation` |
| **joint** | `classification`, `bones`, `capsule`, `ligaments` [list], `movements` [list], `stability`, `innervation`, `bloodSupply` |
| **ligament** | `attachments`, `function` |
| **space** | `boundaries` {key: text}, `contents` [list], `communications` |

## Cross-linking is automatic in the reverse direction

You only write a link once, on the entry where the fact belongs. The target page builds its reverse list from **which field the link sits in**:

| If entry S links to T in… | T's page lists S under… |
|---|---|
| muscle `innervation` | **Muscles innervated** (nerve pages also show muscles supplied by their named branches) |
| nerve/artery `origin` | **Branches** |
| vein `drainage` | **Tributaries** |
| any `bloodSupply` | **Structures supplied** |
| muscle `origin` / `insertion` | **Muscle attachments** (tagged origin/insertion) |
| joint `bones` | **Joints** |
| space `contents` | **Found in** |
| space `boundaries` | **Forms a boundary of** |
| anywhere else | **Mentioned in** |

For example, writing `innervation: "[[median-nerve]] (C6, C7)"` on Pronator teres is enough for the Median nerve page to list Pronator teres under "Muscles innervated". Linking the ulnar head's origin to `[[ulna]]` makes the Ulna page list it under "Muscle attachments".

## Full example (muscle)

```yaml
---
name: Pronator teres
type: muscle
region: upper-limb
subregion: Forearm
taName: Musculus pronator teres
summary: Superficial flexor-compartment muscle of the forearm; pronates the forearm.
highYield: false
status: draft
anatomy:
  group: Anterior compartment of forearm, superficial layer
  origin: "Humeral head: medial epicondyle of the [[humerus]]. Ulnar head: coronoid process of the [[ulna]]."
  insertion: Middle of the lateral surface of the [[radius]].
  innervation: "[[median-nerve]] (C6, C7)"
  bloodSupply: "[[ulnar-artery]] and [[radial-artery]] branches {{verify}}"
  action:
    - Pronates the forearm
    - Assists flexion of the elbow
clinical:
  - title: Pronator syndrome
    highYield: false
    mechanism: Compression of the [[median-nerve]] as it passes between the two heads.
    presentation: …
pance:
  - …
imaging:
  mri: …
exam:
  testing: …
  specialTests:
    - name: …
      technique: …
      positive: …
      significance: …
quiz:
  - stem: …
    choices: [A text, B text, C text, D text, E text]
    answer: C
    explanation: …
flashcards:
  - front: Pronator teres — innervation?
    back: Median nerve (C6, C7)
---
```

## Images (`content/images.yaml`)

- Put the file in `public/images/` and register it in `content/images.yaml`.
- Required fields: `id`, `file`, `title`, `author`, `source` (the Wikimedia Commons file page), `license`, `alt`.
- `license` must be `Public domain` or `CC0`. Anything else fails the build.
- **Never** add images from Netter, Rohen, Grant's or any other copyrighted atlas.

## 3D models (`content/models.yaml`)

An interactive 3D viewer on a structure page: rotate, zoom, tap a part to name it and open its entry, see through
the walls, color by side and quiz yourself. The page shows a still preview; three.js and the model only download
when the reader taps **Explore in 3D**.

- Put the `.glb` file in `public/models/` and register it in `content/models.yaml` (the comments at the top of that
  file explain every field). Show it on a page with `models: [<id>]`.
- `license` must be `Public domain`, `CC0` or `CC BY 4.0`. CC BY requires credit, so fill in `author`, `work` and
  `source`: they're shown under the viewer and on `/credits/`.
- Models must be in body coordinates (+x = the patient's left, +y = superior, +z = anterior). The
  [Human Reference Atlas 3D library](https://humanatlas.io/3d-reference-library) (CC BY 4.0, built from the Visible
  Human Project) already is, and its meshes are named per structure, so each one can become a clickable part.
- Compress the file before adding it. This keeps mesh names, so parts still work:
  `npx @gltf-transform/cli meshopt input.glb public/models/<id>.glb`
- `poster` (optional) is a still image shown before the viewer loads. A transparent `.webp` works in both themes.
- The build fails if the model file, poster or a part's `to` entry doesn't exist.
