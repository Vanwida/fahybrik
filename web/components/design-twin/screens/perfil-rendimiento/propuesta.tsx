'use client';

// PROPUESTA — Perfil como arquetipo **Lista**: «el conjunto y su estado de un
// vistazo». Tres cambios, y ninguno es cosmético:
//
//  1. Las cinco filas dejan de ser puertas con la etiqueta de lo que hay dentro
//     y llevan SU cifra, alineada en columna a la derecha. La etiqueta baja a
//     13 y el dato sube a 22 mono — el §4 en un sitio donde hoy es 13/13.
//  2. El subtítulo explicativo solo sobrevive cuando NO hay dato, y entonces
//     deja de describir la puerta y dice qué acto la llena.
//  3. Las cinco tarjetas sueltas separadas 16 pt pasan a UN grupo con hairlines:
//     los números se alinean, la sección se lee de un golpe y ahorra ~90 pt.
//
// La regla que decide si una fila pinta en cero — y es una regla, no un caso:
// **un contador de progreso se pinta también en cero** (te dice cuánto te queda);
// **un valor medido no existe hasta que se mide** (y ahí va la invitación).

import { Card, Etiqueta, Hairline, Chevron, Pantalla, Seccion, TabBar, Pastilla } from '../../kit-composicion/chrome';
import { FilaDato, GrupoFilas } from '../../kit-composicion/estados';
import { delta, esDecimal } from '../../kit-composicion/formato';
import { S } from '../../kit-composicion/tokens';
import { AJUSTES_HOY, type EstadoAtleta } from './data';

/** Cuántas de las cinco filas tienen algo REALMENTE medido por el atleta. */
function conDato(a: EstadoAtleta): number {
  return [
    a.tests.completos > 0 || a.tests.empezados > 0,
    a.marcas.conRecord > 0,
    a.vo2 !== null,
    a.zonas.umbralPpm !== null,
    a.fuerza.length > 0,
  ].filter(Boolean).length;
}

