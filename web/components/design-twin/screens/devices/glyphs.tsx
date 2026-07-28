'use client';

// Glifos del hub. La app usa SF Symbols; aquí van redibujados como SVG genérico
// (sin logos de marca: la marca es el TEXTO, igual que en la app). El nombre de
// cada glifo conserva el del símbolo que sustituye para poder auditarlo contra
// el Swift.

export type GlyphName =
  | 'figure.run.circle'
  | 'watch.analog'
  | 'heart.text.square'
  | 'heart.circle'
  | 'antenna.radiowaves.left.and.right'
  | 'figure.rower'
  | 'chevron.right'
  | 'chevron.left'
  | 'info.circle'
  | 'exclamationmark.triangle.fill'
  | 'lock.shield'
  | 'lock.fill'
  | 'doc.on.doc'
  | 'checkmark'
  | 'checkmark.circle.fill'
  | 'arrow.up.right'
  | 'arrowtriangle.right.fill'
  | 'xmark'
  | 'square.and.arrow.up'
  | 'book';

export interface GlyphProps {
  name: GlyphName;
  /** Lado en px del cuadro del símbolo (el Swift lo da como .font(size:)). */
  size?: number;
  color?: string;
  /** Grosor del trazo relativo al viewBox de 24. */
  weight?: number;
}

interface Stroke {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
}

export function Glyph({ name, size = 16, color = 'currentColor', weight = 1.9 }: GlyphProps) {
  const stroke: Stroke = {
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
      {body(name, stroke, color)}
    </svg>
  );
}

