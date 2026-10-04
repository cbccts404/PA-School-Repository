/**
 * CONTENT SCHEMA
 * --------------
 * Every structure is one Markdown file in content/structures/<region>/<id>.md.
 * All data lives in the YAML frontmatter; this file only defines its shape so
 * the build can reject typos, missing required fields, and malformed quizzes.
 *
 * Text fields are Markdown and support two inline extensions:
 *   [[median-nerve]]            -> link to another structure (shows its name)
 *   [[median-nerve|the median]] -> link with custom text
 *   {{verify}} / {{verify: why}} -> "verify" flag; collected on /review/
 *
 * See docs/SCHEMA.md for the human-readable version with examples.
 */
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

// ---------- primitives ----------
/** Markdown string (may contain [[links]] and {{verify}} tags). */
const md = z.string().min(1);
/** A structure id = its filename without .md (kebab-case, unique atlas-wide). */
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are kebab-case, e.g. "median-nerve"');

export const STRUCTURE_TYPES = [
  'bone', 'muscle', 'nerve', 'artery', 'vein', 'lymphatic',
  'organ', 'joint', 'ligament', 'space',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

/** Organ-system categories of the NCCPA PANCE content blueprint, used to study by system. */
export const BODY_SYSTEMS = [
  'cardiovascular', 'dermatologic', 'endocrine', 'eent', 'gastrointestinal', 'genitourinary', 'hematologic',
  'infectious', 'musculoskeletal', 'neurologic', 'psychiatric', 'pulmonary', 'renal', 'reproductive',
] as const;
export type BodySystem = (typeof BODY_SYSTEMS)[number];

// ---------- type-specific "Core anatomy" blocks ----------
// strictObject = unknown keys are an error, so a misspelled field name fails
// the build instead of silently disappearing.
const common = {
  location: md.optional(),
  relations: md.optional(),
  notes: md.optional(),
};

const anatomyByType = {
  bone: z.strictObject({
    ...common,
    classification: md.optional(),           // e.g. "Long bone"
    features: z.array(md).default([]),        // named landmarks
    ossification: md.optional(),
  }),
  muscle: z.strictObject({
    ...common,
    group: md.optional(),                     // compartment / layer
    origin: md.optional(),
    insertion: md.optional(),
    innervation: md.optional(),               // link the nerve: [[median-nerve]] (C6–C7)
    bloodSupply: md.optional(),               // link the artery
    action: z.array(md).default([]),
  }),
  nerve: z.strictObject({
    ...common,
    roots: md.optional(),                     // e.g. "C5–C6"
    origin: md.optional(),                    // parent: "[[lateral-cord]]"
    course: md.optional(),
    branches: z.array(md).default([]),
    motor: md.optional(),                     // summary; muscle list is auto-derived
    sensory: md.optional(),
  }),
  artery: z.strictObject({
    ...common,
    origin: md.optional(),                    // parent: "Continuation of [[axillary-artery]]"
    course: md.optional(),
    branches: z.array(md).default([]),
    supplies: md.optional(),                  // summary; supplied structures are auto-derived
    anastomoses: md.optional(),
    termination: md.optional(),
  }),
  vein: z.strictObject({
    ...common,
    formation: md.optional(),
    course: md.optional(),
    tributaries: z.array(md).default([]),
    drainage: md.optional(),                  // drains into
  }),
  lymphatic: z.strictObject({
    ...common,
    drains: md.optional(),                    // territory
    drainsTo: md.optional(),
  }),
  organ: z.strictObject({
    ...common,
    parts: z.array(md).default([]),
    bloodSupply: md.optional(),
    venousDrainage: md.optional(),
    lymphatics: md.optional(),
    innervation: md.optional(),
  }),
  joint: z.strictObject({
    ...common,
    classification: md.optional(),           // e.g. "Synovial ball-and-socket"
    bones: md.optional(),                     // articulating surfaces; link the bones
    capsule: md.optional(),
    ligaments: z.array(md).default([]),
    movements: z.array(md).default([]),
    stability: md.optional(),
    innervation: md.optional(),
    bloodSupply: md.optional(),
  }),
  ligament: z.strictObject({
    ...common,
    attachments: md.optional(),
    function: md.optional(),
  }),
  space: z.strictObject({
    ...common,
    boundaries: z.record(z.string(), md).default({}), // { apex: ..., base: ..., medial: ... }
    contents: z.array(md).default([]),
    communications: md.optional(),
  }),
} as const;

// ---------- shared sections ----------
const clinicalItem = z.strictObject({
  title: z.string(),
  highYield: z.boolean().default(false),      // PANCE high-yield flag
  mechanism: md.optional(),                   // cause / lesion / injury mechanism
  presentation: md.optional(),                // classic presentation & findings
  notes: md.optional(),
});

const imaging = z.strictObject({
  xray: md.optional(),
  ct: md.optional(),
  mri: md.optional(),
  ultrasound: md.optional(),
  keyViews: z.array(md).default([]),
});

const specialTest = z.strictObject({
  name: z.string(),
  technique: md,
  positive: md.optional(),                    // what a positive test looks like
  significance: md.optional(),                // what it suggests
});

const exam = z.strictObject({
  landmarks: md.optional(),                   // surface anatomy
  palpation: md.optional(),
  testing: md.optional(),                     // strength / function testing
  specialTests: z.array(specialTest).default([]),
});

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
const quizItem = z
  .strictObject({
    stem: md,
    choices: z.array(md).min(4).max(5),
    answer: z.enum(LETTERS),
    explanation: md,
    tags: z.array(z.string()).default([]),
  })
  .refine((q) => LETTERS.indexOf(q.answer) < q.choices.length, {
    message: 'answer letter is beyond the number of choices',
    path: ['answer'],
  });

const flashcard = z.strictObject({ front: md, back: md });

const imageUse = z.strictObject({
  image: id,                                  // id from content/images.yaml
  caption: md.optional(),
});

// ---------- the structure schema ----------
const baseFields = {
  name: z.string(),
  region: id,                                 // id from content/regions.yaml
  subregion: z.string().optional(),           // e.g. "Arm", "Forearm", "Hand"
  taName: z.string().optional(),              // Terminologia Anatomica (Latin)
  aka: z.array(z.string()).default([]),       // synonyms / eponyms (searchable)
  summary: z.string(),                        // one-line description
  tags: z.array(z.string()).default([]),
  systems: z.array(z.enum(BODY_SYSTEMS)).min(1, 'assign at least one PANCE body system'),
  highYield: z.boolean().default(false),
  status: z.enum(['stub', 'draft', 'reviewed']).default('draft'),
  netterPlate: z.string().optional(),         // for YOUR reference; fill in per your edition
  clinical: z.array(clinicalItem).default([]),
  pance: z.array(md).default([]),             // high-yield PANCE pearls
  imaging: imaging.optional(),
  exam: exam.optional(),
  quiz: z.array(quizItem).default([]),
  flashcards: z.array(flashcard).default([]),
  images: z.array(imageUse).default([]),
  diagrams: z.array(id).default([]),
  models: z.array(id).default([]),            // ids from content/models.yaml (interactive 3D)
  related: z.array(id).default([]),           // extra "see also" links
  sources: z.array(z.string()).default([]),   // references consulted
};

const variant = <T extends StructureType>(type: T) => {
  const anatomy = anatomyByType[type] as (typeof anatomyByType)[T];
  return z.strictObject({
    ...baseFields,
    type: z.literal(type),
    // every anatomy field is optional, so a missing block parses as {}
    anatomy: (anatomy as z.ZodObject).prefault({}) as unknown as z.ZodDefault<(typeof anatomyByType)[T]>,
  });
};

const structureSchema = z.discriminatedUnion('type', [
  variant('bone'), variant('muscle'), variant('nerve'), variant('artery'), variant('vein'),
  variant('lymphatic'), variant('organ'), variant('joint'), variant('ligament'), variant('space'),
]);

const structures = defineCollection({
  // files starting with "_" are ignored (drafts, templates)
  loader: glob({
    pattern: '**/[^_]*.md',
    base: './content/structures',
    generateId: ({ entry }) => entry.split('/').pop()!.replace(/\.md$/, ''),
  }),
  schema: structureSchema,
});

const regions = defineCollection({
  loader: file('./content/regions.yaml'),
  schema: z.strictObject({
    id,
    name: z.string(),
    order: z.number(),
    blurb: z.string(),
    subregions: z.array(z.string()).default([]),
  }),
});

const images = defineCollection({
  loader: file('./content/images.yaml'),
  schema: z.strictObject({
    id,
    file: z.string(),                         // path under public/, e.g. images/gray-0412.png
    title: z.string(),
    author: z.string(),                       // e.g. "Henry Vandyke Carter"
    work: z.string().optional(),              // e.g. "Gray's Anatomy of the Human Body, 20th ed. (1918)"
    source: z.url(),                          // Wikimedia Commons file page
    // Only public-domain material is allowed. Anything else fails the build.
    license: z.enum(['Public domain', 'CC0']),
    licenseNote: z.string().optional(),       // e.g. "PD-US: published before 1931"
    alt: z.string(),
  }),
});

// 3D models (content/models.yaml). Unlike images, CC BY is allowed: the credit is shown under the viewer.
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'colors look like "#9a3b36"');
const VIEW_DIRECTIONS = ['anterior', 'posterior', 'superior', 'inferior', 'left', 'right'] as const;
const modelPart = z.strictObject({
  id,                                         // used by views[].hide
  node: z.string(),                           // mesh name inside the .glb
  label: z.string(),
  group: z.string(),                          // legend heading; must be listed in groups
  color: hex.optional(),                      // overrides the group color
  side: z.enum(['right', 'left']).optional(), // for the "Color by side" view
  internal: z.boolean().default(false),       // inside other parts: selecting it turns on see-through mode
  to: id.optional(),                          // atlas entry this part links to
  note: md.optional(),
});
const models = defineCollection({
  loader: file('./content/models.yaml'),
  schema: z
    .strictObject({
      id,
      file: z.string(),                       // path under public/, e.g. models/heart-vh-male.glb
      poster: z.string().optional(),          // still image shown until the viewer loads
      entry: id,                              // the atlas entry the whole model shows
      title: z.string(),
      description: z.string(),
      author: z.string(),
      work: z.string().optional(),
      source: z.url(),
      license: z.enum(['Public domain', 'CC0', 'CC BY 4.0']),
      licenseNote: z.string().optional(),
      alt: z.string(),
      groups: z.array(z.strictObject({ name: z.string(), color: hex })).min(1),
      parts: z.array(modelPart).min(1),
      views: z
        .array(
          z.strictObject({
            name: z.string(),
            from: z.union([z.enum(VIEW_DIRECTIONS), z.tuple([z.number(), z.number(), z.number()])]),
            hide: z.array(id).default([]),    // part ids
            note: z.string().optional(),
          }),
        )
        .default([]),
    })
    .superRefine((m, ctx) => {
      const groups = new Set(m.groups.map((g) => g.name));
      const parts = new Set<string>();
      m.parts.forEach((p, i) => {
        if (parts.has(p.id)) ctx.addIssue({ code: 'custom', message: `duplicate part id "${p.id}"`, path: ['parts', i, 'id'] });
        parts.add(p.id);
        if (!groups.has(p.group))
          ctx.addIssue({ code: 'custom', message: `group "${p.group}" is not listed in groups`, path: ['parts', i, 'group'] });
      });
      m.views.forEach((v, i) =>
        v.hide.forEach((h, j) => {
          if (!parts.has(h)) ctx.addIssue({ code: 'custom', message: `no part with id "${h}"`, path: ['views', i, 'hide', j] });
        }),
      );
    }),
});

