/**
 * Atlas data layer: loads every collection once, resolves [[links]], computes
 * backlinks ("a nerve page lists the muscles whose innervation links to it"),
 * and collects QA items ({{verify}} flags, links to entries not yet written).
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';
import { BODY_SYSTEMS, STRUCTURE_TYPES, type BodySystem, type StructureType } from '../content.config';
import { diagrams } from '../diagrams/registry';

export type Structure = CollectionEntry<'structures'>;
export type Region = CollectionEntry<'regions'>;
export type Image = CollectionEntry<'images'>;
export type Model = CollectionEntry<'models'>;

// ---------- URLs ----------
const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';
export const url = (path = '') => BASE + path.replace(/^\//, '');
export const structureUrl = (s: Structure) => url(`${s.data.region}/${s.id}/`);
export const regionUrl = (regionId: string) => url(`${regionId}/`);
export const systemUrl = (system: BodySystem) => url(`systems/${system}/`);

// ---------- labels ----------
export { BODY_SYSTEMS, type BodySystem };
/** PANCE blueprint organ systems: [full name, short badge label] */
export const SYSTEM_LABELS: Record<BodySystem, [name: string, short: string]> = {
  cardiovascular: ['Cardiovascular', 'Cardio'],
  dermatologic: ['Dermatologic', 'Derm'],
  endocrine: ['Endocrine', 'Endo'],
  eent: ['Eyes, ears, nose & throat', 'EENT'],
  gastrointestinal: ['Gastrointestinal / nutritional', 'GI'],
  genitourinary: ['Genitourinary', 'GU'],
  hematologic: ['Hematologic', 'Heme'],
  infectious: ['Infectious diseases', 'ID'],
  musculoskeletal: ['Musculoskeletal', 'MSK'],
  neurologic: ['Neurologic', 'Neuro'],
  psychiatric: ['Psychiatry / behavioral', 'Psych'],
  pulmonary: ['Pulmonary', 'Pulm'],
  renal: ['Renal', 'Renal'],
  reproductive: ['Reproductive', 'Repro'],
};
export const TYPE_LABELS: Record<StructureType, [singular: string, plural: string]> = {
  bone: ['Bone', 'Bones'],
  muscle: ['Muscle', 'Muscles'],
  nerve: ['Nerve', 'Nerves'],
  artery: ['Artery', 'Arteries'],
  vein: ['Vein', 'Veins'],
  lymphatic: ['Lymphatic', 'Lymphatics'],
  organ: ['Organ', 'Organs'],
  joint: ['Joint', 'Joints'],
  ligament: ['Ligament', 'Ligaments'],
  space: ['Space / region', 'Spaces & regions'],
};
export const TYPE_ORDER = STRUCTURE_TYPES;

