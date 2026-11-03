/** Thin-stroke tool icons for the canvas rail (18px, currentColor). */

const P = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconLibrary = () => (
  <svg {...P}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M10 4h4v16h-4" />
    <path d="M15.5 5.2l3.2-.9 2.8 15-3.2.9z" />
  </svg>
);
export const IconIdeas = () => (
  <svg {...P}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="2.4" />
  </svg>
);
export const IconNote = () => (
  <svg {...P}>
    <path d="M4 4h16v11l-5 5H4z" />
    <path d="M15 20v-5h5" />
  </svg>
);
export const IconGroup = () => (
  <svg {...P}>
    <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />
  </svg>
);
export const IconLinks = () => (
  <svg {...P}>
    <circle cx="5.5" cy="6" r="2.2" />
    <circle cx="18.5" cy="18" r="2.2" />
    <path d="M7.5 7.5c5 1 3 8 9 9" strokeDasharray="2 2.6" />
  </svg>
);
export const IconUndo = () => (
  <svg {...P}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const IconRedo = () => (
  <svg {...P}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
export const IconMap = () => (
  <svg {...P}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
export const IconFit = () => (
  <svg {...P}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const IconFile = () => (
  <svg {...P} width={13} height={13}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </svg>
);
export const IconOpen = () => (
  <svg {...P} width={15} height={15}>
    <path d="M14 4h6v6M20 4l-8 8" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const IconKeep = () => (
  <svg {...P} width={15} height={15}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);
export const IconTrash = () => (
  <svg {...P} width={15} height={15}>
    <path d="M4 7h16M10 7V5h4v2M6.5 7l1 12.5h9L17.5 7" />
  </svg>
);
