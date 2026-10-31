/// <reference lib="webworker" />
import { localEmbedder } from './model';

/** Runs the embedding model off the main thread so typing never stutters. */

type Req = { id: number; op: 'warm' } | { id: number; op: 'query'; text: string } | { id: number; op: 'docs'; texts: string[] };

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    if (req.op === 'warm') {
      await localEmbedder.embedQuery('warm up');
      self.postMessage({ id: req.id, ok: true });
    } else if (req.op === 'query') {
      const v = await localEmbedder.embedQuery(req.text);
      self.postMessage({ id: req.id, ok: true, vecs: [v] }, [v.buffer]);
    } else {
      const vs = await localEmbedder.embedDocs(req.texts);
      self.postMessage({ id: req.id, ok: true, vecs: vs }, vs.map((v) => v.buffer));
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String(err) });
  }
};