/** Display order + labels for each type's "Core anatomy" fields. */
export const ANATOMY_FIELDS: Record<StructureType, [key: string, label: string][]> = {
  bone: [['location', 'Location'], ['classification', 'Classification'], ['features', 'Key features & landmarks'], ['relations', 'Relations'], ['ossification', 'Ossification'], ['notes', 'Notes']],
  muscle: [['location', 'Location'], ['group', 'Group'], ['origin', 'Origin'], ['insertion', 'Insertion'], ['innervation', 'Innervation'], ['bloodSupply', 'Blood supply'], ['action', 'Action'], ['relations', 'Relations'], ['notes', 'Notes']],
  nerve: [['location', 'Location'], ['roots', 'Root values'], ['origin', 'Origin'], ['course', 'Course'], ['branches', 'Branches'], ['motor', 'Motor'], ['sensory', 'Sensory'], ['relations', 'Relations'], ['notes', 'Notes']],
  artery: [['location', 'Location'], ['origin', 'Origin'], ['course', 'Course'], ['branches', 'Branches'], ['supplies', 'Supplies'], ['anastomoses', 'Anastomoses'], ['termination', 'Termination'], ['relations', 'Relations'], ['notes', 'Notes']],
  vein: [['location', 'Location'], ['formation', 'Formation'], ['course', 'Course'], ['tributaries', 'Tributaries'], ['drainage', 'Drains into'], ['relations', 'Relations'], ['notes', 'Notes']],
  lymphatic: [['location', 'Location'], ['drains', 'Drains'], ['drainsTo', 'Drains to'], ['relations', 'Relations'], ['notes', 'Notes']],
  organ: [['location', 'Location'], ['parts', 'Parts'], ['relations', 'Relations'], ['bloodSupply', 'Arterial supply'], ['venousDrainage', 'Venous drainage'], ['lymphatics', 'Lymphatic drainage'], ['innervation', 'Innervation'], ['notes', 'Notes']],
  joint: [['location', 'Location'], ['classification', 'Classification'], ['bones', 'Articulating surfaces'], ['capsule', 'Capsule'], ['ligaments', 'Ligaments'], ['movements', 'Movements'], ['stability', 'Stability'], ['innervation', 'Innervation'], ['bloodSupply', 'Blood supply'], ['relations', 'Relations'], ['notes', 'Notes']],
  ligament: [['location', 'Location'], ['attachments', 'Attachments'], ['function', 'Function'], ['relations', 'Relations'], ['notes', 'Notes']],
  space: [['location', 'Location'], ['boundaries', 'Boundaries'], ['contents', 'Contents'], ['communications', 'Communications'], ['relations', 'Relations'], ['notes', 'Notes']],
};

/**
 * Backlink rules: when entry S links to entry T inside field F, T's page shows
 * S under this heading. Checked in order; first match wins.
 */
const RELATION_RULES: { from?: StructureType; to?: StructureType; field: RegExp; label: string; order: number }[] = [
  { from: 'muscle', to: 'nerve', field: /^anatomy\.innervation$/, label: 'Muscles innervated', order: 1 },
  { from: 'nerve', to: 'nerve', field: /^anatomy\.origin$/, label: 'Branches', order: 2 },
  { from: 'artery', to: 'artery', field: /^anatomy\.origin$/, label: 'Branches', order: 2 },
  { from: 'vein', to: 'vein', field: /^anatomy\.drainage$/, label: 'Tributaries', order: 2 },
  { to: 'nerve', field: /^anatomy\.innervation$/, label: 'Other structures innervated', order: 3 },
  { to: 'artery', field: /^anatomy\.bloodSupply$/, label: 'Structures supplied', order: 3 },
  { from: 'muscle', to: 'bone', field: /^anatomy\.(origin|insertion)$/, label: 'Muscle attachments', order: 4 },
  { from: 'joint', to: 'bone', field: /^anatomy\.bones$/, label: 'Joints', order: 5 },
  { from: 'ligament', to: 'bone', field: /^anatomy\.attachments$/, label: 'Ligament attachments', order: 5 },
  { from: 'space', field: /^anatomy\.contents/, label: 'Found in', order: 6 },
  { from: 'space', field: /^anatomy\.boundaries/, label: 'Forms a boundary of', order: 6 },
];
const MENTION_LABEL = 'Mentioned in';

// ---------- inline syntax ----------
const LINK_RE = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const VERIFY_RE = /\{\{\s*verify\s*(?::\s*([^}]*))?\}\}/g;

// ---------- loading (memoised for the whole build) ----------
export interface Backlink {
  source: Structure;
  field: string; // e.g. "anatomy.origin"
  label: string;
  order: number;
}
export interface QAItem {
  entry: Structure;
  field: string;
  note?: string;
  snippet: string;
}
interface Atlas {
  structures: Structure[];
  byId: Map<string, Structure>;
  regions: Region[];
  regionById: Map<string, Region>;
  images: Map<string, Image>;
  models: Map<string, Model>;
  backlinks: Map<string, Backlink[]>;
  verifyFlags: QAItem[];
  missingLinks: (QAItem & { target: string })[];
}

let cache: Promise<Atlas> | undefined;
export const loadAtlas = () => (cache ??= build());

