'use client';

// UNA pantalla para los tres casos, porque los tres SON el mismo reloj.
//
// No hay un componente por escenario: hay un motor (`data.ts`) y una vista que
// lo pinta. Si mañana entra un EMOM mixto (un minuto de bici, otro de burpees)
// no hay que tocar nada aquí: `quienCuenta` ya decide, minuto a minuto, si el
// contador sube solo, si se toca, o si no hay nada que contar.
//
// Lo que gobierna es EL MINUTO, siempre. El contador del monitor no adelanta la
// ronda, el toque de «hecho» no adelanta la ronda, y no hay botón para
// adelantarla: la adelanta el reloj. Cumplir la tarea cambia una sola cosa, la
// que importa cuando estás reventado: cuánto de ese minuto pasa a ser tuyo.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Label, Mono, Pantalla, RAD, SP } from '../../kit';
import { hrZone, useTicker } from '../../sim';
import { reloj } from '../../datos-reales';
import {
  AVISO_CORTE_S,
  COLOR_AMBIENTE,
  UMBRAL_PPM,
  alterna,
  ambiente,
  ciclo,
  contadorMaquina,
  duracionTotal,
  frase,
  instante,
  lineaFormato,
  pulsoPpm,
  quienCuenta,
  tareaDe,
  type Guion,
  type Instante,
  type QuienCuenta,
  type Tarea,
} from './data';
import {
  Anuncio,
  BotonHecho,
  Chip,
  Chrome,
  Drenaje,
  EstilosEmom,
  Flash,
  Franja,
  Hero,
  ROTULO,
  SelloHecho,
  TareaGrande,
  Traza,
  puntoDe,
} from './atoms';

