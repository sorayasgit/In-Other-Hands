import { describe, expect, it } from 'vitest';
import { addCard, addEdge, addFrame, addNote, contains, emptyCanvas, exitPoint, history, placeAll, removeItems, setEdgeLabel, setInk, updateNode } from './model';

describe('canvas document', () => {
  it('places references, not copies — the same card can appear twice', () => {
    let doc = emptyCanvas();
    [doc] = addCard(doc, 'c01', 0, 0);
    [doc] = addCard(doc, 'c01', 400, 0);
    const nodes = Object.values(doc.nodes);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.kind === 'card' && n.itemId === 'c01')).toBe(true);
    expect(JSON.stringify(doc)).not.toContain('The Best Interface'); // no library content inside
  });

  it('removing a node drops its links but never the library item', () => {
    let doc = emptyCanvas();
    let a: string, b: string;
    [doc, a] = addCard(doc, 'c01', 0, 0);
    [doc, b] = addCard(doc, 'c02', 400, 0);
    doc = addEdge(doc, a, b, 'contrast');
    doc = removeItems(doc, [a]);
    expect(Object.keys(doc.nodes)).toEqual([b]);
    expect(Object.keys(doc.edges)).toHaveLength(0);
  });

  it('does not duplicate links in either direction or link a card to itself', () => {
    let doc = emptyCanvas();
    let a: string, b: string;
    [doc, a] = addCard(doc, 'c01', 0, 0);
    [doc, b] = addCard(doc, 'c02', 400, 0);
    doc = addEdge(addEdge(addEdge(doc, a, b), b, a), a, a);
    expect(Object.keys(doc.edges)).toHaveLength(1);
    const id = Object.keys(doc.edges)[0];
    expect(setEdgeLabel(doc, id, '  ').edges[id].label).toBeUndefined();
  });

  it('frames wrap their contents with room for a title', () => {
    let doc = emptyCanvas();
    let f: string;
    [doc, f] = addFrame(doc, [{ x: 0, y: 0, w: 280, h: 200 }, { x: 400, y: 300, w: 280, h: 200 }], 'Pair');
    const frame = doc.frames[f];
    expect(contains(frame, { x: 0, y: 0, w: 280, h: 200 })).toBe(true);
    expect(contains(frame, { x: 400, y: 300, w: 280, h: 200 })).toBe(true);
    expect(frame.title).toBe('Pair');
  });

  it('moves nodes and frames together', () => {
    let doc = emptyCanvas();
    let n: string, f: string;
    [doc, n] = addNote(doc, 10, 10, 'hi');
    [doc, f] = addFrame(doc, [{ x: 10, y: 10, w: 220, h: 140 }]);
    doc = placeAll(doc, new Map([[n, { x: 110, y: 60 }], [f, { x: 0, y: 0 }]]));
    expect(doc.nodes[n]).toMatchObject({ x: 110, y: 60 });
    expect(doc.frames[f]).toMatchObject({ x: 0, y: 0 });
  });

  it('links leave from the edge of a card, not its centre', () => {
    const p = exitPoint({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 });
    expect(p).toEqual({ x: 100, y: 50 });
  });
});

describe('history', () => {
  it('a drag is one undo step: previews do not stack', () => {
    let doc = emptyCanvas();
    let n: string;
    [doc, n] = addNote(doc, 0, 0);
    let h = history.init(doc);
    const base = h.present;
    for (let i = 1; i <= 20; i++) h = history.preview(h, updateNode(base, n, { x: i * 10 }));
    h = history.commit(h, h.present, base);
    expect(h.past).toHaveLength(1);
    expect((h.present.nodes[n] as { x: number }).x).toBe(200);
    h = history.undo(h);
    expect((h.present.nodes[n] as { x: number }).x).toBe(0);
    h = history.redo(h);
    expect((h.present.nodes[n] as { x: number }).x).toBe(200);
  });

  it('a new change after undo discards the redo branch', () => {
    let h = history.init(emptyCanvas());
    h = history.commit(h, addNote(h.present, 0, 0)[0]);
    h = history.undo(h);
    h = history.commit(h, addNote(h.present, 50, 50)[0]);
    expect(h.future).toHaveLength(0);
  });

  it('recolours notes and links, leaves cards alone, and resets to the default ink', () => {
    let doc = emptyCanvas();
    let card: string, note: string;
    [doc, card] = addCard(doc, 'c01', 0, 0);
    [doc, note] = addNote(doc, 400, 0, 'hello');
    doc = addEdge(doc, card, note);
    const edge = Object.keys(doc.edges)[0];
    doc = setInk(doc, [card, note, edge], '#b4532a');
    expect(doc.nodes[note]).toMatchObject({ color: '#b4532a' });
    expect(doc.edges[edge].color).toBe('#b4532a');
    expect(doc.nodes[card]).not.toHaveProperty('color');
    doc = setInk(doc, [note], undefined);
    expect(doc.nodes[note]).toMatchObject({ color: undefined });
  });
});