/** Walks every string in an object, yielding [dotted.path, value]. */
function* strings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}.${i}`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

/** "anatomy.action.2" -> "anatomy.action" for rule matching. */
const fieldKey = (path: string) => path.replace(/\.\d+(?=\.|$)/g, '');

const snippet = (text: string, index: number) => {
  const start = Math.max(0, index - 80);
  return (start > 0 ? '…' : '') + text.slice(start, index).replace(LINK_RE, (_, id, t) => t ?? id).trim();
};

async function build(): Promise<Atlas> {
  const [structures, regions, images, models] = await Promise.all([
    getCollection('structures'),
    getCollection('regions'),
    getCollection('images'),
    getCollection('models'),
  ]);
  regions.sort((a, b) => a.data.order - b.data.order);
  structures.sort((a, b) => a.data.name.localeCompare(b.data.name));

  const byId = new Map(structures.map((s) => [s.id, s]));
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const imageById = new Map(images.map((i) => [i.id, i]));
  const modelById = new Map(models.map((m) => [m.id, m]));
  const errors: string[] = [];

  for (const m of models) {
    const where = `content/models.yaml (${m.id})`;
    for (const f of [m.data.file, m.data.poster])
      if (f && !existsSync(join(process.cwd(), 'public', f))) errors.push(`${where}: public/${f} does not exist`);
    if (!byId.has(m.data.entry)) errors.push(`${where}: entry "${m.data.entry}" does not exist`);
    for (const p of m.data.parts)
      if (p.to && !byId.has(p.to)) errors.push(`${where}: part "${p.id}" links to missing entry "${p.to}"`);
  }

  const backlinks = new Map<string, Backlink[]>();
  const verifyFlags: QAItem[] = [];
  const missingLinks: Atlas['missingLinks'] = [];

  for (const s of structures) {
    const where = `content/structures/…/${s.id}.md`;
    if (!regionById.has(s.data.region)) errors.push(`${where}: unknown region "${s.data.region}"`);
    for (const { image } of s.data.images)
      if (!imageById.has(image)) errors.push(`${where}: image "${image}" is not in content/images.yaml`);
    for (const d of s.data.diagrams)
      if (!diagrams[d]) errors.push(`${where}: diagram "${d}" is not in src/diagrams/registry.ts`);
    for (const m of s.data.models)
      if (!modelById.has(m)) errors.push(`${where}: model "${m}" is not in content/models.yaml`);
    for (const r of s.data.related)
      if (!byId.has(r)) missingLinks.push({ entry: s, field: 'related', target: r, snippet: '' });

    const seen = new Set<string>();
    for (const [path, text] of strings(s.data)) {
      for (const m of text.matchAll(VERIFY_RE))
        verifyFlags.push({ entry: s, field: path, note: m[1]?.trim() || undefined, snippet: snippet(text, m.index!) });
      for (const m of text.matchAll(LINK_RE)) {
        const target = m[1];
        if (!byId.has(target)) {
          missingLinks.push({ entry: s, field: path, target, snippet: snippet(text, m.index!) });
          continue;
        }
        if (target === s.id) continue;
        const field = fieldKey(path);
        const targetType = byId.get(target)!.data.type;
        const rule = RELATION_RULES.find(
          (r) => (!r.from || r.from === s.data.type) && (!r.to || r.to === targetType) && r.field.test(field),
        );
        const label = rule?.label ?? MENTION_LABEL;
        const key = `${target}|${s.id}|${label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const list = backlinks.get(target) ?? [];
        list.push({ source: s, field, label, order: rule?.order ?? 99 });
        backlinks.set(target, list);
      }
    }
  }

  if (errors.length) throw new Error('Content errors:\n  ' + errors.join('\n  '));
  if (missingLinks.length && process.env.STRICT_LINKS) {
    const lines = missingLinks.map((m) => `${m.entry.id} (${m.field}) -> [[${m.target}]]`);
    throw new Error('Links to missing entries (STRICT_LINKS is set):\n  ' + lines.join('\n  '));
  }

  return { structures, byId, regions, regionById, images: imageById, models: modelById, backlinks, verifyFlags, missingLinks };
}

