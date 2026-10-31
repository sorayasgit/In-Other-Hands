import type { CardType } from '../data/types';
import { COLOR_WORDS } from './colors';

/**
 * Turns how people *remember* things into retrieval hints. Everything here is soft: memory is
 * unreliable, so hints change ranking and never hide results.
 */

export interface TimeWindow {
  from: number;
  to: number;
  label: string;
}

export interface Hint {
  id: string;
  kind: 'type' | 'time' | 'color';
  label: string;
}

export interface Understanding {
  raw: string;
  /** The query with memory filler removed — what the thing is *about*. */
  core: string;
  types: CardType[];
  time?: TimeWindow;
  colors: string[];
  hints: Hint[];
  /** In "A over B" phrasing: A (what it's about) and B (what it's set against). */
  focus?: string;
  contrast?: string;
}

const TYPE_WORDS: [RegExp, CardType][] = [
  [/\b(quote|quotation|saying|line)s?\b/, 'quote'],
  [/\b(highlight|passage|underlined)s?\b/, 'highlight'],
  [/\b(article|essay|post|piece|blog|newsletter)s?\b/, 'article'],
  [/\b(image|picture|photo|photograph|pic|painting|screenshot|poster)s?\b/, 'image'],
  [/\b(video|film|clip|talk)s?\b/, 'video'],
  [/\b(podcast|episode)s?\b/, 'podcast'],
  [/\bbooks?\b/, 'book'],
  [/\b(my note|note i wrote|i wrote|my own note|notes? to self|thought i had)\b/, 'note'],
  [/\b(link|website|site|tool)s?\b/, 'link'],
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAY = 86_400_000;

/** Phrases that describe the act of remembering rather than the thing remembered. */
const FILLER: RegExp[] = [
  /\b(i think|i believe|i remember|i'm pretty sure|maybe|probably|kind of|sort of|or something)\b/g,
  /\b(that|which|the one)?\s*(i|we)\s+(read|saved|found|saw|watched|heard|listened to|kept|bookmarked|came across|liked)\b/g,
  /\b(that|which)\s+(made|got)\s+me\b/g,
  /\b(with|in|using)\s+(the|a|an|that)?\s*(colou?r|palette|colou?rs|tones?|hues?)\b/g,
  /\b(colou?r )?palette\b/g,
  /\b(colou?r(s|ed)?|tones?|hues?|shades?)\b/g,
  /^(something|anything|stuff|that thing|the thing|this thing|the one)\s+(about|on|with|where|regarding)?\s*/,
  /^(that|the|this|some|an?|one)\s+/,
  /\b(something|stuff|thing)\s+(about|on)\b/g,
  /\b(had|has)\s+something\s+to\s+do\s+with\b/g,
  /\b(about|regarding)\b/g,
];

function relativeTime(q: string, now: number): { win: TimeWindow; match: RegExp } | undefined {
  const rules: [RegExp, () => TimeWindow][] = [
    [/\b(a few|a couple of|couple of|some|several)\s+months?\s+ago\b/, () => ({ from: now - 6 * 30 * DAY, to: now - 1.5 * 30 * DAY, label: 'a few months ago' })],
    [/\b(a few|a couple of|couple of|some|several)\s+weeks?\s+ago\b/, () => ({ from: now - 6 * 7 * DAY, to: now - 10 * DAY, label: 'a few weeks ago' })],
    [/\b(a few|a couple of|couple of|some)\s+days\s+ago\b/, () => ({ from: now - 7 * DAY, to: now - 1 * DAY, label: 'a few days ago' })],
    [/\b(last|this past)\s+week\b/, () => ({ from: now - 14 * DAY, to: now, label: 'last week or so' })],
    [/\blast\s+month\b/, () => ({ from: now - 60 * DAY, to: now - 20 * DAY, label: 'last month' })],
    [/\blast\s+year\b/, () => ({ from: now - 540 * DAY, to: now - 240 * DAY, label: 'last year' })],
    [/\b(recently|the other day|just saved|lately)\b/, () => ({ from: now - 30 * DAY, to: now, label: 'recently' })],
    [/\b(a while ago|a while back|ages ago|long time ago)\b/, () => ({ from: 0, to: now - 90 * DAY, label: 'a while ago' })],
    [/\b(this|over the|in the|last)\s+summer\b/, () => season(now, 5, 7, 'summer')],
    [/\b(this|over the|in the|last)\s+(autumn|fall)\b/, () => season(now, 8, 10, 'autumn')],
    [/\b(this|over the|in the|last)\s+winter\b/, () => season(now, 11, 13, 'winter')],
    [/\b(this|over the|in the|last)\s+spring\b/, () => season(now, 2, 4, 'spring')],
  ];
  for (const [re, make] of rules) if (re.test(q)) return { win: make(), match: re };
  const m = q.match(new RegExp(`\\b(?:in|around|during|back in)\\s+(${MONTHS.join('|')})\\b`));
  if (m) {
    const month = MONTHS.indexOf(m[1]);
    const d = new Date(now);
    let year = d.getUTCFullYear();
    if (month > d.getUTCMonth()) year -= 1;
    const from = Date.UTC(year, month, 1) - 7 * DAY;
    const to = Date.UTC(year, month + 1, 1) + 7 * DAY;
    return { win: { from, to, label: `around ${cap(m[1])}` }, match: new RegExp(m[0]) };
  }
  return undefined;
}

function season(now: number, startMonth: number, endMonth: number, name: string): TimeWindow {
  const d = new Date(now);
  let year = d.getUTCFullYear();
  if (startMonth > d.getUTCMonth()) year -= 1;
  return { from: Date.UTC(year, startMonth, 1), to: Date.UTC(year, endMonth + 1, 1), label: `over the ${name}` };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function understand(raw: string, now = Date.now(), ignored: ReadonlySet<string> = new Set()): Understanding {
  let q = ` ${raw.toLowerCase().replace(/[“”"’]/g, (c) => (c === '’' ? "'" : ' ')).replace(/\s+/g, ' ')} `;
  const hints: Hint[] = [];
  const types: CardType[] = [];
  const colors: string[] = [];
  let time: TimeWindow | undefined;

  const rt = relativeTime(q, now);
  if (rt) {
    q = q.replace(rt.match, ' ');
    const id = `time:${rt.win.label}`;
    if (!ignored.has(id)) {
      time = rt.win;
      hints.push({ id, kind: 'time', label: rt.win.label });
    }
  }

  for (const [re, type] of TYPE_WORDS) {
    if (!re.test(q)) continue;
    // A type word only counts as a memory cue when it names the *kind* of thing ("the quote about"),
    // not when it's the topic ("a book about photographs" keeps "photographs").
    const cue = new RegExp(`(^|\\b(?:that|the|this|an?|one|some)\\s+(?:\\w+\\s+){0,2})${re.source}`);
    const isCue = cue.test(q) || q.trim().split(' ').length <= 3;
    if (!isCue) continue;
    q = q.replace(re, ' ');
    const id = `type:${type}`;
    if (!ignored.has(id) && !types.includes(type)) {
      types.push(type);
      hints.push({ id, kind: 'type', label: type });
    }
  }

  for (const word of Object.keys(COLOR_WORDS)) {
    const re = new RegExp(`\\b${word}(ish|y)?\\b`);
    if (!re.test(q)) continue;
    q = q.replace(re, ' ');
    const id = `color:${word}`;
    if (!ignored.has(id) && !colors.includes(word)) {
      colors.push(word);
      hints.push({ id, kind: 'color', label: word });
    }
  }
  if (colors.length && !types.includes('image') && !ignored.has('type:image')) {
    types.push('image');
    hints.push({ id: 'type:image', kind: 'type', label: 'image' });
  }

  for (const re of FILLER) q = q.replace(re, ' ').replace(/\s+/g, ' ').trim();
  q = q.replace(/\b(and|or|with|the|a|an)\s*$/g, ' ');
  let core = q.replace(/[,;:.?!]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Trim connective words left at either end; a core of only such words carries no meaning.
  const EDGE = /^(and|or|with|of|that|the|a|an|this|some|in|on|to|for|it|i|me|my)\b\s*|\s*\b(and|or|with|of|that|the|a|an|this|some|in|on|to|for|it|i|me|my)$/;
  while (EDGE.test(core)) core = core.replace(EDGE, '').trim();

  // "A being more important than B", "A over B", "A rather than B": the thing is about A, framed
  // against B. Keep both for meaning, but only A is a word the card is likely to contain.
  let contrast: string | undefined;
  const m = core.match(/^(.+?)\s+(?:being\s+|is\s+)?(?:more important than|matters more than|over|rather than|instead of|beats|versus|vs\.?|not)\s+(.+)$/);
  if (m && m[1].split(' ').length <= 6) {
    contrast = m[2];
  }

  return { raw, core, types, time, colors, hints, contrast, focus: contrast ? m![1] : undefined };
}

// ── Refinements ──────────────────────────────────────────────────────────────────────────────────

export type Refinement =
  | { id: string; kind: 'more'; text: string; label: string }
  | { id: string; kind: 'less'; text: string; label: string }
  | { id: string; kind: 'type'; type: CardType; label: string }
  | { id: string; kind: 'near-time'; label: string }
  | { id: string; kind: 'older' | 'newer'; label: string }
  | { id: string; kind: 'time'; window: TimeWindow; label: string }
  | { id: string; kind: 'color'; colors: string[]; label: string };

let refinementSeq = 0;
const rid = () => `r${++refinementSeq}`;

/**
 * Read a follow-up like "no, it was more about design" or "I think it was a quote". Returns the
 * refinements it implies, in the order they appear.
 */
export function parseRefinement(input: string, now = Date.now()): Refinement[] {
  let t = input.toLowerCase().trim().replace(/[.!]+$/, '');
  t = t.replace(/^(no|nope|not quite|hmm|actually|wait)\b[,.!]?\s*/, '');
  const out: Refinement[] = [];

  if (/\b(same time|around then|saved (then|around then|nearby)|same (week|period|month)|that time)\b/.test(t)) {
    out.push({ id: rid(), kind: 'near-time', label: 'saved around the same time' });
    return out;
  }
  const OLDER = /\b(older|earlier|before that|longer ago)\b/;
  const NEWER = /\b(newer|more recent|later|after that)\b/;
  if (OLDER.test(t)) out.push({ id: rid(), kind: 'older', label: 'older' });
  if (NEWER.test(t)) out.push({ id: rid(), kind: 'newer', label: 'more recent' });
  t = t.replace(OLDER, ' ').replace(NEWER, ' ');

  const typeMatch = t.match(/\b(?:it was|it's|was it|i think it was|maybe|probably|it was more like)\s+(?:a|an)\s+(\w+)/);
  if (typeMatch) {
    for (const [re, type] of TYPE_WORDS) {
      if (re.test(typeMatch[1])) {
        out.push({ id: rid(), kind: 'type', type, label: `a ${type}` });
        t = t.replace(typeMatch[0], ' ');
        break;
      }
    }
  }

  const u = understand(t, now);
  if (u.time && !out.some((r) => r.kind === 'older' || r.kind === 'newer')) {
    out.push({ id: rid(), kind: 'time', window: u.time, label: u.time.label });
  }
  if (u.colors.length) out.push({ id: rid(), kind: 'color', colors: u.colors, label: u.colors.join(' & ') });
  if (!typeMatch) {
    for (const type of u.types) if (!u.colors.length || type !== 'image') out.push({ id: rid(), kind: 'type', type, label: `a ${type}` });
  }

  const less = t.match(/\b(?:not|less|wasn't|isn't|not really)\s+(?:about\s+|so much\s+)?([a-z][a-z\s-]{2,40})/);
  if (less) {
    const text = clean(less[1]);
    if (text) out.push({ id: rid(), kind: 'less', text, label: `not ${text}` });
    t = t.replace(less[0], ' ');
  }

  const more = t.match(/\b(?:more|mostly|really|more like|it was more)\s+(?:about|on|like)?\s*([a-z][a-z\s-]{2,60})/);
  const topic = clean(more ? more[1] : understand(t, now).core);
  if (topic && topic.split(' ').length <= 8) out.push({ id: rid(), kind: 'more', text: topic, label: `more about ${topic}` });

  return out;
}

function clean(s: string): string {
  return s
    .replace(/\b(it|was|is|the|a|an|that|this|something|to do with|had|has|do|with|about|more|really)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