export function EmomVivo({ guion, onLog }: { guion: Guion; onLog: (linea: string) => void }) {
  // El reloj: `base` acumula lo corrido antes de la última pausa y `tramo` es lo
  // que lleva el tramo actual. Sin esto, reanudar reiniciaría el cronómetro
  // (useTicker vuelve a poner su origen en cada arranque).
  const [base, setBase] = useState(0);
  const [tramo, setTramo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [sellos, setSellos] = useState<Record<number, number>>({ ...(guion.sellosPrevios ?? {}) });
  const rondaPrevia = useRef<number | null>(null);
  const sellosRef = useRef(sellos);

  const tAbs = guion.arranque.ronda * ciclo(guion) + guion.arranque.segundo + base + tramo;
  const inst = instante(guion, tAbs);
  useTicker(!pausado && !inst.terminado, setTramo);

  const tarea = tareaDe(guion, inst.ronda);
  const quien = quienCuenta(tarea, guion.conexiones);
  const cruceS = guion.cruces?.[inst.ronda];
  const puedeSellar = quien === 'nadie';

  const hecha =
    quien === 'maquina' && cruceS !== undefined
      ? inst.transcurrido >= cruceS
      : puedeSellar
        ? sellos[inst.ronda] !== undefined
        : false;

  const amb = ambiente(guion, inst, hecha);
  const color = COLOR_AMBIENTE[amb];

  // Lo que viene: SOLO cuando de verdad viene otra cosa. En un EMOM uniforme un
  // «luego: burpees» sería la misma información dos veces (la misma regla que
  // `nextMovement` en el HUD real de la app).
  const siguiente = alterna(guion) ? tareaDe(guion, inst.ronda + 1) : null;
  const anuncia = siguiente !== null && siguiente.nombre !== tarea?.nombre;

  // -------------------------------------------------------------------------
  // Cronología — una línea por suceso, y ni una por segundo
  // -------------------------------------------------------------------------

  useEffect(() => {
    sellosRef.current = sellos;
  });

  useEffect(() => {
    const previa = rondaPrevia.current;
    rondaPrevia.current = inst.ronda;
    if (
      previa !== null &&
      quienCuenta(tareaDe(guion, previa), guion.conexiones) === 'nadie' &&
      sellosRef.current[previa] === undefined
    ) {
      onLog(`Ronda ${previa + 1} cerrada sin marcar. No se inventa nada`);
    }
    const t = tareaDe(guion, inst.ronda);
    onLog(`Ronda ${inst.ronda + 1} de ${guion.rondas}${t ? ` · ${frase(t)}` : ''}`);
  }, [inst.ronda, guion, onLog]);

  useEffect(() => {
    if (guion.cambioS === 0) return;
    onLog(inst.fase === 'cambio' ? `Cambio · ${guion.cambioS} s` : `Trabajo · ${guion.trabajoS} s`);
  }, [inst.fase, guion, onLog]);

  useEffect(() => {
    if (!hecha || quien !== 'maquina' || cruceS === undefined) return;
    onLog(`Objetivo cumplido a los ${reloj(cruceS)}. El resto del minuto es tuyo`);
  }, [hecha, quien, cruceS, onLog]);

  useEffect(() => {
    if (amb !== 'aviso') return;
    if (anuncia && siguiente) onLog(`Ahora toca: ${frase(siguiente)}`);
    else if (guion.cambioS > 0) onLog('Para. Empieza el cambio');
  }, [amb, anuncia, siguiente, guion, onLog]);

  useEffect(() => {
    if (inst.terminado) onLog(`EMOM hecho · ${guion.rondas} rondas`);
  }, [inst.terminado, guion, onLog]);

  // -------------------------------------------------------------------------

  const alternarPausa = () => {
    setBase((b) => b + tramo);
    setTramo(0);
    setPausado((p) => !p);
    onLog(pausado ? 'Reanudado' : 'En pausa');
  };

  const sellar = () => {
    const seg = inst.transcurrido;
    setSellos((s) => ({ ...s, [inst.ronda]: seg }));
    onLog(`Ronda ${inst.ronda + 1} sellada a los ${reloj(seg)}`);
  };

  const selladas = Object.keys(sellos).length;
  const accion: ReactNode = puedeSellar
    ? hecha
      ? <SelloHecho texto={`Hecho en ${reloj(sellos[inst.ronda])}`} />
      : <BotonHecho onClick={sellar} />
    : undefined;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <EstilosEmom />
      <Drenaje
        fraccion={inst.duracionFase > 0 ? inst.restante / inst.duracionFase : 0}
        color={color}
        claveFase={`${inst.ronda}-${inst.fase}`}
      />
      {!inst.terminado && <Flash clave={`${inst.ronda}-${inst.fase}`} color={color} />}

      <Pantalla accion={inst.terminado ? undefined : accion}>
        <Chrome
          formato={lineaFormato(guion, reloj)}
          pausado={pausado}
          onPausa={alternarPausa}
          onSalir={() => onLog('Salir → volvería al detalle de la sesión')}
        />

        <ContextoFranja guion={guion} inst={inst} quien={quien} hecha={hecha} cruceS={cruceS} />

        {inst.terminado ? (
          <Final guion={guion} />
        ) : amb === 'cambio' ? (
          <ZonaCambio inst={inst} siguiente={tareaDe(guion, inst.ronda + 1)} />
        ) : (
          <ZonaTrabajo
            guion={guion}
            inst={inst}
            tarea={tarea}
            quien={quien}
            hecha={hecha}
            cruceS={cruceS}
            color={color}
            avisando={amb === 'aviso'}
            rotulo={amb === 'aviso' && guion.cambioS > 0 ? 'Para en' : ROTULO[amb]}
            anuncio={amb === 'aviso' && anuncia ? siguiente : null}
            pausado={pausado}
          />
        )}

        <Traza
          total={guion.rondas}
          // Acabado: ninguna ronda es «la de ahora», todas quedan detrás. Sin
          // esto la última se quedaba marcada en naranja como si siguiera viva.
          actual={inst.terminado ? guion.rondas : inst.ronda}
          sellos={puedeSellar ? sellos : undefined}
          pie={
            puedeSellar
              ? `Ronda ${inst.ronda + 1} de ${guion.rondas} · ${selladas} selladas`
              : `Ronda ${inst.ronda + 1} de ${guion.rondas}`
          }
        />
      </Pantalla>

      {pausado && <VeloPausa />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La franja: solo lo que se puede declarar de verdad (§7)
// ---------------------------------------------------------------------------

function ContextoFranja({
  guion,
  inst,
  quien,
  hecha,
  cruceS,
}: {
  guion: Guion;
  inst: Instante;
  quien: QuienCuenta;
  hecha: boolean;
  cruceS: number | undefined;
}) {
  const tarea = tareaDe(guion, inst.ronda);
  const chips: ReactNode[] = [];

  // El monitor se nombra por la máquina de ESTE minuto: es la que está leyendo.
  if (quien === 'maquina' && tarea) {
    chips.push(
      <Chip
        key="monitor"
        texto={`monitor · ${tarea.nombre}`}
        color="var(--twin-accent-text)"
        punto={puntoDe(tarea)}
      />
    );
  }

  // El pulso solo existe si hay reloj en la muñeca. Sin reloj no se pinta: ni
  // con un guion, ni con un cero.
  if (guion.conexiones.reloj && cruceS !== undefined) {
    const ppm = pulsoPpm(inst.transcurrido, hecha, cruceS);
    const z = hrZone(ppm, UMBRAL_PPM);
    chips.push(<Chip key="fc" texto={`${ppm} ppm · Z${z}`} color={`var(--twin-z${z})`} />);
  }

  if (chips.length === 0 && !guion.nota) return null;

  return (
    <Franja>
      {chips}
      {guion.nota && (
        <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{guion.nota}</span>
      )}
    </Franja>
  );
}

// ---------------------------------------------------------------------------
// El trabajo: el minuto manda y la tarea se subordina
// ---------------------------------------------------------------------------

function ZonaTrabajo({
  guion,
  inst,
  tarea,
  quien,
  hecha,
  cruceS,
  color,
  avisando,
  rotulo,
  anuncio,
  pausado,
}: {
  guion: Guion;
  inst: Instante;
  tarea: Tarea | null;
  quien: QuienCuenta;
  hecha: boolean;
  cruceS: number | undefined;
  color: string;
  avisando: boolean;
  rotulo: string;
  anuncio: Tarea | null;
  pausado: boolean;
}) {
  const contador =
    quien === 'maquina' && tarea && cruceS !== undefined
      ? contadorMaquina(tarea, inst.transcurrido, cruceS)
      : null;

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.l, textAlign: 'center' }}>
        <Hero
          texto={reloj(inst.restante)}
          color={color}
          rotulo={rotulo}
          late={avisando && !pausado}
          etiquetaVoz={`Ronda ${inst.ronda + 1} de ${guion.rondas}, quedan ${inst.restante} segundos`}
        />

        {tarea ? (
          <TareaGrande tarea={tarea} contador={contador} hecha={hecha} atenuada={hecha && anuncio !== null} />
        ) : (
          // Un cronómetro pelado no pinta una ronda fantasma de guiones
          // (DECISIONS, 27-jul). Lo que sí se dice es que se puede declarar
          // después, porque eso el atleta SÍ puede llenarlo con un acto.
          <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 260 }}>
            Sin movimientos declarados. Los dices al acabar, con calma.
          </span>
        )}

        {anuncio && <Anuncio rotulo="Ahora toca" texto={frase(anuncio)} punto={puntoDe(anuncio)} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El cambio: el opuesto visual del trabajo, no un matiz suyo
// ---------------------------------------------------------------------------

function ZonaCambio({ inst, siguiente }: { inst: Instante; siguiente: Tarea | null }) {
  const apura = inst.restante <= AVISO_CORTE_S;
  // Relleno pleno del token + glifo del fondo: la misma receta que la CTA de la
  // app, y pasa AA en los dos temas (9,1:1 en oscuro · 5,4:1 en claro).
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: RAD.l,
        background: 'var(--twin-ok)',
        color: 'var(--twin-bg)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m, textAlign: 'center' }}>
        <Hero
          texto={reloj(inst.restante)}
          color="var(--twin-bg)"
          rotulo={apura ? 'Empieza en' : 'Cambio'}
          late={apura}
          etiquetaVoz={`Cambio, quedan ${inst.restante} segundos`}
        />
        {siguiente && (
          <span style={{ font: 'italic 800 20px/1.15 var(--twin-font-sans)', color: 'var(--twin-bg)' }}>
            {frase(siguiente)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El final y la pausa
// ---------------------------------------------------------------------------

function Final({ guion }: { guion: Guion }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s, textAlign: 'center' }}>
        <Label size={11} color="var(--twin-ok)" style={{ letterSpacing: '0.22em' }}>
          Hecho
        </Label>
        <span style={{ font: 'italic 800 40px/1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {guion.rondas} rondas
        </span>
        <Mono size={14} color="var(--twin-muted)">
          {reloj(duracionTotal(guion))} de reloj
        </Mono>
        {guion.rotacion.length > 0 && (
          <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {guion.rotacion.map(frase).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

function VeloPausa() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--twin-scrim)',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{ font: 'italic 800 34px/1 var(--twin-font-sans)', color: 'var(--twin-fg)', letterSpacing: '0.06em' }}
      >
        EN PAUSA
      </span>
    </div>
  );
}
