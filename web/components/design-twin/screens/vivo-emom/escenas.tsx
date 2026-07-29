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
//
// EL LENGUAJE (§10). Tres cosas cambiaron de sitio en este lote:
//
//   1. El lienzo lo tiñe la ZONA DE PULSO, no la fase del minuto. Sin reloj en
//      la muñeca no hay tinte y el lienzo queda neutro — y esa pantalla no es
//      la versión rota de la buena: es la misma diciendo la verdad (§7).
//   2. El cambio ya no mete el sujeto en una tarjeta verde maciza mientras el
//      trabajo lo deja sobre el lienzo. Misma piel en los dos estados; lo que
//      anuncia el cambio es el fogonazo, que para eso está en el kit.
//   3. El trabajo («11 de 12 cal») sale del panel gris y entra EN LA BANDA,
//      pegado al minuto que lo gobierna y en el segundo peldaño del numeral.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ambiente, EtiquetaSujeto, Fogonazo, FranjaAccion, MarcoVivo, Numeral, zonaDe, type Zona } from '../../kit-vivo';
import type { TwinAppearance } from '../../types';
import { useTicker } from '../../sim';
import { reloj } from '../../datos-reales';
import {
  AVISO_CORTE_S,
  ciclo,
  duracionTotal,
  estadoMinuto,
  frase,
  lineaFormato,
  pulsoPpm,
  quienCuenta,
  tareaDe,
  type Ambiente as AmbienteMinuto,
  type Guion,
  type Instante,
  type QuienCuenta,
  type Tarea,
} from './data';
import { CaraHorizontal } from './horizontal';
import {
  Anuncio,
  Chip,
  Chrome,
  Drenaje,
  EstilosEmom,
  Franja,
  Hero,
  ROTULO,
  SelloHecho,
  TrabajoMinuto,
  Traza,
  puntoDe,
} from './atoms';

