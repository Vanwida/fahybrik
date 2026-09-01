'use client';

// Cómo se ve el color del club en las DOS superficies del producto.
//
// El coach elige un color desde un panel de fondo claro, pero ese mismo color
// acaba pintando la app del atleta, que es casi negra. Enseñar solo una de las
// dos es enseñarle media verdad: un azul marino que aquí luce se le desaparece
// al atleta. Por eso la vista previa es doble y el ajuste se DICE, nunca se hace
// a escondidas.

import { CANVAS_DARK, buildClubAccent } from '@fahybrid/shared/domain/coach/club-accent';
import { MIcon } from '@/components/ui/MIcon';
import { ClubMark } from '@/components/v2/club/ClubBrand';

/** Los neutros de la app del atleta, tal y como los define ios Theme.swift.
 *  Aquí solo se re-dibujan para la vista previa; la fuente sigue siendo Swift. */
const APP = {
  bg: CANVAS_DARK,
  card: '#141416',
  fg: '#f5f3f0',
  muted: '#9a938b',
  hairline: 'rgba(255, 255, 255, 0.1)',
} as const;

/** Los del panel salen de los tokens, que es lo que pinta el resto de la página. */
const PANEL = {
  bg: 'var(--v2-surface-2)',
  card: 'var(--v2-surface)',
  fg: 'var(--v2-fg)',
  muted: 'var(--v2-muted)',
  hairline: 'var(--v2-border)',
} as const;

interface Neutrals {
  bg: string;
  card: string;
  fg: string;
  muted: string;
  hairline: string;
}

interface Accent {
  fill: string;
  on_fill: string;
  text: string;
  soft: string;
}

function Escaparate({
  titulo,
  neutrals,
  accent,
  wordmark,
  logoSrc,
}: {
  titulo: string;
  neutrals: Neutrals;
  accent: Accent;
  wordmark: string;
  logoSrc: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="text-xs font-semibold text-[color:var(--v2-muted)]">{titulo}</span>
      <div
        className="flex flex-col gap-3 rounded-[var(--v2-r-card)] border p-3"
        style={{ background: neutrals.bg, borderColor: neutrals.hairline }}
      >
        <div className="flex items-center gap-2.5">
          <ClubMark
            src={logoSrc}
            alt=""
            className="h-9 w-9 shrink-0"
            style={{ background: neutrals.card }}
          />
          <p className="truncate text-sm font-semibold" style={{ color: neutrals.fg }}>
            {wordmark}
          </p>
        </div>

        <div
          className="flex items-center gap-2 rounded-[var(--v2-r-block)] px-2.5 py-2"
          style={{ background: accent.soft }}
        >
          <MIcon name="bolt" size={16} style={{ color: accent.text }} />
          <span className="truncate text-xs font-medium" style={{ color: accent.text }}>
            Tu color cuando hace de texto
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-8 items-center rounded-[var(--v2-r-pill)] px-3 text-xs font-semibold"
            style={{ background: accent.fill, color: accent.on_fill }}
          >
            Empezar
          </span>
          <span className="truncate text-xs" style={{ color: neutrals.muted }}>
            y de relleno
          </span>
        </div>
      </div>
    </div>
  );
}

/** Lo que la piel del club alcanza hoy, y lo que no. Sin promesas. */
const ALCANCE_SI = [
  'Tu panel de entrenador',
  'La app del atleta y el reloj',
  'Los correos que reciben tus atletas',
];
const ALCANCE_NO = ['El icono y el nombre de la app en su móvil'];

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

  // Sin color propio se enseña el neutro del panel y el acento del binario: es
  // exactamente lo que verían, así que la vista previa sigue diciendo la verdad.
  const light: Accent = family
    ? family.light
    : {
        fill: 'var(--v2-accent)',
        on_fill: 'var(--v2-accent-fg)',
        text: 'var(--v2-accent-text)',
        soft: 'var(--v2-accent-soft)',
      };
  const dark: Accent = family
    ? family.dark
    : { fill: '#f06a2a', on_fill: '#511900', text: '#f06a2a', soft: 'rgba(240, 106, 42, 0.14)' };

  // Un mismo motivo puede repetirse en las dos superficies; se dice una vez.
  const avisos = [...new Set((family?.adjustments ?? []).map((a) => a.reason))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Escaparate
          titulo="En tu panel"
          neutrals={PANEL}
          accent={light}
          wordmark={wordmark}
          logoSrc={logoSrc}
        />
        <Escaparate
          titulo="En la app del atleta"
          neutrals={APP}
          accent={dark}
          wordmark={wordmark}
          logoSrc={logoSrc}
        />
      </div>

      {family?.collision ? (
        <p className="flex items-start gap-1.5 text-xs text-[color:var(--v2-muted)]">
          <MIcon name="info" size={15} className="mt-px shrink-0" />
          <span>
            Tu color se parece al {family.collision.name} con el que la app marca «
            {family.collision.meaning}». Funciona igual, pero a tus atletas puede costarles
            distinguirlos.
          </span>
        </p>
      ) : null}

      {avisos.map((aviso) => (
        <p key={aviso} className="flex items-start gap-1.5 text-xs text-[color:var(--v2-muted)]">
          <MIcon name="auto_fix_high" size={15} className="mt-px shrink-0" />
          <span>{aviso}</span>
        </p>
      ))}

      <div className="flex flex-col gap-1 rounded-[var(--v2-r-block)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
        <p className="text-xs text-[color:var(--v2-fg)]">
          <span className="font-semibold">Tu marca llega a:</span> {ALCANCE_SI.join(' · ')}.
        </p>
        <p className="text-xs text-[color:var(--v2-muted)]">
          <span className="font-semibold">Todavía no a:</span> {ALCANCE_NO.join(' · ')}.
        </p>
      </div>
    </div>
  );
}
