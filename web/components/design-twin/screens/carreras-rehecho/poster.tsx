'use client';

// EL PÓSTER — el sujeto de «Carreras». La foto (una de las tres del catálogo de
// la app, la misma para la misma carrera) con lo que importa AHORA de esa carrera
// en cifras enormes. Comparte lenguaje con el póster de «Hoy · El día» y NO lo
// copia: aquí manda el póster entero (es la pantalla), no una tarjeta más.
//
// Contraste MEDIDO (CONTRATO §4.2): el texto va SIEMPRE sobre foto oscurecida,
// también con el tema claro. Por eso el póster es una superficie de tema oscuro
// anidada (`data-appearance="dark"`): el equivalente web de
// `.environment(\.colorScheme, .dark)`, que sigue leyendo TOKENS, no hex. La capa
// entre foto y texto (`VELO_FOTO` y `FILTRO_FOTO`) parte de la de Hoy y se ha
// vuelto a auditar con píxeles: aquí hay MÁS texto sobre la foto (nombre, fechas,
// panel del predicho, regleta), así que el velo cierra antes.
//
// Altura (§6.1): el póster pide `flex: 1 0 auto` y reparte con `space-between`, de
// modo que el sobrante entra ENTRE el título y lo que se hace, en el propio
// sujeto, y nunca en una cola muerta debajo.

import type { CSSProperties, ReactNode } from 'react';
import type { LecturaCarreras, ProximaCarrera } from '../../kit-carreras/contrato';
import { accionObjetivo, type Sujeto } from '../../kit-carreras/decide';
import { ETIQUETA_PRIORIDAD, etiquetaEquipo, fechaConDia, fondoDe, lineaCategoria, metaTexto } from '../../kit-carreras/formato';
import { textoCuenta, textoPredicho, vozPredicho, type TextoPredicho } from '../../kit-carreras/textos';
import { Accion } from '../../kit-dia/hero';
import { IcoBaja, IcoCalendario, IcoDiana, IcoFlecha, IcoReintentar, IcoSube } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { FOTO, fuente, RADIO, TABULAR, TAM, TOQUE, velo } from '../../kit-dia/tokens';
import { IcoBandera, IcoPersonas, IcoPuntos } from './piezas';

/**
 * La capa entre la foto y el texto: el `--twin-bg` OSCURO en cuatro paradas.
 * Arriba es suave (kicker y nombre son blancos y grandes: aguantan una foto viva,
 * y ahí es donde se ve); desde el 34 % cierra, porque la cuenta atrás naranja
 * (3:1 como texto grande) y todo el 15-17 px de debajo necesitan un fondo casi negro.
 */
export const VELO_FOTO = `linear-gradient(180deg, ${velo('var(--twin-bg)', 40)} 0%, ${velo('var(--twin-bg)', 58)} 20%, ${velo('var(--twin-bg)', 86)} 42%, ${velo('var(--twin-bg)', 88)} 100%)`;

/** La foto se oscurece ella misma antes del velo, para que siga viéndose (formas, gente, luz) sin persiana. */
export const FILTRO_FOTO = 'brightness(0.52) contrast(1.06) saturate(0.95)';

const ALTO_MIN = 400;

/** Un panel translúcido sobre la foto (meta, predicho). */
export const panelFoto: CSSProperties = {
  borderRadius: RADIO.fila,
  boxSizing: 'border-box',
  background: velo('var(--twin-bg)', 62),
  border: `1px solid ${velo('var(--twin-fg)', 26)}`,
  color: 'var(--twin-fg)',
};

export const etiquetaFoto: CSSProperties = {
  ...fuente(800, TAM.suelo, 1.2),
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--twin-fg)',
};

export const nombreFoto: CSSProperties = {
  display: 'block',
  ...fuente(800, TAM.display, 1.02, true),
  letterSpacing: '-0.025em',
  color: 'var(--twin-fg)',
  textWrap: 'balance',
  overflowWrap: 'break-word',
};

/**
 * La superficie oscura anidada: foto + velo + contenido. Con `onClick` el póster
 * entero es UN botón: un botón invisible que lo cubre (`cr-abre`) POR DEBAJO de los
 * controles que lleva dentro (el ⋯, el «Reintentar»), que son sus hermanos con
 * `zIndex` mayor. Así no hay un botón dentro de otro botón y aun así se toca en
 * cualquier sitio. Sin `onClick` es una sección (lleva sus propias acciones).
 */
