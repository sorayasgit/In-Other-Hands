export type CardType =
  | 'article'
  | 'quote'
  | 'image'
  | 'note'
  | 'link'
  | 'book'
  | 'podcast'
  | 'video'
  | 'highlight'
  | 'song'
  | 'recipe';

export interface Source {
  name: string;
  author?: string;
  url?: string;
}

/** One thing the user saved. Everything a person might remember about it is a searchable field. */
export interface Card {
  id: string;
  type: CardType;
  title: string;
  source?: Source;
  /** What the thing is about, in the source's or a summariser's words. */
  description?: string;
  /** Excerpt / body text kept with the card. */
  body?: string;
  /** For quotes and highlights: the exact words. */
  quote?: string;
  /** The user's own words about why they kept it. */
  note?: string;
  /** For images: what's in the picture. */
  caption?: string;
  /** For images: text read off the picture. */
  ocr?: string;
  /** A picture of the thing itself (a book cover, a photo), as a path under /public. */
  cover?: string;
  /** For images: dominant colours, most dominant first. */
  palette?: string[];
  /** Where the user used it or who they shared it with. */
  context?: string;
  tags?: string[];
  collections?: string[];
  savedAt: string;
  /** 'borrowed' = kept from Today's handful. Absent means 'mine'. (Named `origin` because `source`
   * already describes where a card's content came from.) */
  origin?: 'mine' | 'borrowed';
  pieceId?: string;
  /** How many hands a borrowed piece has passed through. */
  hands?: number;
  trail?: TrailEntry[];
}

/** Something a hand added to a piece. Anonymous by construction: no person, no time finer than a day. */
export interface TrailEntry {
  id: string;
  kind: 'note' | 'image' | 'song';
  text: string;
  imageDataUrl?: string;
  /** YYYY-MM-DD */
  addedOn: string;
}

export const TYPE_LABEL: Record<CardType, string> = {
  article: 'Article',
  quote: 'Quote',
  image: 'Image',
  note: 'Note',
  link: 'Link',
  book: 'Book',
  podcast: 'Podcast',
  video: 'Video',
  highlight: 'Highlight',
  song: 'Song',
  recipe: 'Recipe',
};