// Comparison tables (content/tables/*.yaml): cells are Markdown with [[links]].
const tables = defineCollection({
  loader: glob({ pattern: '**/[^_]*.yaml', base: './content/tables' }),
  schema: z
    .strictObject({
      title: z.string(),
      region: id.optional(),
      summary: z.string(),
      columns: z.array(z.string()).min(2),
      rows: z.array(z.array(z.string())).min(1),
      notes: z.array(z.string()).default([]),
    })
    .refine((t) => t.rows.every((r) => r.length === t.columns.length), {
      message: 'every row needs one cell per column',
      path: ['rows'],
    }),
});

// Lesion localizer (content/localizer/*.yaml). The page checks that every finding a lesion names exists.
const findings = defineCollection({
  loader: file('./content/localizer/findings.yaml'),
  schema: z.strictObject({ id, group: z.string(), label: z.string() }),
});

const lesions = defineCollection({
  loader: file('./content/localizer/lesions.yaml'),
  schema: z.strictObject({
    id,
    name: z.string(),
    site: z.string(),
    findings: z.array(id).min(1),   // expected findings (ids from findings.yaml)
    against: z.array(id).default([]), // findings that argue against this site
    entries: z.array(id).default([]), // atlas entries to study
    why: z.string(),                // Markdown; may use [[links]]
  }),
});