export function PosterBase({
  foto,
  etiqueta,
  onClick,
  menu,
  vivo,
  children,
}: {
  foto: string;
  etiqueta: string;
  onClick?: () => void;
  /** El «⋯» de las acciones raras, colgado de la esquina. */
  menu?: ReactNode;
  vivo?: 'status' | 'alert';
  children: ReactNode;
}) {
  const f = FOTO[foto as keyof typeof FOTO];
  const capa: CSSProperties = { position: 'absolute', inset: 0 };
  return (
    <section
      aria-label={onClick ? undefined : etiqueta}
      role={vivo}
      className="cr-poster"
      style={{ position: 'relative', flex: '1 0 auto', display: 'flex', borderRadius: RADIO.grande, overflow: 'hidden', isolation: 'isolate', '--hd-foco': 'var(--twin-fg)' } as CSSProperties}
    >
      <span className="twin-root cr-cuerpo" data-appearance="dark" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: ALTO_MIN, boxSizing: 'border-box' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.src} alt="" aria-hidden style={{ ...capa, width: '100%', height: '100%', objectFit: 'cover', objectPosition: f.posicion, filter: FILTRO_FOTO }} />
        <span aria-hidden style={{ ...capa, background: VELO_FOTO }} />
        <span
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 18,
            padding: '14px 22px 20px',
            textAlign: 'left',
            color: 'var(--twin-fg)',
            // Lo que no es un control deja pasar el toque al botón que cubre el póster.
            pointerEvents: onClick ? 'none' : undefined,
          }}
        >
          {children}
        </span>
      </span>
      {onClick ? (
        <button
          type="button"
          className="hd-toque hd-hero-btn cr-abre"
          onClick={onClick}
          aria-label={etiqueta}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, borderRadius: RADIO.grande }}
        />
      ) : null}
      {menu}
    </section>
  );
}

/** Estilo de un control que vive dentro de un póster clicable: por encima del botón que lo cubre. */
export const controlEnPoster: CSSProperties = { position: 'relative', zIndex: 2, pointerEvents: 'auto' };

/**
 * El «⋯»: 48 pt de toque, un círculo de 38 sobre la foto. Hermano del póster, no
 * hijo, pero con su propia raíz oscura: cuelga SOBRE la foto y su tinta tiene que
 * ser la del póster con los dos temas, no la del tema del teléfono.
 */
export function BotonMas({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <span className="twin-root" data-appearance="dark" style={{ position: 'absolute', top: 8, right: 10, zIndex: 2, background: 'transparent', width: TOQUE, height: TOQUE }}>
      <button
        type="button"
        className="hd-toque"
        aria-label={etiqueta}
        onClick={onClick}
        style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', '--hd-foco': 'var(--twin-fg)' } as CSSProperties}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: velo('var(--twin-bg)', 62),
            border: `1px solid ${velo('var(--twin-fg)', 26)}`,
            color: 'var(--twin-fg)',
          }}
        >
          <IcoPuntos tam={20} />
        </span>
      </button>
    </span>
  );
}

/** La regleta de tramos medidos: N de M, en neutro (el naranja se guarda para la cuenta atrás). */
function Regleta({ n, de }: { n: number; de: number }) {
  return (
    <span aria-hidden style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: de }, (_, i) => (
        <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < n ? 'var(--twin-fg)' : velo('var(--twin-fg)', 30) }} />
      ))}
    </span>
  );
}