export function EmomVivo({
  guion,
  landscape,
  appearance,
  onLog,
}: {
  guion: Guion;
  landscape: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
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
  // UN estado para las dos caras. Girar el móvil no vuelve a derivar nada: es
  // el mismo minuto mirado desde otro sitio, y por eso no puede pasar que una
  // cara dé la tarea por cumplida y la otra no.
  const estado = estadoMinuto(guion, tAbs, sellos);
  const { inst, tarea, quien, cruceS, contador, hecha, amb, color, siguiente, anuncia, puedeSellar } = estado;
  useTicker(!pausado && !inst.terminado, setTramo);

  // El pulso, derivado UNA vez: es lo que tiñe el lienzo (§10.1) y lo que se lee
  // en la franja. Sin reloj en la muñeca es nulo, y entonces no hay zona, no hay
  // tinte y no hay chip — ni con un guion, ni con un cero (§7).
  const ppm = guion.conexiones.reloj && cruceS !== undefined ? pulsoPpm(inst.transcurrido, hecha, cruceS) : null;
  const zona = zonaDe(ppm);

  // El instante en que algo se logra: cruzas el objetivo y el ambiente se va al
  // acento un segundo. Es el único naranja que puede bañar el lienzo, y por eso
  // es un INSTANTE y no un estado sostenido (§10.1).
  const cruceReciente = hecha && quien === 'maquina' && cruceS !== undefined && inst.transcurrido - cruceS <= 1;
  // El fogonazo del arranque de fase: nace encendido y se apaga solo. Sustituye
  // al `Flash` que esta carpeta se había escrito por su cuenta.
  const arranqueDeFase = !inst.terminado && inst.transcurrido <= 0;

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

  const salir = () => onLog('Salir → volvería al detalle de la sesión');
  const selladas = Object.keys(sellos).length;
  const accion: ReactNode = puedeSellar ? (
    hecha ? (
      <SelloHecho texto={`Hecho en ${reloj(sellos[inst.ronda])}`} />
    ) : (
      // En un EMOM gobierna el RELOJ, no tu dedo: el toque solo sella TU tiempo
      // de este minuto, y si no lo das la ronda pasa igual. Por eso NO es la
      // única salida y la franja va en contorno (§10.5). Antes gritaba a
      // `italic 800 26px` sobre 88 pt de naranja macizo.
      <FranjaAccion titulo="Hecho" nota="sella tu tiempo de este minuto" onClick={sellar} />
    )
  ) : undefined;

  const ambiente = (
    <>
      <Ambiente zona={zona} appearance={appearance} acento={cruceReciente} />
      <Fogonazo activo={arranqueDeFase} tono={inst.fase === 'cambio' ? 'var(--twin-ok)' : 'var(--twin-neutral)'} />
    </>
  );

  // Girar es OTRA CARA del mismo minuto, no otra pantalla: el estado vive aquí
  // arriba, así que el reloj no se entera de que el móvil se ha movido.
  if (landscape && !inst.terminado) {
    return (
      <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
        <EstilosEmom />
        {ambiente}
        <CaraHorizontal
          guion={guion}
          estado={estado}
          sellos={sellos}
          ppm={ppm}
          zona={zona}
          pausado={pausado}
          onPausa={alternarPausa}
          onSalir={salir}
          onSellar={sellar}
        />
        {pausado && <VeloPausa />}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <EstilosEmom />
      {/* La columna del minuto va DEBAJO del ambiente: es geometría de tiempo,
          no el color del lienzo. */}
      <Drenaje
        fraccion={inst.duracionFase > 0 ? inst.restante / inst.duracionFase : 0}
        claveFase={`${inst.ronda}-${inst.fase}`}
      />
      {ambiente}

      <MarcoVivo
        cromo={
          <Chrome formato={lineaFormato(guion, reloj)} pausado={pausado} onPausa={alternarPausa} onSalir={salir} />
        }
        contexto={<ContextoFranja guion={guion} ppm={ppm} zona={zona} tarea={tarea} quien={quien} />}
        sujeto={
          inst.terminado ? (
            <Final guion={guion} />
          ) : (
            <Minuto
              guion={guion}
              inst={inst}
              tarea={tarea}
              contador={contador}
              hecha={hecha}
              color={color}
              enCambio={amb === 'cambio'}
              avisando={amb === 'aviso'}
              rotulo={rotuloDe(guion, inst, amb)}
              anuncio={amb === 'aviso' && anuncia ? siguiente : null}
              siguiente={siguiente}
              pausado={pausado}
            />
          )
        }
        apoyos={
          <>
            {/* El anuncio de lo que viene vive en los APOYOS y no dentro de la
                banda: metido con el sujeto, aparecer y desaparecer cada 10 s le
                movía el numeral 30 pt arriba y abajo — justo el baile que el
                §10.3 viene a quitar. Aquí además gana el hueco de la fila. */}
            {!inst.terminado && amb === 'aviso' && anuncia && siguiente && (
              <Anuncio rotulo="Ahora toca" texto={frase(siguiente)} punto={puntoDe(siguiente)} />
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
          </>
        }
        accion={inst.terminado ? undefined : accion}
      />

      {pausado && <VeloPausa />}
    </div>
  );
}

/** El rótulo del minuto. En cambio dice qué empieza; en trabajo, qué queda. */
export function rotuloDe(guion: Guion, inst: Instante, amb: AmbienteMinuto): string {
  if (inst.fase === 'cambio') return inst.restante <= AVISO_CORTE_S ? 'Empieza en' : 'Cambio';
  if (amb === 'aviso' && guion.cambioS > 0) return 'Para en';
  return ROTULO[amb];
}

// ---------------------------------------------------------------------------
// La franja: solo lo que se puede declarar de verdad (§7)
// ---------------------------------------------------------------------------

function ContextoFranja({
  guion,
  ppm,
  zona,
  tarea,
  quien,
}: {
  guion: Guion;
  /** El pulso ya derivado arriba: aquí no se vuelve a calcular. */
  ppm: number | null;
  zona: Zona | null;
  tarea: Tarea | null;
  quien: QuienCuenta;
}) {
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
  // con un guion, ni con un cero — y entonces el lienzo tampoco se tiñe.
  if (ppm !== null && zona !== null) {
    chips.push(<Chip key="fc" texto={`${ppm} ppm · Z${zona}`} color={`var(--twin-z${zona})`} />);
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
// El sujeto: el minuto manda y el trabajo se le pega debajo
// ---------------------------------------------------------------------------

/**
 * Trabajo y cambio comparten piel — el sujeto NO cambia de superficie dentro de
 * la misma pantalla (§10.4). Antes el cambio inundaba una tarjeta verde maciza
 * mientras el trabajo dejaba el número sobre el lienzo, y el atleta reencuadraba
 * cada 45 segundos. Lo que cambia ahora es lo que DICE: el rótulo, el color de
 * ese rótulo, el fogonazo del arranque y el latido de los últimos segundos.
 */
function Minuto({
  guion,
  inst,
  tarea,
  contador,
  hecha,
  color,
  enCambio,
  avisando,
  rotulo,
  anuncio,
  siguiente,
  pausado,
}: {
  guion: Guion;
  inst: Instante;
  tarea: Tarea | null;
  /** Lo que marca el monitor ahora. Nulo = no hay quien cuente. */
  contador: number | null;
  hecha: boolean;
  color: string;
  enCambio: boolean;
  avisando: boolean;
  rotulo: string;
  anuncio: Tarea | null;
  siguiente: Tarea | null;
  pausado: boolean;
}) {
  const apura = inst.restante <= AVISO_CORTE_S;
  return (
    <>
      <Hero
        texto={reloj(inst.restante)}
        tono={color}
        rotulo={rotulo}
        late={(avisando || (enCambio && apura)) && !pausado}
        etiquetaVoz={`Ronda ${inst.ronda + 1} de ${guion.rondas}, quedan ${inst.restante} segundos`}
      />

      {enCambio ? (
        // Durante el cambio lo que de verdad haces es ir hacia el sitio: lo
        // segundo más importante es lo que te espera al llegar.
        siguiente && (
          <Numeral escala="segundo" tono="var(--twin-ok)">
            {frase(siguiente)}
          </Numeral>
        )
      ) : tarea ? (
        <TrabajoMinuto tarea={tarea} contador={contador} hecha={hecha} atenuada={hecha && anuncio !== null} />
      ) : (
        // Un cronómetro pelado no pinta una ronda fantasma de guiones
        // (DECISIONS, 27-jul). Lo que sí se dice es que se puede declarar
        // después, porque eso el atleta SÍ puede llenarlo con un acto.
        <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 260 }}>
          Sin movimientos declarados. Los dices al acabar, con calma.
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// El final y la pausa
// ---------------------------------------------------------------------------

function Final({ guion }: { guion: Guion }) {
  return (
    <>
      <EtiquetaSujeto tono="var(--twin-ok)">Hecho</EtiquetaSujeto>
      <Numeral unidad="rondas">{guion.rondas}</Numeral>
      <Numeral escala="segundo" tono="var(--twin-muted)" unidad="de reloj">
        {reloj(duracionTotal(guion))}
      </Numeral>
      {guion.rotacion.length > 0 && (
        <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {guion.rotacion.map(frase).join(' · ')}
        </span>
      )}
    </>
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
