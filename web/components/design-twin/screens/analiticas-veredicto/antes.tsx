'use client';

// HOY — la sección vacía de Analíticas, transcrita de AnalyticsView.swift:44-244
// y AnalyticsCardView.swift:150.
//
// Llena de forma y vacía de fondo: N tarjetas que dicen cada una lo mismo
// («Aún no hay datos.»), ninguna con salida, y el selector de periodo arriba
// haciendo de sujeto de una pantalla que no tiene nada que decir.

import { Card, Pantalla, TabBar } from '../../kit-composicion/chrome';
import { HuecoMuerto } from '../../kit-composicion/estados';
import { R, S } from '../../kit-composicion/tokens';
import { TARJETAS_VACIAS_HOY } from './data';

function Capsulas({ items, activo }: { items: readonly string[]; activo: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="twin-scroll">
      {items.map((t) => (
        <span
          key={t}
          style={{
            flex: '0 0 auto',
            padding: '7px 13px',
            borderRadius: R.pill,
            border: '1px solid var(--twin-hairline)',
            background: t === activo ? 'var(--twin-surface-elevated)' : 'transparent',
            font: '800 11px/1 var(--twin-font-sans)',
            letterSpacing: '0.03em',
            color: t === activo ? 'var(--twin-fg)' : 'var(--twin-muted)',
          }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function AnaliticasHoy() {
  return (
    // Raíz de pestaña: no hay barra de navegación, el título va DENTRO del scroll.
    <Pantalla estrategia="llena" tabBar={<TabBar activa="Analíticas" />}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.l, padding: `${S.s}px ${S.xl}px 0` }}>
          <span className="t-headline-m" style={{ color: 'var(--twin-fg)' }}>
            Analíticas
          </span>
          <Capsulas items={['Carrera', 'Ergo', 'Fuerza', 'HYROX', 'Recup.']} activo="Fuerza" />
          <Capsulas items={['7 días', 'Mes', 'Año', 'Custom']} activo="Mes" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {TARJETAS_VACIAS_HOY.map((t) => (
              <Card key={t} padding={15}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{t}</span>
                  <span style={{ font: '400 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                    Aún no hay datos.
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <HuecoMuerto nota="Cuatro tarjetas para decir cuatro veces lo mismo, y ninguna dice qué hacer para llenarlas." />
      </div>
    </Pantalla>
  );
}