/** El panel del predicho: TODOS sus estados con la misma forma (cifra, parcial, sin datos, sin meta, error, esqueleto). */
function PanelPredicho({ t, onReintentar }: { t: TextoPredicho; onReintentar?: () => void }) {
  if (t.esqueleto) {
    return (
      <span aria-busy aria-label="Calculando tu predicho" style={{ ...panelFoto, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Esqueleto ancho={130} alto={15} radio={5} />
        <Esqueleto ancho={110} alto={32} radio={8} />
        <Esqueleto ancho="76%" alto={15} radio={5} />
      </span>
    );
  }
  return (
    <span style={{ ...panelFoto, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)' }}>{t.etiqueta}</span>
      {t.valor ? (
        <span
          style={
            t.valorEsCifra
              ? { ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }
              : { ...fuente(800, 22, 1.15, true), color: 'var(--twin-fg)' }
          }
        >
          {t.valor}
        </span>
      ) : null}
      {t.regleta ? <Regleta n={t.regleta.n} de={t.regleta.de} /> : null}
      {t.frase ? (
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
          {t.marca ? (
            <span style={{ display: 'inline-flex', paddingTop: 1, color: t.marca === 'ok' ? 'var(--twin-ok)' : 'var(--twin-warning)' }}>
              {t.marca === 'ok' ? <IcoBaja tam={16} /> : <IcoSube tam={16} />}
            </span>
          ) : null}
          <span>{t.frase}</span>
        </span>
      ) : null}
      {t.reintentar && onReintentar ? (
        <button type="button" className="hd-toque" onClick={onReintentar} style={{ ...controlEnPoster, width: 'auto', alignSelf: 'flex-start', minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', gap: 8, ...fuente(700, TAM.suelo, 1), color: 'var(--twin-fg)', '--hd-foco': 'var(--twin-fg)' } as CSSProperties}>
          <IcoReintentar tam={18} />
          Reintentar
        </button>
      ) : null}
    </span>
  );
}

/** El objetivo con su cuenta atrás, su meta y su predicho. */
export function PosterObjetivo({
  s,
  l,
  onAbre,
  onAcciones,
  onReintentarPredicho,
}: {
  s: Extract<Sujeto, { tipo: 'objetivo' }>;
  l: LecturaCarreras;
  /** Qué hace la acción principal (lo decide `accionObjetivo`; la pantalla lo cablea). */
  onAbre: (a: ReturnType<typeof accionObjetivo>) => void;
  onAcciones: (c: ProximaCarrera) => void;
  onReintentarPredicho: () => void;
}) {
  const c = s.carrera;
  const accion = accionObjetivo(s, l.prediccion);
  const cuenta = textoCuenta(c.diasHasta);
  const hoy = c.diasHasta === 0;
  const kicker = s.principal ? (hoy ? 'Día de carrera' : ETIQUETA_PRIORIDAD.target) : ETIQUETA_PRIORIDAD[c.prioridad ?? 'target'];
  const cuando = c.fecha ? fechaConDia(c.fecha, l.hoy) : 'Fecha por confirmar';
  const donde = [cuando, c.lugar].filter(Boolean).join(' · ');
  const categoria = lineaCategoria(c);
  const equipo = etiquetaEquipo(c.formato);
  const predicho = textoPredicho(l.prediccion, { principal: s.principal, tipoEvento: c.tipoEvento, formato: c.formato, metaS: c.metaS });
  // Cargando/error en este panel NO cambian la acción: el detalle tiene sus propios estados.
  const etiqueta = [
    kicker,
    c.nombre,
    hoy ? 'es hoy' : cuenta ? `faltan ${cuenta.cifra} ${cuenta.unidad}` : null,
    donde,
    categoria,
    equipo,
    c.metaS != null ? `Objetivo ${metaTexto(c.metaS)}` : null,
    vozPredicho(predicho),
    accion.etiqueta,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <PosterBase
      foto={fondoDe(String(c.raceId))}
      etiqueta={etiqueta}
      onClick={() => onAbre(accion)}
      menu={<BotonMas etiqueta={`Acciones de ${c.nombre}`} onClick={() => onAcciones(c)} />}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, paddingRight: 52 }}>
          <span style={{ display: 'inline-flex', color: 'var(--twin-fg)' }}>{s.principal ? <IcoDiana tam={18} /> : <IcoBandera tam={18} />}</span>
          <span style={etiquetaFoto}>{kicker}</span>
        </span>
        <span role="heading" aria-level={2} style={nombreFoto}>{c.nombre}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-fg)' }}>
            <span style={{ display: 'inline-flex' }}>
              <IcoCalendario tam={18} />
            </span>
            <span>{donde}</span>
          </span>
          {categoria || equipo ? (
            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)' }}>
              {equipo ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <IcoPersonas tam={18} />
                  {equipo}
                </span>
              ) : null}
              {categoria ? <span>{categoria}</span> : null}
            </span>
          ) : null}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {cuenta ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span
                style={{
                  ...fuente(800, hoy ? TAM.cuentaHoy : TAM.cuenta, 0.95, true),
                  letterSpacing: '-0.04em',
                  color: 'var(--twin-accent-text)',
                  ...TABULAR,
                }}
              >
                {cuenta.cifra}
              </span>
              {cuenta.unidad ? <span style={{ ...fuente(800, TAM.seccion, 1, true), color: 'var(--twin-fg)' }}>{cuenta.unidad}</span> : null}
            </span>
          ) : (
            // Sin fecha no hay cuenta atrás: se dice, no se inventa una cifra.
            <span style={{ ...fuente(800, 30, 1.05, true), color: 'var(--twin-fg)' }}>Sin fecha aún</span>
          )}
          {c.metaS != null ? (
            <span style={{ ...panelFoto, display: 'flex', flexDirection: 'column', gap: 1, padding: '8px 14px', whiteSpace: 'nowrap' }}>
              <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.04em' }}>Objetivo</span>
              <span style={{ ...fuente(800, TAM.cuerpo, 1.2, true) }}>{metaTexto(c.metaS)}</span>
            </span>
          ) : null}
        </span>
        <PanelPredicho t={predicho} onReintentar={onReintentarPredicho} />
        <Accion icono={accion.tipo === 'ver-camino' ? <IcoFlecha tam={20} /> : undefined}>{accion.etiqueta}</Accion>
      </span>
    </PosterBase>
  );
}

