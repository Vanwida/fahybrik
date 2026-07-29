'use client';

// HOY — transcripción fiel de TestsHubView.swift (líneas 120-199 y 365-386)
// para el atleta que acaba de entrar, que es exactamente donde se rompe.
//
// Dos cosas, y la segunda es la peor:
//   · El contador vive tras `if let status, status.isScheduled` (línea 156) y
//     `preparingCard` se pinta justo cuando `!status.isScheduled` (línea 137).
//     Es decir: **el contador desaparece exactamente cuando valdría 0**, que es
//     cuando más falta hace explicar qué es calibrar.
//   · No hay UNA sola acción en toda la pantalla. `preparingCard` es un callejón
//     sin salida y el vacío de zonas tampoco ofrece nada.

import { Card, Etiqueta, NavBar, Pantalla } from '../../kit-composicion/chrome';
import { HuecoMuerto } from '../../kit-composicion/estados';
import { S, R } from '../../kit-composicion/tokens';

export function TestsHoy() {
  return (
    <Pantalla estrategia="llena" cabecera={<NavBar titulo="" atras />}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S.l,
            padding: `${S.l}px ${S.xl}px 0`,
          }}
        >
          {/* header — sin contador, porque status.isScheduled es false */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="t-headline-m" style={{ color: 'var(--twin-fg)' }}>
              Tus tests
            </span>
            <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              Corre el test y la app mide por ti: marca, recuperación y zonas. Tú solo aprietas.
            </span>
          </div>

          {/* zonesCard vacío */}
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
              <Etiqueta color="var(--twin-accent-text)">Tus zonas actuales</Etiqueta>
              <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Aún sin zonas. Tu primer test de ritmo las fija al momento.
              </span>
            </div>
          </Card>

          {/* preparingCard — el callejón sin salida */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.m }}>
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  flex: '0 0 auto',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: R.m,
                  background: 'var(--twin-surface-elevated)',
                  color: 'var(--twin-accent-text)',
                  font: '600 22px/1 var(--twin-font-sans)',
                }}
              >
                ◷
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="t-headline-s" style={{ color: 'var(--twin-fg)' }}>
                  Tu coach prepara tus tests
                </span>
                <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  Cuando los programe aparecerán aquí, con tu progreso y tus zonas.
                </span>
              </span>
            </div>
          </Card>
        </div>

        <HuecoMuerto nota="Ni una acción en toda la pantalla, y el contador de calibración está oculto justo porque vale cero." />
      </div>
    </Pantalla>
  );
}