function body(name: GlyphName, s: Stroke, color: string) {
  switch (name) {
    case 'chevron.right':
      return <path d="M9.5 5.5 16 12l-6.5 6.5" {...s} />;
    case 'chevron.left':
      return <path d="M14.5 5.5 8 12l6.5 6.5" {...s} />;
    case 'checkmark':
      return <path d="M4.5 12.5 9.5 17.5 19.5 6.5" {...s} />;
    case 'xmark':
      return (
        <>
          <path d="M6 6 18 18" {...s} />
          <path d="M18 6 6 18" {...s} />
        </>
      );
    case 'arrow.up.right':
      return (
        <>
          <path d="M7 17 17 7" {...s} />
          <path d="M9.5 7H17v7.5" {...s} />
        </>
      );
    case 'arrowtriangle.right.fill':
      return <path d="M8 5.5 17 12l-9 6.5z" fill={color} />;
    case 'checkmark.circle.fill':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill={color} />
          <path d="M7.4 12.3 10.6 15.5 16.8 9" stroke="var(--twin-bg)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'info.circle':
      return (
        <>
          <circle cx="12" cy="12" r="9.2" {...s} />
          <path d="M12 11v5.5" {...s} />
          <circle cx="12" cy="7.6" r="1.1" fill={color} />
        </>
      );
    case 'exclamationmark.triangle.fill':
      return (
        <>
          <path d="M12 3.4c.6 0 1.1.3 1.4.9l8.1 14.4c.6 1.1-.2 2.3-1.4 2.3H3.9c-1.2 0-2-1.2-1.4-2.3l8.1-14.4c.3-.6.8-.9 1.4-.9z" fill={color} />
          <path d="M12 9v5" stroke="var(--twin-bg)" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="17.4" r="1.15" fill="var(--twin-bg)" />
        </>
      );
    case 'lock.fill':
      return (
        <>
          <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" {...s} strokeWidth={s.strokeWidth * 0.95} />
          <rect x="5.4" y="10.5" width="13.2" height="9.4" rx="2.6" fill={color} />
        </>
      );
    case 'lock.shield':
      return (
        <>
          <path d="M12 2.8 4.6 5.6v6.1c0 4.6 3.1 8.2 7.4 9.5 4.3-1.3 7.4-4.9 7.4-9.5V5.6z" {...s} />
          <path d="M10.1 11.4V9.9a1.9 1.9 0 0 1 3.8 0v1.5" {...s} strokeWidth={s.strokeWidth * 0.8} />
          <rect x="8.9" y="11.4" width="6.2" height="4.9" rx="1.4" fill={color} />
        </>
      );
    case 'doc.on.doc':
      return (
        <>
          <rect x="8.6" y="3.4" width="11" height="13.4" rx="2.4" {...s} />
          <path d="M15.4 20.6H6.8a2.4 2.4 0 0 1-2.4-2.4V7.6" {...s} />
        </>
      );
    case 'antenna.radiowaves.left.and.right':
      return (
        <>
          <circle cx="12" cy="12" r="2.1" fill={color} />
          <path d="M7.9 8.2a5.4 5.4 0 0 0 0 7.6M16.1 8.2a5.4 5.4 0 0 1 0 7.6" {...s} />
          <path d="M5 5.4a9.3 9.3 0 0 0 0 13.2M19 5.4a9.3 9.3 0 0 1 0 13.2" {...s} />
        </>
      );
    case 'heart.circle':
      return (
        <>
          <circle cx="12" cy="12" r="9.2" {...s} />
          <path d="M12 17.2s-4.4-2.8-4.4-5.7A2.6 2.6 0 0 1 12 10a2.6 2.6 0 0 1 4.4 1.5c0 2.9-4.4 5.7-4.4 5.7z" fill={color} />
        </>
      );
    case 'heart.text.square':
      return (
        <>
          <rect x="3" y="3.4" width="18" height="17.2" rx="4.4" {...s} />
          <path d="M12 16.8s-3.7-2.3-3.7-4.7A2.2 2.2 0 0 1 12 10.5a2.2 2.2 0 0 1 3.7 1.6c0 2.4-3.7 4.7-3.7 4.7z" fill={color} />
          <path d="M6.8 7.4h10.4" {...s} strokeWidth={s.strokeWidth * 0.8} />
        </>
      );
    case 'watch.analog':
      return (
        <>
          <path d="M9 5.4 9.4 2.6h5.2L15 5.4M9 18.6l.4 2.8h5.2l.4-2.8" {...s} strokeWidth={s.strokeWidth * 0.9} />
          <rect x="4.9" y="4.9" width="14.2" height="14.2" rx="5.2" {...s} />
          <path d="M12 8.6V12l2.5 1.9" {...s} strokeWidth={s.strokeWidth * 0.9} />
        </>
      );
    case 'figure.run.circle':
      return (
        <>
          <circle cx="12" cy="12" r="9.2" {...s} />
          <circle cx="13.6" cy="7.5" r="1.5" fill={color} />
          <path d="M14.3 10.2 11 12l1.9 2.2-.8 3.6M12.9 14.2l2.9 1.3M11 12 8 12.6" {...s} strokeWidth={s.strokeWidth * 0.95} />
        </>
      );
    case 'figure.rower':
      return (
        <>
          <circle cx="15.4" cy="5.6" r="1.8" fill={color} />
          <path d="M15.8 9 12 11.4l2.6 2.6-.4 4M14.6 14 18 15.4" {...s} />
          <path d="M4 18.4h7.4" {...s} />
        </>
      );
    case 'square.and.arrow.up':
      return (
        <>
          <path d="M12 3.6v10.2M8.6 6.8 12 3.4l3.4 3.4" {...s} />
          <path d="M6.6 11.2H5.4v8.2a1.4 1.4 0 0 0 1.4 1.4h10.4a1.4 1.4 0 0 0 1.4-1.4v-8.2h-1.2" {...s} />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M4.4 5.2A2 2 0 0 1 6.4 3.2h4.2A1.4 1.4 0 0 1 12 4.6v14a1.4 1.4 0 0 0-1.4-1.4H6.4a2 2 0 0 1-2-2z" {...s} />
          <path d="M19.6 5.2a2 2 0 0 0-2-2h-4.2A1.4 1.4 0 0 0 12 4.6v14a1.4 1.4 0 0 1 1.4-1.4h4.2a2 2 0 0 0 2-2z" {...s} />
        </>
      );
  }
}
