import type { ReactNode } from 'react';
import './home.css';

/**
 * The masthead shared by Today, Library and Collections. The about links (Purpose … Request Demo)
 * are drawn as in the design but lead nowhere yet: there are no such pages, and no accounts.
 */
export function HomeHeader({ title, tabs, aside }: { title: string; tabs: ReactNode; aside?: ReactNode }) {
  return (
    <header className="home-head">
      <div className="home-bar">
        <a className="home-logo" href="#/today">
          <img src="/brand/wordmark.png" alt="In Other Hands" width={1394} height={366} />
        </a>
        <nav className="home-links" aria-label="About">
          <span>Purpose</span>
          <span>Experience</span>
          <span>Newsroom</span>
          <span className="home-links-gap" />
          <span>Login</span>
          <span className="is-underlined">Request Demo</span>
          <span className="home-arrow" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
          </span>
        </nav>
      </div>
      <h1 className="home-title">{title}</h1>
      <div className="home-tabs">
        <nav aria-label="Sections">{tabs}</nav>
        {aside && <span className="home-aside">{aside}</span>}
      </div>
    </header>
  );
}
