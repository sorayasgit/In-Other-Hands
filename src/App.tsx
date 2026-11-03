import { useEffect } from 'react';
import { CanvasList } from './canvas/CanvasList';
import { CanvasView } from './canvas/CanvasView';
import { applyUrlFlags } from './handful/store';
import { href, navigate, useRoute } from './router';
import { startSemanticSearch, useSearchService } from './search/searchService';
import { CollectionsSpace } from './ui/CollectionsView';
import { LibraryView } from './ui/LibraryView';
import { HomeHeader } from './ui/HomeHeader';
import { TodayView } from './ui/TodayView';

export function App() {
  const route = useRoute();
  const { status } = useSearchService();
  useEffect(startSemanticSearch, []);

  // Recording helpers (?day=N, ?reset=1), accepted before or after the #. Applied once, then removed
  // from the address so a later navigation doesn't repeat them.
  useEffect(() => {
    const outer = new URLSearchParams(location.search);
    const flags = new URLSearchParams();
    for (const k of ['day', 'reset']) {
      const v = outer.get(k) ?? route.params.get(k);
      if (v !== null) flags.set(k, v);
    }
    if (![...flags.keys()].length) return;
    applyUrlFlags(flags);
    if (outer.has('day') || outer.has('reset')) history.replaceState(null, '', location.pathname + location.hash);
    if (route.params.has('day') || route.params.has('reset')) {
      const rest = Object.fromEntries([...route.params].filter(([k]) => k !== 'day' && k !== 'reset'));
      navigate(route.path, rest, { replace: true });
    }
  }, [route]);

  const canvas = route.path.match(/^\/canvas\/(.+)$/);
  if (canvas) return <CanvasView id={canvas[1]} focus={route.params.get('focus') ?? undefined} />;

  const onCanvases = route.path === '/canvases';
  const collection = route.path.match(/^\/collection\/(.+)$/);
  const onCollections = route.path === '/collections' || !!collection;
  const onToday = route.path === '/' || route.path === '/today';
  const section = onToday ? 'today' : onCanvases ? 'canvases' : onCollections ? 'collections' : 'library';
  const tabs = (
    <>
      <a href={href('/today')} aria-current={section === 'today' ? 'page' : undefined}>Today</a>
      <a href={href('/library')} aria-current={section === 'library' ? 'page' : undefined}>Library</a>
      <a href={href('/collections')} aria-current={section === 'collections' ? 'page' : undefined}>Collections</a>
      <a href={href('/canvases')} aria-current={section === 'canvases' ? 'page' : undefined}>Canvases</a>
    </>
  );
  const searchStatus = (
    <span title="Meaning-based search runs on this device; nothing is sent anywhere.">
      <i className={`dot ${status === 'ready' ? 'on' : ''}`} />
      {status === 'ready' ? 'search understands meaning' : status === 'loading' ? 'loading search model…' : 'keyword search only'}
    </span>
  );
  return (
    <div className="shell is-home">
      <HomeHeader title={onToday ? 'In your hands' : onCollections ? 'Collections' : onCanvases ? 'Canvases' : 'Library'} tabs={tabs} aside={section === 'library' ? searchStatus : undefined} />
      {onToday ? <TodayView route={route} /> : onCollections ? <CollectionsSpace route={route} /> : onCanvases ? <CanvasList /> : <LibraryView route={route} />}
    </div>
  );
}
