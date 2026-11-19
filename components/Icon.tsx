// Simple line icons (no emoji), drawn in the current text colour.
const P: Record<string, React.ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" /></>,
  group: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><circle cx="17" cy="10" r="2.5" /><path d="M16 14.2a4.5 4.5 0 015 4.3" /></>,
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 13h18" /></>,
  truck: <><path d="M2 6h11v10H2zM13 9h4l3 3v4h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  egg: <path d="M12 3c3.5 0 6.5 5.5 6.5 10a6.5 6.5 0 01-13 0C5.5 8.5 8.5 3 12 3z" />,
  home: <path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  checks: <path d="M2 13l4 4L14 8M10 15l2 2L21 8" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  more: <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
  reply: <path d="M10 6L4 12l6 6M4 12h9a7 7 0 017 7" />,
  bookmark: <path d="M6 4h12v17l-6-4-6 4z" />,
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8" />,
  forward: <path d="M14 6l6 6-6 6M20 12h-9a7 7 0 00-7 7" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.2" /></>,
  thumb: <path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 2.5L12.5 9H19a1.5 1.5 0 011.5 1.8l-1.3 7.5A2 2 0 0117.2 20H7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
};
export default function Icon({ name, size = 22 }: { name: keyof typeof P; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, verticalAlign: "middle" }}>
      {P[name]}
    </svg>);
}
