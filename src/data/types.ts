export type CardType =
  | 'article'
  | 'quote'
  | 'image'
  | 'note'
  | 'link'
  | 'book'
  | 'podcast'
  | 'video'
  | 'highlight';

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
  /** For images: dominant colours, most dominant first. */
  palette?: string[];
  /** Where the user used it or who they shared it with. */
  context?: string;
  tags?: string[];
  collections?: string[];
  savedAt: string;
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
};
