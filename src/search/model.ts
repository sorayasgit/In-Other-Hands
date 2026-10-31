import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { normalize, type Vec } from './vectors';

/** Small, strong retrieval model; 384-d; runs in the browser and in Node. */
export const MODEL_ID = 'Xenova/bge-small-en-v1.5';
/** bge models expect this instruction in front of short queries (not documents). */
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export interface Embedder {
  embedQuery(text: string): Promise<Vec>;
  embedDocs(texts: string[]): Promise<Vec[]>;
}

let pipe: Promise<FeatureExtractionPipeline> | undefined;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipe) {
    pipe = import('@huggingface/transformers').then(({ pipeline }) => {
      // The library's overloads are too wide for TypeScript to resolve here; the task is fixed.
      const make = pipeline as unknown as (task: 'feature-extraction', model: string, opts: { dtype: 'q8' }) => Promise<FeatureExtractionPipeline>;
      return make('feature-extraction', MODEL_ID, { dtype: 'q8' });
    });
  }
  return pipe;
}

async function run(texts: string[]): Promise<Vec[]> {
  const p = await getPipeline();
  const out = await p(texts, { pooling: 'cls', normalize: true });
  const dim = out.dims[out.dims.length - 1];
  const data = out.data as Float32Array;
  return texts.map((_, i) => normalize(data.slice(i * dim, (i + 1) * dim)));
}

/** Direct (same-thread) embedder: used by the Web Worker, the build script and tests. */
export const localEmbedder: Embedder = {
  async embedQuery(text) {
    return (await run([QUERY_PREFIX + text]))[0];
  },
  async embedDocs(texts) {
    const out: Vec[] = [];
    for (let i = 0; i < texts.length; i += 16) out.push(...(await run(texts.slice(i, i + 16))));
    return out;
  },
};
