// Inline SVG icons. No emoji anywhere in the UI.
// Stroke icons inherit colour through currentColor.

const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

export const icons = {
  // sun, moon, close and clock are the theme doc's own paths.
  sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`),
  moon: svg(`<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`),
  close: svg(`<path d="M18 6 6 18M6 6l12 12"/>`),
  clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`),

  coffee: svg(
    `<path d="M4 9h13v5.5A4.5 4.5 0 0 1 12.5 19h-4A4.5 4.5 0 0 1 4 14.5V9Z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M7 4.5c0 1-.9 1.2-.9 2.2 0 .7.45 1 .45 1M11 4.5c0 1-.9 1.2-.9 2.2 0 .7.45 1 .45 1"/>`
  ),
  trophy: svg(
    `<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5.5A1.5 1.5 0 0 0 4 7.5 3.5 3.5 0 0 0 7.5 11H8M16 6h2.5A1.5 1.5 0 0 1 20 7.5a3.5 3.5 0 0 1-3.5 3.5H16"/><path d="M12 13v4M8.5 20h7M10 17h4"/>`
  ),
  settings: svg(
    `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`
  ),
  refresh: svg(`<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15.5"/><path d="M20 20v-4.5h-4.5"/>`),
  check: svg(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  heartFilled: svg(
    `<path d="M12 20.2 4.9 13a5 5 0 0 1 7.1-7l0 0a5 5 0 0 1 7.1 7L12 20.2Z" fill="currentColor" stroke="none"/>`
  ),

  // The game.
  undo: svg(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  erase: svg(`<path d="M20 20H9L4.6 15.6a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L12 19"/><path d="M8.5 9.5l6 6"/>`),
  pencil: svg(`<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="M14.5 5.5l3 3"/>`),
  bulb: svg(`<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>`),
  wand: svg(`<path d="m4 20 11-11"/><path d="m13 7 2 2"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M11 3v2M10 4h2"/>`),
  play: svg(`<path d="M7 5v14l11-7Z"/>`),
  pause: svg(`<path d="M8 5v14M16 5v14"/>`),
  stepBack: svg(`<path d="M17 5v14L8 12Z"/><path d="M6 5v14"/>`),
  stepForward: svg(`<path d="M7 5v14l9-7Z"/><path d="M18 5v14"/>`),
  skipBack: svg(`<path d="M19 6v12l-7-6ZM12 6v12l-7-6Z"/>`),
  skipForward: svg(`<path d="M5 6v12l7-6ZM12 6v12l7-6Z"/>`),
  copy: svg(`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`),
  grid: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>`),
  calendar: svg(`<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>`),
  wifi: svg(
    `<path d="M2 9.5a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".6" fill="currentColor"/>`
  ),
  race: svg(`<path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5"/><path d="M9 4v8M13 4v8M5 8h13"/>`),
  team: svg(`<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 19a5.5 5.5 0 0 1 11 0M14 19a4.5 4.5 0 0 1 7-3.7"/>`),
  link: svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  share: svg(`<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M8 11H6.5A2.5 2.5 0 0 0 4 13.5v5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5H16"/>`),
  thermo: svg(`<circle cx="7.5" cy="16.5" r="3.5"/><path d="M10 14 18.5 5.5"/>`),
  arrow: svg(`<circle cx="7.5" cy="16.5" r="3.5"/><path d="M10 14 19 5M13.5 5H19v5.5"/>`),
  // A line zigzagging high and low, as whispers' digits do.
  whisper: svg(`<path d="M4 17 8.5 7l4 10 4-10L20 15" stroke-width="2.6"/>`),
  // A grid cut into two uneven regions, as a Jigsaw's are.
  jigsaw: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h6v-4h4v8h6" stroke-width="2.4"/>`),
  // A corner of the grid, with a clue outside it and an arrow in.
  outside: svg(`<path d="M9 21V9h12" stroke-width="1.4"/><path d="M4 4l4 4M8 5v3H5"/><path d="M13 13h4v4h-4z" stroke-width="1.2"/>`),
  // A white dot and a black one, either side of a cell's edge.
  kropki: svg(`<path d="M12 4v16" stroke-width="1.2"/><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3" fill="currentColor"/>`),
  // A thick line over a run of three dots.
  renban: svg(`<path d="M5 12h14" stroke-width="3.2"/><circle cx="6" cy="18.5" r="1" fill="currentColor"/><circle cx="12" cy="18.5" r="1" fill="currentColor"/><circle cx="18" cy="18.5" r="1" fill="currentColor"/>`),
  cage: svg(`<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/><path d="M7.5 9.5h3" stroke-width="1.6"/>`),
  image: svg(`<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/>`),
  clipboard: svg(`<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5M9 4.5V6h6V4.5"/>`),
  trash: svg(`<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M10 11v6M14 11v6"/>`),
  dots: svg(
    `<g fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></g>`
  ),
  exit: svg(`<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>`),
};

export function icon(name) {
  return icons[name] || "";
}