// Nerve root map (content/roots/roots.yaml). Region ids in src/lib/dermatome-shapes.ts match these ids.
const roots = defineCollection({
  loader: file('./content/roots/roots.yaml'),
  schema: z.strictObject({
    id: z.string().regex(/^[CTLS]\d+(-S\d+)?$/, 'root ids look like "C5" or "S2-S4"'),
    label: z.string().optional(), // display label when it differs from the id
    group: z.enum(['Upper limb and neck', 'Trunk', 'Lower limb', 'Sacral']),
    dermatome: z.string(),
    muscle: z.string(),
    reflex: z.string(),
    clue: z.string(), // Markdown
    entries: z.array(id).min(1),
  }),
});

// Clinical cases (content/cases/*.yaml): a vignette worked through in steps, each a question with an explanation.
const caseStep = z
  .strictObject({
    info: md.optional(), // new findings revealed before this step's question
    question: md,
    choices: z.array(md).min(4).max(5),
    answer: z.enum(LETTERS),
    explanation: md,
  })
  .refine((s) => LETTERS.indexOf(s.answer) < s.choices.length, {
    message: 'answer letter is beyond the number of choices',
    path: ['answer'],
  });
const cases = defineCollection({
  loader: glob({ pattern: '**/[^_]*.yaml', base: './content/cases' }),
  schema: z.strictObject({
    title: z.string(),
    region: id,
    summary: z.string(),
    vignette: md,
    steps: z.array(caseStep).min(2),
    takeaways: z.array(md).default([]),
    entries: z.array(id).min(1), // atlas entries the case draws on
  }),
});

export const collections = { structures, regions, images, models, tables, findings, lesions, roots, cases };
