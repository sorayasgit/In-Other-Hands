import { useEffect } from 'react';
import { CanvasList } from './canvas/CanvasList';
import { CanvasView } from './canvas/CanvasView';
import { href, useRoute } from './router';
import { startSemanticSearch, useSearchService } from './search/searchService';
import { CollectionPage, CollectionsIndex } from './ui/CollectionsView';
import { LibraryView } from './ui/LibraryView';

export function App() {
  const route = useRoute();
  const { status } = useSearchService();
  useEffect(startSemanticSearch, []);

  const canvas = route.path.match(/^\/canvas\/(.+)$/);
  if (canvas) return <CanvasView id={canvas[1]} focus={route.params.get('focus') ?? undefined} />;

  const onCanvases = route.path === '/canvases';
  const collection = route.path.match(/^\/collection\/(.+)$/);
  const onCollections = route.path === '/collections' || !!collection;
  const section = onCanvases ? 'canvases' : onCollections ? 'collections' : 'library';
  return (
    <div className="shell">
      <header className="topbar">
        <a className="wordmark" href={href('/')}>In Other Hands</a>
        <nav className="nav">
          <a href={href('/')} aria-current={section === 'library' ? 'page' : undefined}>Library</a>
          <a href={href('/collections')} aria-current={section === 'collections' ? 'page' : undefined}>Collections</a>
          <a href={href('/canvases')} aria-current={section === 'canvases' ? 'page' : undefined}>Canvases</a>
        </nav>
        <span className="status" title="Meaning-based search runs on this device; nothing is sent anywhere.">
          <i className={`dot ${status === 'ready' ? 'on' : ''}`} />
          {status === 'ready' ? 'search understands meaning' : status === 'loading' ? 'loading search model…' : 'keyword search only'}
        </span>
      </header>
      {onCanvases ? (
        <CanvasList />
      ) : collection ? (
        <CollectionPage key={collection[1]} name={decodeURIComponent(collection[1])} route={route} />
      ) : onCollections ? (
        <CollectionsIndex />
      ) : (
        <LibraryView route={route} />
      )}
    </div>
  );
}