// ---------- markdown rendering ----------
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const marked = new Marked({ gfm: true, breaks: false });

/** True when the text before `index` ends a sentence (or is empty), so a name keeps its capital. */
function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[\s*_"'(]+$/, '');
  return before === '' || /[.!?:\n]$/.test(before);
}

/**
 * Default link text: the entry name, lower-cased mid-sentence ("the radial artery").
 * Names whose first word is an eponym or acronym (e.g. "Guyon's canal", "TFCC") keep their case;
 * use [[id|Custom text]] for anything else.
 */
function linkText(name: string, text: string, index: number): string {
  const first = name.split(/\s/)[0];
  const keep = /'|’/.test(first) || (first.length > 1 && first === first.toUpperCase());
  return keep || startsSentence(text, index) ? name : name[0].toLowerCase() + name.slice(1);
}

function expandInline(text: string, atlas: Atlas): string {
  return text
    .replace(LINK_RE, (_, target: string, label: string | undefined, index: number) => {
      const s = atlas.byId.get(target);
      if (!s) {
        const shown = label ?? target.replace(/-/g, ' ');
        return `<span class="xref missing" title="Entry “${target}” not written yet">${shown}</span>`;
      }
      return `<a class="xref t-${s.data.type}" href="${structureUrl(s)}">${label ?? linkText(s.data.name, text, index)}</a>`;
    })
    .replace(VERIFY_RE, (_, note?: string) => {
      const n = note?.trim();
      return `<span class="verify" tabindex="0" role="note" aria-label="Verify${n ? ': ' + escapeAttr(n) : ' against your textbook'}"${
        n ? ` data-note="${escapeAttr(n)}"` : ''
      }>verify</span>`;
    });
}

/** Renders block Markdown (paragraphs, lists). */
export async function md(text: string | undefined): Promise<string> {
  if (!text) return '';
  return marked.parse(expandInline(text, await loadAtlas())) as string;
}

/** Renders a single line of Markdown without the wrapping <p>. */
export async function mdInline(text: string | undefined): Promise<string> {
  if (!text) return '';
  return marked.parseInline(expandInline(text, await loadAtlas())) as string;
}

/** Strips link/verify syntax and Markdown for plain-text contexts (search, meta). */
export function plain(text = ''): string {
  return text
    .replace(LINK_RE, (_, id, label) => label ?? id.replace(/-/g, ' '))
    .replace(VERIFY_RE, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- helpers for pages ----------
export async function backlinksFor(id: string) {
  const list = (await loadAtlas()).backlinks.get(id) ?? [];
  const groups = new Map<string, Backlink[]>();
  const specific = new Set(list.filter((b) => b.label !== MENTION_LABEL).map((b) => b.source.id));
  for (const b of [...list].sort((a, b) => a.order - b.order || a.source.data.name.localeCompare(b.source.data.name))) {
    // skip "Mentioned in" when the source is already listed under a specific relation
    if (b.label === MENTION_LABEL && specific.has(b.source.id)) continue;
    groups.set(b.label, [...(groups.get(b.label) ?? []), b]);
  }
  return groups;
}

/** Which of the five sections an entry has filled in (drives the completeness bar). */
export function completeness(s: Structure) {
  const d = s.data;
  const a = d.anatomy as Record<string, unknown>;
  const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);
  const sections = {
    Anatomy: Object.values(a).some(has),
    Clinical: d.clinical.length > 0 || d.pance.length > 0,
    Imaging: !!d.imaging && Object.values(d.imaging).some(has),
    Exam: !!d.exam && Object.values(d.exam).some(has),
    Quiz: d.quiz.length > 0 || d.flashcards.length > 0,
  };
  return { sections, done: Object.values(sections).filter(Boolean).length, total: 5 };
}
