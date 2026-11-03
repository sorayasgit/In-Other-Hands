import { href } from '../router';
import './about.css';

/** The pages behind the masthead's Purpose, Experience and Newsroom links. Each has its own ground colour. */

export const ABOUT_PAGES = ['purpose', 'experience', 'newsroom'] as const;
export type AboutPage = (typeof ABOUT_PAGES)[number];

/** Newest first. Each says what actually changed in the app. */
const NEWS: { when: string; title: string; body: string }[] = [
  {
    when: 'Nov 3, 2026',
    title: 'Calmer cards',
    body: 'Cards on Today and in your library sit closer together, with smaller type and pictures that run nearly to the edge, so more of them fit on a screen. More Info and Keep are now a quiet line of links. Returning, removing or deleting something asks right where you are instead of in a pop-up.',
  },
  {
    when: 'Oct 24, 2026',
    title: 'Ink and type size on canvases',
    body: 'Notes and links can be drawn in ten inks, from slate to copper. Select a note to make its text larger or smaller; the note grows with it. Double-click a note to edit it.',
  },
  {
    when: 'Oct 9, 2026',
    title: 'Folders you can put anywhere',
    body: 'Collections are folders now. Tap one and its contents fan out beside it; tap again to put them away, or press Open to see the whole board. Drag folders anywhere, the way you would on a desk, and give each one a colour. Each folder remembers when you last opened it.',
  },
  {
    when: 'Sep 22, 2026',
    title: 'A new look',
    body: 'A dark brown page, cream type and paper cards, with titles in Benguiat. Today, your library, Collections and Canvases now share one masthead. Canvases have a dotted board, a light glass toolbar, and a frame with the file’s name when you select something.',
  },
  {
    when: 'Aug 30, 2026',
    title: 'Pictures that move',
    body: 'A short clip saved as a picture plays on a silent loop, like a gif. Open any picture and you’ll see the colours drawn from it, its size, and room for your own note.',
  },
  {
    when: 'Aug 11, 2026',
    title: 'Today’s Handful',
    body: 'About twenty pieces from other people, new each day. Keep what speaks to you, add a note, a picture or a song, and return it. Once a piece has passed through four or more hands, it says so. The trail shows what others added, dated by the day and never by name.',
  },
  {
    when: 'Jul 18, 2026',
    title: 'Anonymous by design',
    body: 'Nothing you add carries an author field. Dates are kept to the day. A picture you add is redrawn on your device before it’s stored, which leaves its location data and original file name behind.',
  },
  {
    when: 'Jun 27, 2026',
    title: 'Collections, by when you’ll want them',
    body: 'Group what you’ve kept by the moment you’ll reach for it, not by topic. Give a collection a purpose and it suggests other things you’ve saved that might belong.',
  },
  {
    when: 'May 30, 2026',
    title: 'Canvas',
    body: 'An open surface for arranging what you’ve kept. Place cards, draw lines between them and label why they belong together, add notes and groups, and ask for ideas from anything you select.',
  },
  {
    when: 'May 6, 2026',
    title: 'Recall',
    body: 'Search what you’ve saved by meaning: describe it the way you remember it, like “the image with warm, earthy colours”. It runs on your device, and if it can’t, it falls back to plain keywords.',
  },
];

export function AboutView({ page }: { page: AboutPage }) {
  return (
    <main className="about">
      {page === 'purpose' && (
        <article className="about-prose">
          <p className="about-lead">
            Last year my friends and I passed a teddy bear around campus, one person a day. We gave it outfits and a backstory, and “clipped” each other with it in the group chat. It was the easiest sharing I’d ever done. Nobody was trying to impress anyone, and there was no follower count or like count anywhere near it.
          </p>
          <p>
            In Other Hands is my attempt to keep that feeling. Every day there’s a small handful of things other people saved: a photo, a note, a song, a page from something they read. You keep what speaks to you, add something of your own, and return it. There’s no profile, no feed and no scroll. Nobody has a name on what they leave, so there’s no one to impress and nothing to keep up with.
          </p>
          <a className="about-next" href={href('/today')}>See today’s handful →</a>
        </article>
      )}

      {page === 'experience' && (
        <article className="about-prose">
          <section>
            <span className="about-kicker">01 · Your own space</span>
            <p className="about-lead">
              You start with your own space. Recall finds things you’ve saved by meaning, not by keyword. Canvas lets you arrange them on an open surface, and Collections groups them by when you’ll want them again, not what they’re about. All of this works with no one else on the site.
            </p>
          </section>
          <section>
            <span className="about-kicker">02 · Today’s Handful</span>
            <p className="about-lead">
              Then there’s Today’s Handful. About twenty pieces from other people are waiting. You borrow a few, spend time with them, add something and send them back. What you return becomes part of someone else’s handful tomorrow.
            </p>
          </section>
          <a className="about-next" href={href('/library')}>Open your library →</a>
        </article>
      )}

      {page === 'newsroom' && (
        <article className="about-prose">
          <ol className="about-news">
            {NEWS.map((n) => (
              <li key={n.title}>
                <span className="about-kicker">{n.when}</span>
                <h2>{n.title}</h2>
                <p>{n.body}</p>
              </li>
            ))}
            <li className="is-coming">
              <span className="about-kicker">Coming up</span>
              <p>Real capture from your phone, a shared place to return pieces to, and smarter first groupings that you can rearrange.</p>
            </li>
          </ol>
        </article>
      )}
    </main>
  );
}
