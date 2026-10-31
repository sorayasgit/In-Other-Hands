import { highlightRuns } from '../search/engine';

export function Highlight({ text, matched }: { text: string; matched: string[] }) {
  return (
    <>
      {highlightRuns(text, matched).map((r, i) => (r.hit ? <mark key={i}>{r.text}</mark> : r.text))}
    </>
  );
}
