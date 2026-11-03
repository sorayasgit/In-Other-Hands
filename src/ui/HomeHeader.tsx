import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { asset } from '../asset';
import './home.css';

/**
 * The masthead shared by every page but an open canvas. Purpose, Experience and Newsroom lead to
 * their pages; Login and Request Demo are drawn as in the design but lead nowhere (there are no accounts).
 */
export function HomeHeader({ title, tabs, aside, about }: { title: string; tabs?: ReactNode; aside?: ReactNode; about?: string }) {
  const link = (page: string, label: string) => (
    <a href={`#/${page}`} aria-current={about === page ? 'page' : undefined}>{label}</a>
  );
  // One underline that slides to whichever tab is current, rather than one per tab.
  const nav = useRef<HTMLElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const n = nav.current;
    const l = line.current;
    if (!n || !l) return;
    const place = () => {
      const a = n.querySelector<HTMLElement>('[aria-current="page"]');
      l.style.opacity = a ? '1' : '0';
      if (a) l.style.transform = `translateX(${a.offsetLeft}px) scaleX(${a.offsetWidth})`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(n);
    return () => ro.disconnect();
  });

  return (
    <header className="home-head">
      <div className="home-bar">
        <a className="home-logo" href="#/today">
          <img src={asset('/brand/wordmark.png')} alt="In Other Hands" width={1394} height={366} />
        </a>
        <nav className="home-links" aria-label="About">
          {link('purpose', 'Purpose')}
          {link('experience', 'Experience')}
          {link('newsroom', 'Newsroom')}
          <span className="home-links-gap" />
          <span>Login</span>
          <span className="is-underlined">Request Demo</span>
          <span className="home-arrow" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
          </span>
        </nav>
      </div>
      <h1 className="home-title">{title}</h1>
      {(tabs || aside) && (
        <div className="home-tabs">
          <nav ref={nav} aria-label="Sections">
            {tabs}
            <span ref={line} className="home-tab-line" aria-hidden />
          </nav>
          {aside && <span className="home-aside">{aside}</span>}
        </div>
      )}
    </header>
  );
}
