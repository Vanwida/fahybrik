'use client';

// La cara horizontal — EL TRAMO DECIDE LA CARA; EL FORMATO NUNCA SUELTA LA
// FRANJA.
//
// Girar el móvil no cambia de pantalla ni reinicia nada: es el MISMO minuto
// visto desde donde estás. Y lo que decide qué se pone delante no es el
// escenario, es `quienCuenta` — la misma función que ya gobierna el retrato
// (DECISIONS, 28-jul: «el tramo decide qué superficie de dispositivo se pone
// delante, qué reloj corre y qué se pinta»).
//
//   la cuenta LA MÁQUINA → cara de monitor: sus cifras, grandes, porque estás
//                          sentado en el aparato mirándolas.
//   no la cuenta nadie   → el HUD del formato tumbado. JAMÁS una rejilla de
//                          monitor con celdas que nadie está midiendo.
//
// Lo que no se negocia en ninguna de las dos: la franja del formato. El minuto
// sigue drenando arriba, y los avisos (cumplida, «ahora toca», cambio de
// minuto) se pintan POR ENCIMA de la cara del monitor. En un EMOM el reloj
// manda aunque estés mirando los vatios.

import type { ReactNode } from 'react';
import { Label, Mono, RAD, SP } from '../../kit';
import { hrZone } from '../../sim';
import { reloj } from '../../datos-reales';
import {
  AVISO_CORTE_S,
  UMBRAL_PPM,
  dosis,
  etiquetaCadencia,
  frase,
  lineaFormato,
  pulsoPpm,
  type EstadoMinuto,
  type Guion,
} from './data';
import { Anuncio, BotonHecho, Chrome, Hero, ROTULO, SelloHecho, Traza, puntoDe } from './atoms';

// ---------------------------------------------------------------------------
// Piezas que solo existen aquí. Viven en este fichero y no en `atoms.tsx`
// porque las usa una sola cara: el §0 manda subir al sitio compartido lo que
// DOS sitios necesitan, no todo lo que se escribe.
// ---------------------------------------------------------------------------

/**
 * La barra del minuto de la franja horizontal. Es el MISMO drenaje que baña el
 * retrato, tumbado: girar el móvil no cambia lo que el minuto está haciendo,
 * solo dónde se lee.
 */