export function PerfilPropuesta({ atleta, onLog }: { atleta: EstadoAtleta; onLog: (l: string) => void }) {
  const n = conDato(atleta);
  const masPesado = [...atleta.fuerza].sort((x, y) => y.kg - x.kg)[0];

  return (
    <Pantalla estrategia="llena" tabBar={<TabBar activa="Perfil" />}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.l}px ${S.xxl}px`,
        }}
      >
        {/* Identidad — quién eres y de quién dependes. No es el sujeto. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: `0 ${S.xs}px` }}>
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--twin-surface-elevated)',
              border: '1px solid var(--twin-hairline)',
              display: 'grid',
              placeItems: 'center',
              font: 'italic 800 21px/1 var(--twin-font-sans)',
              color: 'var(--twin-accent-text)',
            }}
          >
            {atleta.inicial}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span className="t-headline-m" style={{ color: 'var(--twin-fg)' }}>
              {atleta.nombre}
            </span>
            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              {atleta.nivel ? `${atleta.nivel} · ${atleta.altaHace}` : atleta.altaHace}
            </span>
          </div>
        </div>

        {/* RENDIMIENTO — el sujeto de esta pantalla. Va primero, con su estado. */}
        <Seccion
          accesorio={
            n === 0 ? (
              <Pastilla tono="acento">Empieza por tus tests</Pastilla>
            ) : (
              <span style={{ font: '600 11px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                {n} de 5 con dato
              </span>
            )
          }
        >
          Rendimiento
        </Seccion>

        <GrupoFilas>
          {/* Contador: se pinta también en cero — en cero es cuando más dice. */}
          <FilaDato
            etiqueta="Tus tests"
            valor={String(atleta.tests.completos)}
            sufijo={`de ${atleta.tests.total}`}
            pie={
              atleta.tests.empezados > 0
                ? `calibrados · ${atleta.tests.empezados} a medias`
                : atleta.tests.completos === atleta.tests.total
                  ? 'calibrado'
                  : 'calibrados'
            }
            acento={atleta.tests.completos < atleta.tests.total}
            onTap={() => onLog('Tus tests → hub de calibración')}
          />

          {/* Contador. */}
          <FilaDato
            etiqueta="Tus marcas"
            valor={String(atleta.marcas.conRecord)}
            sufijo={`de ${atleta.marcas.catalogo}`}
            pie="con récord"
            onTap={() => onLog('Tus marcas → biblioteca de marcas')}
          />

          {/* Valor medido: si no hay reloj, no hay VO₂ — y se dice. */}
          <FilaDato
            etiqueta="Tu VO₂ máx"
            valor={atleta.vo2 ? esDecimal(atleta.vo2.valor) : undefined}
            pie={atleta.vo2 ? `ml/kg/min · ${atleta.vo2.fuente}` : undefined}
            invitacion="Lo trae tu reloj en cuanto lo conectes"
            accesorio={
              atleta.vo2?.delta30 !== null && atleta.vo2 !== null ? (
                <Pastilla tono={atleta.vo2.delta30 >= 0 ? 'ok' : 'aviso'}>
                  {delta(atleta.vo2.delta30)} en 30 d
                </Pastilla>
              ) : undefined
            }
            onTap={() => onLog('Tu VO₂ máx → curva del reloj')}
          />

          {/* Valor medido. Sin ancla NO hay zonas y no se inventa (28-jul). */}
          <FilaDato
            etiqueta="Tus zonas de pulso"
            valor={atleta.zonas.umbralPpm !== null ? String(atleta.zonas.umbralPpm) : undefined}
            sufijo={atleta.zonas.umbralPpm !== null ? 'ppm' : undefined}
            pie={
              atleta.zonas.umbralPpm !== null ? `umbral · ${atleta.zonas.modalidades} modalidades` : undefined
            }
            invitacion="Sin ancla todavía. Tu 5K o tu 2K de remo la fija"
            onTap={() => onLog('Zonas → sin ancla: se ofrece medir el umbral')}
          />

          {/* Valor medido: el más pesado, y el pie dice cuál y cuántos van. */}
          <FilaDato
            etiqueta="Tu fuerza"
            valor={masPesado ? esDecimal(masPesado.kg, Number.isInteger(masPesado.kg) ? 0 : 1) : undefined}
            sufijo={masPesado ? 'kg' : undefined}
            pie={masPesado ? `${masPesado.label.toLowerCase()} · ${atleta.fuerza.length} de 3` : undefined}
            invitacion="La batería de 1RM la llena en una sesión"
            onTap={() => onLog('Tu fuerza → 1RM por levantamiento')}
          />
        </GrupoFilas>

        {/* Ajustes: un valor categórico no es un readout — pesa por tamaño y
            color (15 semibold contra 13 muted), no por monoespaciado. */}
        <Seccion>Cuenta</Seccion>
        <Card padding={0}>
          {AJUSTES_HOY.map((a, i) => (
            <div key={a.label}>
              {i > 0 ? <Hairline /> : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: `${S.m}px ${S.l - 2}px` }}>
                <span style={{ flex: 1, font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {a.label}
                </span>
                <span style={{ font: '650 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{a.valor}</span>
                <Chevron />
              </div>
            </div>
          ))}
        </Card>

        <Seccion>Dispositivos</Seccion>
        <Card padding={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: `${S.m}px ${S.l - 2}px` }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                {atleta.dispositivo ?? 'Ningún reloj conectado'}
              </span>
              {!atleta.dispositivo ? (
                <span style={{ font: '400 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                  Sin reloj medimos lo que hagas en la app, y nada más
                </span>
              ) : null}
            </span>
            {atleta.dispositivo ? <Pastilla tono="ok">Sincronizado</Pastilla> : <Pastilla tono="acento">Conectar</Pastilla>}
            <Chevron />
          </div>
        </Card>

        <div style={{ padding: `${S.s}px ${S.xs}px 0` }}>
          <Etiqueta>Entreno · apariencia · metodología · ayuda · legal</Etiqueta>
        </div>
      </div>
    </Pantalla>
  );
}
