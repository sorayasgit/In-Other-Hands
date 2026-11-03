import { useEffect, useRef, useState } from 'react';
import { CanvasList } from './canvas/CanvasList';
import { CanvasView } from './canvas/CanvasView';
import { applyUrlFlags } from './handful/store';
import { href, navigate, useRoute, type Route } from './router';
import { startSemanticSearch } from './search/searchService';
import { ABOUT_PAGES, AboutView, type AboutPage } from './ui/AboutView';
import { CollectionsSpace } from './ui/CollectionsView';
import { LibraryView } from './ui/LibraryView';
import { HomeHeader } from './ui/HomeHeader';
import { TodayView } from './ui/TodayView';

export function App() {
  const route = useRoute();
  // The page an about page rises over; it stays drawn underneath while the about page is open.
  const lastPage = useRef<Route>({ path: '/today', params: new URLSearchParams() });
  // The about page that was open just before this one, if any: it stays drawn under the next one.
  const seen = useRef<{ path: string; prevAbout?: AboutPage; n: number }>({ path: route.path, n: 0 });
  if (seen.current.path !== route.path) {
    const was = seen.current.path.slice(1) as AboutPage;
    seen.current = { path: route.path, prevAbout: ABOUT_PAGES.includes(was) ? was : undefined, n: seen.current.n + 1 };
  }
  // Leaving an about page, it slides back down over where you're going; `dropped` marks it gone.
  const [dropped, setDropped] = useState(-1);
  const sheetScroll = useRef(0);
  const swipe = useRef<number>();
  const closeAbout = () => navigate(lastPage.current.path, Object.fromEntries(lastPage.current.params));
  useEffect(startSemanticSearch, []);

  const onAboutPage = (ABOUT_PAGES as readonly string[]).includes(route.path.slice(1));
  // A sheet sliding away is cleared on a timer as well as on animationend, which a hidden tab may never send.
  const dropping = !onAboutPage && !!seen.current.prevAbout && dropped !== seen.current.n;
  useEffect(() => {
    if (!dropping) return;
    const n = seen.current.n;
    const t = setTimeout(() => setDropped(n), matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 950);
    return () => clearTimeout(t);
  }, [dropping, seen.current.n]);
  useEffect(() => {
    if (!onAboutPage) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAbout();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAboutPage]);

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

  // One tree either way, so the page underneath isn't rebuilt when an about page opens over it.
  const about = route.path.slice(1) as AboutPage;
  const onAbout = ABOUT_PAGES.includes(about);
  if (!onAbout) lastPage.current = route;
  return (
    <>
      <div className={onAbout ? 'about-under' : undefined} style={{ display: 'contents' }} aria-hidden={onAbout || undefined} {...(onAbout ? { inert: '' } : {})}>
        <Page route={lastPage.current} />
      </div>
      {onAbout && seen.current.prevAbout && seen.current.prevAbout !== about && (
        <div key={seen.current.prevAbout} className={`shell is-home is-about is-still about-${seen.current.prevAbout}`} aria-hidden {...{ inert: '' }}>
          <HomeHeader title={seen.current.prevAbout} about={seen.current.prevAbout} />
          <AboutView page={seen.current.prevAbout} />
        </div>
      )}
      {onAbout && (
        <div
          key={about}
          className={`shell is-home is-about about-${about}`}
          onScroll={(e) => (sheetScroll.current = e.currentTarget.scrollTop)}
          // Pull down from the top of the page to put it away.
          onTouchStart={(e) => (swipe.current = e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : undefined)}
          onTouchEnd={(e) => {
            if (swipe.current !== undefined && e.changedTouches[0].clientY - swipe.current > 90) closeAbout();
            swipe.current = undefined;
          }}
        >
          <HomeHeader title={about} about={about} />
          <AboutView page={about} />
        </div>
      )}
      {dropping && (
        <div
          key={`leaving-${seen.current.n}`}
          ref={(el) => {
            if (el && !el.dataset.placed) {
              el.dataset.placed = '1';
              el.scrollTop = sheetScroll.current;
            }
          }}
          className={`shell is-home is-about is-leaving about-${seen.current.prevAbout!}`}
          aria-hidden
          {...{ inert: '' }}
          onAnimationEnd={(e) => e.target === e.currentTarget && setDropped(seen.current.n)}
        >
          <HomeHeader title={seen.current.prevAbout!} about={seen.current.prevAbout} />
          <AboutView page={seen.current.prevAbout!} />
        </div>
      )}
    </>
  );
}

function Page({ route }: { route: Route }) {
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
  return (
    <div className="shell is-home">
      <HomeHeader title={onToday ? 'In your hands' : onCollections ? 'Collections' : onCanvases ? 'Canvases' : 'Library'} tabs={tabs} />
      <div key={section} className="home-enter">
        {onToday ? <TodayView route={route} /> : onCollections ? <CollectionsSpace route={route} /> : onCanvases ? <CanvasList /> : <LibraryView route={route} />}
      </div>
    </div>
  );
}
