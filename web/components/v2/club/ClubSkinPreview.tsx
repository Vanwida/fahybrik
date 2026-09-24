'use client';

// Cómo se ve el color del club en las DOS superficies del producto: el panel
// en claro, y el panel en oscuro + la app del atleta (que comparten familia).
// En el panel el acento tiene tres trabajos y solo tres: el botón principal, el
// anillo de foco y el logo. La app además lo usa como texto. Si hubo que mover
// el color para que se lea, se DICE debajo, nunca a escondidas.

import { Info, Wand2 } from 'lucide-react';
import { buildClubAccent, type AccentRole } from '@fahybrid/shared/domain/coach/club-accent';
import { ClubMark } from '@/components/v2/club/ClubBrand';

/** Neutros reales de cada superficie (v2-theme.css; la app, Theme.swift). */
const LIGHT = { bg: '#f4f4f2', card: '#ffffff', fg: '#141413', muted: '#52524d', line: '#dcdcd7' } as const;
const DARK = { bg: '#0b0b0c', card: '#161618', fg: '#f2f2f2', muted: '#a6a6a6', line: '#2c2c30' } as const;

/** Sin color propio: el neutro del panel (tinta) en cada tema. */
const NEUTRAL_LIGHT: Pick<AccentRole, 'fill' | 'on_fill' | 'text'> = { fill: '#141413', on_fill: '#f2f2f2', text: '#141413' };
const NEUTRAL_DARK: Pick<AccentRole, 'fill' | 'on_fill' | 'text'> = { fill: '#f2f2f2', on_fill: '#141413', text: '#f2f2f2' };

function Escaparate({
  title,
  n,
  accent,
  wordmark,
  logoSrc,
  showText,
}: {
  title: string;
  n: typeof LIGHT | typeof DARK;
  accent: Pick<AccentRole, 'fill' | 'on_fill' | 'text'>;
  wordmark: string;
  logoSrc: string;
  showText?: boolean;
}) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="t-meta text-v2-muted">{title}</figcaption>
      <div aria-hidden className="flex flex-col gap-3 rounded-panel border p-3" style={{ background: n.bg, borderColor: n.line }}>
        <div className="flex items-center gap-2.5">
          <ClubMark src={logoSrc} alt="" className="size-8 shrink-0" style={{ background: n.card }} />
          <span className="truncate t-body font-semibold" style={{ color: n.fg }}>
            {wordmark}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-ctl border px-2.5 py-2" style={{ background: n.card, borderColor: n.line }}>
          <span
            className="h-7 flex-1 rounded-ctl border px-2 t-body-sm leading-7"
            style={{ borderColor: n.line, color: n.muted, boxShadow: `0 0 0 2px ${n.card}, 0 0 0 4px ${accent.fill}` }}
          >
            Campo con foco
          </span>
          <span
            className="inline-flex h-7 shrink-0 items-center rounded-ctl px-3 t-body-sm font-semibold"
            style={{ background: accent.fill, color: accent.on_fill }}
          >
            Guardar
          </span>
        </div>
        {showText ? (
          <span className="t-body-sm font-medium" style={{ color: accent.text }}>
            Tu color cuando hace de texto
          </span>
        ) : null}
      </div>
    </figure>
  );
}

export function ClubSkinPreview({
  accentHex,
  wordmark,
  logoSrc,
}: {
  accentHex: string | null;
  wordmark: string;
  logoSrc: string;
}) {
  const family = buildClubAccent(accentHex);
  const avisos = [...new Set((family?.adjustments ?? []).map((a) => a.reason))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Escaparate title="Panel en claro" n={LIGHT} accent={family?.light ?? NEUTRAL_LIGHT} wordmark={wordmark} logoSrc={logoSrc} />
        <Escaparate
          title="Panel en oscuro y app del atleta"
          n={DARK}
          accent={family?.dark ?? NEUTRAL_DARK}
          wordmark={wordmark}
          logoSrc={logoSrc}
          showText
        />
      </div>

      {family?.collision ? (
        <p className="flex items-start gap-1.5 t-body-sm text-v2-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>
            Se parece al {family.collision.name} que en el panel significa «{family.collision.meaning}». Funciona, pero
            puede confundir.
          </span>
        </p>
      ) : null}
      {avisos.map((aviso) => (
        <p key={aviso} className="flex items-start gap-1.5 t-body-sm text-v2-muted">
          <Wand2 aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>{aviso}</span>
        </p>
      ))}
      <p className="t-meta text-v2-faint">
        Llega a tu panel, a la app y el reloj de tus atletas y a sus correos. Todavía no al icono de la app en su
        móvil.
      </p>
    </div>
  );
}
