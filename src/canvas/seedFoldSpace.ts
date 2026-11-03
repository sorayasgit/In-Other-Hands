import { addCard, addEdge, addFrame, addNote, emptyCanvas, updateFrame, updateNode, type CanvasDoc, type NoteNode } from './model';

/**
 * A sample research map in the style of a design-studio mind map: blue hub labels, "!" callouts,
 * ink annotations, branching curves and clusters of small images. Positions are in world units.
 */

export const FOLD_SPACE_ID = 'kfoldspace';

export function buildFoldSpace(): CanvasDoc {
  let doc: CanvasDoc = { ...emptyCanvas('Fold space — research map'), id: FOLD_SPACE_ID };
  const ids: Record<string, string> = {};
  let n = 0;

  const note = (key: string, text: string, x: number, y: number, w: number, h: number, style: NoteNode['style']) => {
    const [d, id] = addNote(doc, x, y, text);
    doc = updateNode(d, id, { w, h, style });
    ids[key] = id;
  };
  const label = (key: string, text: string, x: number, y: number) => note(key, text, x, y, text.length * 12 + 36, 46, 'label');
  const text = (key: string, t: string, x: number, y: number, w = 200, h = 40) => note(key, t, x, y, w, h, 'text');
  const alert = (x: number, y: number) => note(`!${n++}`, '!', x, y, 40, 50, 'callout');
  const img = (key: string, itemId: string, x: number, y: number, scale = 0.35) => {
    const [d, id] = addCard(doc, itemId, x, y, scale);
    doc = d;
    ids[key] = id;
  };
  const link = (...keys: string[]) => {
    for (let i = 1; i < keys.length; i++) doc = addEdge(doc, ids[keys[0]], ids[keys[i]]);
  };

  // ── Research context (top left) ───────────────────────────────────────────────────────────
  img('news1', 'c66', 190, 10, 0.42);
  img('news2', 'c65', 330, 10, 0.4);
  img('news3', 'c70', 460, 30, 0.3);
  text('trend', 'Trending topics', 210, 170, 170);
  text('dig', 'Dig deeper', 440, 170, 130);
  label('context', 'Research context', 150, 450);
  text('phen', 'Phenomenon', 110, 665, 130);
  alert(320, 590);
  label('question', 'Research question', 410, 655);
  text('A', 'A', 545, 560, 30);
  text('B', 'B', 545, 675, 30);
  text('C', 'C', 545, 790, 30);
  text('qA', 'Why do small homes feel crowded even when they’re tidy?', 610, 520, 250, 70);
  text('qB', 'Who decides what a room is for?', 610, 665, 250, 40);
  text('qC', 'Can furniture fold away its presence, not just its size?\nWhat would a room be if nothing in it had one fixed use?', 610, 770, 260, 140);
  text('field1', 'observed in 12 flats', 210, 820, 110, 60);
  text('field2', 'evenings & weekends', 300, 900, 110, 60);
  link('trend', 'news1');
  link('context', 'trend', 'phen');
  link('trend', 'dig');
  link('phen', 'question', 'field1');
  link('question', 'A', 'B', 'C');
  link('A', 'qA');
  link('B', 'qB');
  link('C', 'qC');
  link('field1', 'field2');

  // ── Secondary, quantitative and qualitative research ───────────────────────────────────────
  text('second', 'Secondary research', 690, 450, 210);
  text('quant', 'Quantitative research', 900, 300, 230);
  text('qual', 'Qualitative research', 900, 610, 220);
  img('green', 'c67', 860, 40, 0.38);
  img('ppl', 'c68', 990, 30, 0.34);
  img('r1', 'c65', 1030, 220, 0.3);
  img('r2', 'c61', 1110, 260, 0.28);
  img('r3', 'c69', 1050, 360, 0.3);
  img('r4', 'c62', 1140, 380, 0.26);
  text('data', 'Data', 1240, 300, 80);
  text('datalist', 'Survey of 120 flats\nstorage   34%\nseating   14%\ntables     5%\nbeds        5%\nworkspace 14%\nother        1%', 1350, 110, 190, 230);
  img('q1', 'c63', 950, 760, 0.3);
  img('q2', 'c73', 960, 900, 0.28);
  link('dig', 'second');
  link('second', 'quant', 'qual');
  link('quant', 'green', 'r1', 'data');
  link('data', 'datalist');
  link('qual', 'q1', 'q2');

  // ── Findings ───────────────────────────────────────────────────────────────────────────────
  label('find', 'Findings', 1170, 700);
  text('f1', '1. People rearrange less than they imagine; folding has to be effortless or it never happens.', 1300, 560, 330, 80);
  text('f2', '2. The best-loved pieces had two lives: a table that becomes a shelf, a bench that hides a bed.', 1300, 690, 330, 80);
  text('f3', '3. “Space” was described as a feeling of choice, not square metres.', 1300, 830, 330, 60);
  link('qual', 'find');
  link('find', 'f1', 'f2', 'f3');

  // ── Design issue (the loop) ────────────────────────────────────────────────────────────────
  label('issue', 'Design issue', 440, 1180);
  text('issueText', 'How might a room fold its furniture away so the same few square metres can hold a meal, a desk and a guest bed in one day?', 440, 1270, 250, 190);
  img('issueIcon', 'c73', 480, 1500, 0.42);
  alert(640, 1120);
  let [d, loop] = addFrame(doc, [{ x: 420, y: 1160, w: 290, h: 470 }], '');
  doc = updateFrame(d, loop, { tone: 'ink' });
  link('question', 'issue');

  // ── Output ─────────────────────────────────────────────────────────────────────────────────
  label('output', 'Output', 1060, 1220);
  alert(960, 1090);
  img('o1', 'c70', 920, 1140, 0.28);
  img('o2', 'c68', 1130, 1170, 0.26);
  img('o3', 'c66', 1000, 1310, 0.27);
  img('o4', 'c61', 1100, 1300, 0.3);
  img('o5', 'c62', 930, 1430, 0.3);
  img('o6', 'c71', 1060, 1440, 0.27);
  text('purpose', 'Purpose', 900, 1620, 110);
  link('issue', 'output');
  link('output', 'o1', 'o4', 'purpose');

  // ── Method ─────────────────────────────────────────────────────────────────────────────────
  label('method', 'Method', 1650, 900);
  text('foldm', 'folding methods', 1830, 760, 160);
  text('stool', 'stool', 1850, 840, 70);
  text('table', 'table', 1850, 960, 70);
  img('m1', 'c74', 1990, 690, 0.42);
  img('m2', 'c69', 1940, 820, 0.24);
  img('m3', 'c57', 1940, 930, 0.28);
  text('present', 'Scheme presentation', 1590, 1180, 230);
  alert(1560, 1090);
  img('p1', 'c63', 1730, 1100, 0.3);
  img('p2', 'c62', 1660, 1290, 0.28);
  img('p3', 'c64', 1820, 1290, 0.42);
  text('hand', 'Walking handbook', 1660, 1510, 200);
  alert(1630, 1420);
  img('h1', 'c72', 1610, 1580, 0.3);
  img('h2', 'c59', 1720, 1590, 0.26);
  img('h3', 'c73', 1830, 1620, 0.3);
  img('dots1', 'c59', 1170, 1500, 1.0);
  img('dots2', 'c60', 2010, 1520, 0.62);
  link('find', 'method');
  link('method', 'foldm', 'stool', 'table', 'present', 'output');
  link('foldm', 'm1');
  link('stool', 'm2');
  link('table', 'm3');
  link('present', 'p1', 'hand');
  link('hand', 'h1', 'dots2', 'dots1');

  // ── Path ───────────────────────────────────────────────────────────────────────────────────
  label('path', 'Path', 1990, 590);
  alert(1860, 250);
  text('mat', 'material', 2040, 150, 100);
  text('joint', 'joint', 2040, 240, 100);
  text('scale', 'scale', 2040, 330, 100);
  img('bigTable', 'c57', 2240, 330, 1.0);
  text('model', 'model', 2520, 420, 80);
  img('foam', 'c58', 2560, 630, 0.5);
  link('method', 'path');
  link('path', 'mat', 'joint', 'scale', 'bigTable');
  link('bigTable', 'model');
  link('model', 'foam');

  // ── Title ──────────────────────────────────────────────────────────────────────────────────
  note('title', '“Fold\nspace”', 2200, 860, 420, 230, 'title');

  // ── Installation ───────────────────────────────────────────────────────────────────────────
  label('install', 'Installation', 2440, 1060);
  const cluster: [string, number, number, number][] = [
    ['c62', 2280, 1260, 0.38], ['c71', 2440, 1210, 0.34], ['c61', 2590, 1250, 0.3], ['c57', 2720, 1240, 0.3],
    ['c64', 2330, 1400, 0.3], ['c60', 2480, 1390, 0.45], ['c58', 2680, 1380, 0.3],
    ['c63', 2300, 1540, 0.3], ['c70', 2440, 1590, 0.32], ['c73', 2610, 1560, 0.38],
  ];
  cluster.forEach(([item, x, y, s], i) => img(`inst${i}`, item, x, y, s));
  link('method', 'install');
  link('install', 'inst0', 'inst1', 'inst2', 'inst3', 'inst5', 'inst6');

  return doc;
}