function BarraMinuto({ fraccion, color, claveFase }: { fraccion: number; color: string; claveFase: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 60,
        height: 8,
        borderRadius: 4,
        background: 'var(--twin-surface-sunken)',
        overflow: 'hidden',
      }}
    >
      <div
        key={claveFase}
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(1, fraccion)) * 100}%`,
          background: color,
          transition: 'width 1000ms linear, background-color 260ms ease-out',
        }}
      />
    </div>
  );
}

/** Celda del raíl del monitor: la cifra pesa, la etiqueta acompaña (§4). */
function Tile({ valor, etiqueta, color = 'var(--twin-fg)' }: { valor: string; etiqueta: string; color?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '6px 4px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
      }}
    >
      <Mono size={30} weight={800} color={color}>
        {valor}
      </Mono>
      <span
        style={{
          font: '600 10px/1 var(--twin-font-mono)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {etiqueta}
      </span>
    </div>
  );
}

/**
 * El contador del monitor como sujeto de la cara horizontal: la cifra viva
 * enorme y el objetivo detrás, más pequeño. Verde al cruzar.
 */
function ContadorMonitor({
  contador,
  objetivo,
  unidad,
  hecha,
}: {
  contador: number;
  objetivo: number;
  unidad: string;
  hecha: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Label size={11} color={hecha ? 'var(--twin-ok)' : 'var(--twin-muted)'} style={{ letterSpacing: '0.22em' }}>
        {unidad === 'cal' ? 'Calorías' : unidad}
      </Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--twin-font-mono)',
            fontWeight: 800,
            fontSize: 'clamp(84px, 34vh, 132px)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            color: hecha ? 'var(--twin-ok)' : 'var(--twin-fg)',
          }}
        >
          {contador}
        </span>
        <Mono size={30} weight={700} color="var(--twin-muted)">
          / {objetivo} {unidad}
        </Mono>
      </div>
    </div>
  );
}

export interface CaraProps {
  guion: Guion;
  estado: EstadoMinuto;
  sellos: Record<number, number>;
  pausado: boolean;
  onPausa: () => void;
  onSalir: () => void;
  onSellar: () => void;
}

export function CaraHorizontal(props: CaraProps) {
  // La regla, no el escenario: si hay una máquina midiendo, delante va su cara.
  return props.estado.quien === 'maquina' ? <CaraMonitor {...props} /> : <CaraFormato {...props} />;
}

// ---------------------------------------------------------------------------
// La franja del formato — fina, fija, y en las dos caras
// ---------------------------------------------------------------------------

/**
 * La franja NO dice lo mismo en las dos caras, y esa es justo la regla: dice lo
 * que la cara de debajo NO está diciendo.
 *
 * - Sobre la cara del monitor, la franja ES el reloj: los segundos y qué
 *   máquina toca, porque abajo solo hay calorías y vatios.
 * - Sobre la cara del formato, el reloj ya es el número gigante y la tarea ya
 *   está en su columna. Repetirlos sería poner el mismo dato dos veces en una
 *   pantalla de 402 pt de alto, así que la franja se queda con lo que falta: la
 *   cadencia del formato y la ronda.
 *
 * Lo que NO cambia nunca es la barra del minuto. El formato no suelta la franja.
 */
function FranjaFormato({
  guion,
  estado,
  cara,
  pausado,
  onPausa,
  onSalir,
}: Pick<CaraProps, 'guion' | 'estado' | 'pausado' | 'onPausa' | 'onSalir'> & {
  cara: 'monitor' | 'formato';
}) {
  const { inst, color, amb, tarea } = estado;
  const rotulo = amb === 'aviso' && guion.cambioS > 0 ? 'Para en' : ROTULO[amb];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        flex: '0 0 auto',
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: RAD.m,
        // La franja se tiñe del ambiente: el minuto sigue siendo el ambiente
        // aunque el sujeto de la cara sea el monitor.
        background: `color-mix(in srgb, ${color} 14%, var(--twin-surface))`,
        transition: 'background-color 260ms ease-out',
      }}
    >
      <Chrome formato="" pausado={pausado} onPausa={onPausa} onSalir={onSalir} compacto />

      {cara === 'monitor' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <Label size={9} color={color} style={{ letterSpacing: '0.2em' }}>
            {rotulo}
          </Label>
          <Mono size={40} weight={800} color={color} style={{ lineHeight: 1 }}>
            {reloj(inst.restante)}
          </Mono>
        </div>
      ) : (
        <Mono size={11} color="var(--twin-muted)">
          {lineaFormato(guion, reloj).toUpperCase()}
        </Mono>
      )}

      <BarraMinuto
        fraccion={inst.duracionFase > 0 ? inst.restante / inst.duracionFase : 0}
        color={color}
        claveFase={`${inst.ronda}-${inst.fase}`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <Mono size={11} color="var(--twin-muted)">
          RONDA {inst.ronda + 1} DE {guion.rondas}
        </Mono>
        {/* Solo el NOMBRE de la máquina: la dosis ya vive en el denominador del
            contador de abajo, y escribir «12 cal» dos veces no la hace más
            cierta. */}
        {cara === 'monitor' && tarea && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: '50%', background: puntoDe(tarea), flex: '0 0 auto' }}
            />
            <span style={{ font: 'italic 800 15px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {tarea.nombre}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** El envoltorio común: franja arriba, cara debajo, avisos por encima. */
function Marco({
  props,
  cara,
  children,
  aviso,
}: {
  props: CaraProps;
  cara: 'monitor' | 'formato';
  children: ReactNode;
  /** Se pinta ENCIMA de la cara, no en lugar de ella. */
  aviso?: ReactNode;
}) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: SP.s,
        padding: SP.m,
        boxSizing: 'border-box',
      }}
    >
      <FranjaFormato {...props} cara={cara} />
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        {children}
        {aviso && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {aviso}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cara de monitor — estás sentado en la máquina, así que manda lo que marca
// ---------------------------------------------------------------------------

function CaraMonitor(props: CaraProps) {
  const { estado, guion } = props;
  const { tarea, contador, hecha, vatios, cruceS, inst, amb, anuncia, siguiente } = estado;
  if (!tarea || contador === null) return <CaraFormato {...props} />;

  const ppm = cruceS !== undefined && guion.conexiones.reloj ? pulsoPpm(inst.transcurrido, hecha, cruceS) : null;
  const z = ppm === null ? null : hrZone(ppm, UMBRAL_PPM);
  // Al cruzar dejas de darle: el monitor lee cero de potencia y cero de
  // cadencia. Es un dato de un aparato conectado, no un hueco (§6.2 bis).
  const cadencia = hecha ? 0 : (tarea.cadencia ?? null);

  return (
    <Marco
      props={props}
      cara="monitor"
      aviso={
        amb === 'aviso' && anuncia && siguiente ? (
          <Anuncio rotulo="Ahora toca" texto={frase(siguiente)} punto={puntoDe(siguiente)} />
        ) : undefined
      }
    >
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', placeItems: 'center' }}>
        <ContadorMonitor contador={contador} objetivo={tarea.cantidad} unidad={tarea.unidad} hecha={hecha} />
      </div>
      <div style={{ width: 196, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: SP.s }}>
        {/* Un valor que el monitor no está dando no se pinta con un cero: se
            pinta con nada. El cero es lo que marca cuando SÍ está midiendo y
            tú has parado, y son cosas distintas (§7). */}
        <Tile valor={vatios !== undefined ? `${vatios}` : '·'} etiqueta="vatios" />
        <Tile valor={cadencia !== null ? `${cadencia}` : '·'} etiqueta={etiquetaCadencia(tarea.modalidad)} />
        <Tile
          valor={ppm !== null ? `${ppm}` : '·'}
          etiqueta={z !== null ? `ppm · z${z}` : 'ppm'}
          color={z !== null ? `var(--twin-z${z})` : undefined}
        />
      </div>
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// Cara de formato — nadie mide, así que manda el reloj, tumbado
// ---------------------------------------------------------------------------

function CaraFormato(props: CaraProps) {
  const { guion, estado, sellos, onSellar } = props;
  const { inst, tarea, color, amb, hecha, puedeSellar, anuncia, siguiente } = estado;
  const enCambio = amb === 'cambio';
  const apura = inst.restante <= AVISO_CORTE_S;
  const rotulo = enCambio ? (apura ? 'Empieza en' : 'Cambio') : amb === 'aviso' && guion.cambioS > 0 ? 'Para en' : ROTULO[amb];

  const minuto = (
    <div
      style={{
        flex: tarea ? '1 1 0' : '1 1 auto',
        minWidth: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: RAD.l,
        // El cambio inunda su columna: el opuesto visual del trabajo, con el
        // glifo del fondo (pasa AA en los dos temas, igual que en retrato).
        background: enCambio ? 'var(--twin-ok)' : 'transparent',
        color: enCambio ? 'var(--twin-bg)' : undefined,
        transition: 'background-color 200ms ease-out',
      }}
    >
      <Hero
        texto={reloj(inst.restante)}
        color={enCambio ? 'var(--twin-bg)' : color}
        rotulo={rotulo}
        late={(amb === 'aviso' || (enCambio && apura)) && !props.pausado}
        etiquetaVoz={`Ronda ${inst.ronda + 1} de ${guion.rondas}, quedan ${inst.restante} segundos`}
      />
    </div>
  );

  // Cronómetro pelado: no hay segunda columna que llenar, así que el número se
  // queda con TODO el ancho y las rondas se apilan debajo, en flujo normal. En
  // flujo y no flotando encima, porque si no el relleno del cambio les pasaba
  // por encima y los puntos quedaban ilegibles sobre el verde.
  if (!tarea) {
    return (
      <Marco props={props} cara="formato">
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
          {minuto}
          {/* Durante el cambio no se dice: estás andando hacia el sitio. */}
          {!enCambio && (
            <span
              style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}
            >
              Sin movimientos declarados. Los dices al acabar, con calma.
            </span>
          )}
          <Traza total={guion.rondas} actual={inst.ronda} />
        </div>
      </Marco>
    );
  }

  return (
    <Marco
      props={props}
      cara="formato"
      aviso={
        amb === 'aviso' && anuncia && siguiente ? (
          <Anuncio rotulo="Ahora toca" texto={frase(siguiente)} punto={puntoDe(siguiente)} />
        ) : undefined
      }
    >
      {minuto}
      <div
        style={{
          width: 300,
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: SP.m,
        }}
      >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: '50%', background: puntoDe(tarea), flex: '0 0 auto' }}
            />
            <span
              style={{
                font: 'italic 800 24px/1.1 var(--twin-font-sans)',
                textTransform: 'uppercase',
                color: 'var(--twin-fg)',
              }}
            >
              {tarea.nombre}
            </span>
          </div>
          <Mono size={30} weight={800}>
            {dosis(tarea)}
          </Mono>
        </div>
        {puedeSellar &&
          (hecha ? <SelloHecho texto={`Hecho en ${reloj(sellos[inst.ronda])}`} /> : <BotonHecho onClick={onSellar} />)}
        <Traza total={guion.rondas} actual={inst.ronda} sellos={puedeSellar ? sellos : undefined} />
      </div>
    </Marco>
  );
}
