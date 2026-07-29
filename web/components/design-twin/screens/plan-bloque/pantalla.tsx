'use client';

// La composición: la PORTADA DIARIA del plan — dónde estás hoy dentro del
// bloque, y qué toca.
//
// De arriba abajo hay una sola idea contada dos veces a dos distancias: la
// SEMANA (el carril de siete días) y HOY (la sesión, en grande). El hilo naranja
// que baja del día de hoy hasta la tarjeta dice que son la misma cosa vista de
// lejos y de cerca. La tercera distancia —hacia dónde va el bloque— NO se pinta
// aquí: vive en `plan-ciclo`, y desde abajo se entra.
//
// Aquí había una rampa de volumen previsto por semana. Se retiró el 29-jul: sus
// números no existían en producción y afirmaban cuánto iba a entrenar el atleta
// dentro de tres semanas. Lo planificado se pinta con seguridad; lo medido del
// futuro no existe (CONTRATO-UI §7).
//
// Altura (§6.1), `llena`: el cromo de arriba y la acción de abajo son fijos, y
// el sobrante se lo lleva el héroe, que es el sujeto de la pantalla. Cuando la
// sesión no trae cifras que estirar, el pie del bloque absorbe lo que sobre en
// vez de dejar un hueco muerto. Ninguna cola debajo de nada.
//
// En el día de descanso el héroe degrada a `centra`: no hay contenido que
// estirar, hay un hueco que explicar y del que salir.

import { useState } from 'react';
import type { Modalidad } from '../../datos-reales';
import { CTA, Card, Display, Hairline, Label, SP } from '../../kit';
import { useTimeline } from '../../sim';
import { CarrilSemana, DatoClave, entradaStyle, ParteSesion, Pastilla, PuntoModalidad, TarjetaDia } from './atoms';
import type { DiaPlan, DuracionPrevista, EstadoDia, SemanaPlan, SesionDelDia } from './data';
import { estadoDia, planDeEscenario, sesionAnterior, sesionSiguiente } from './data';
import { durationUnknownEs } from '@fahybrid/shared/domain/prescription';

/**
 * Lo que se lee donde iba la duración. O los minutos que el plan deja escritos,
 * con su «unos», o la razón por la que no hay ninguno — nunca un hueco, nunca un
 * guion (CONTRATO-UI §5: todo estado vacío lleva salida o dice por qué no la hay).
 */
function textoDuracion(d: DuracionPrevista): string {
  return 'minutos' in d ? `unos ${d.minutos} min` : durationUnknownEs(d.razon);
}

/** «3 sesiones hechas» / «1 sesión hecha» — el plural, una sola vez. */
function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Partes de la sesión que caben en el héroe sin desalojar a la dosis. */
const MAX_PARTES = 4;

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const [entrada, setEntrada] = useState(false);
  const [sellos, setSellos] = useState(false);

  const { bloque, semanaActual, semana } = planDeEscenario(escenario);

  const hoy = semana.dias[semana.indiceHoy];
  const sesionHoy: SesionDelDia | null = hoy.sesiones[0] ?? null;
  const manana = sesionSiguiente(semana);

  const estados = semana.dias.map((d, i) => estadoDia(d, i, semana.indiceHoy));
  const hechas = estados.filter((e) => e === 'hecha').length;
  const saltadas = estados.filter((e) => e === 'saltada').length;

  useTimeline([
    { at: 260, run: () => setEntrada(true) },
    {
      at: 760,
      run: () => {
        setSellos(true);
        onLog(`0:00 · Semana ${semanaActual} de ${bloque.totalSemanas}, hoy es ${hoy.nombre} ${hoy.numero}`);
      },
    },
    {
      at: 1150,
      run: () => {
        const parte = saltadas > 0 ? `, ${cuenta(saltadas, 'saltada', 'saltadas')}` : '';
        onLog(`0:01 · ${cuenta(hechas, 'sesión hecha', 'sesiones hechas')} esta semana${parte}`);
      },
    },
    {
      at: 1750,
      run: () =>
        onLog(
          sesionHoy
            ? `0:02 · Hoy: ${sesionHoy.plan.ref.titulo}, ${textoDuracion(sesionHoy.plan.duracion)}`
            : `0:02 · Hoy no hay nada en el plan${manana ? `; mañana toca ${manana.sesion.plan.ref.titulo}` : ''}`,
        ),
    },
  ]);

  const accion = sesionHoy ? 'Ver la sesión' : manana ? 'Ver lo de mañana' : 'Ver el bloque';

  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '14px 16px 16px',
      }}
    >
      <Cabecera nombre={bloque.nombre} semanaActual={semanaActual} total={bloque.totalSemanas} semana={semana} visible={entrada} />

      <CarrilSemana
        semana={semana}
        visible={entrada}
        sellosVisibles={sellos}
        onDia={(d, estado) => onLog(`${d.nombre} ${d.numero} · ${resumenDia(d, estado)}`)}
      />

      {sesionHoy ? (
        <HeroeSesion dia={hoy} sesion={sesionHoy} visible={entrada} />
      ) : (
        <HeroeDescanso semana={semana} dia={hoy} visible={entrada} onAbrir={(que) => onLog(`${que} → abriría esa sesión`)} />
      )}

      <EntradaAlCiclo
        nombre={bloque.nombre}
        semanaActual={semanaActual}
        total={bloque.totalSemanas}
        visible={entrada}
        onAbrir={() => onLog('El bloque → abriría el ciclo entero')}
      />

      <div style={{ flex: '0 0 auto', ...entradaStyle(entrada, 320) }}>
        <CTA
          title={accion}
          onClick={() =>
            onLog(
              sesionHoy
                ? `${accion} → abriría ${sesionHoy.plan.ref.titulo}`
                : manana
                  ? `${accion} → abriría ${manana.sesion.plan.ref.titulo}`
                  : `${accion} → abriría el bloque entero`,
            )
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El pie — la puerta al ciclo
// ---------------------------------------------------------------------------

/**
 * Donde estaba la rampa. Dice lo ÚNICO que de verdad se sabe del bloque —cómo
 * lo llamó el coach y por qué semana vas— y ofrece la salida a `plan-ciclo`,
 * que es la pantalla que cuenta hacia dónde va el atleta con estructura
 * publicada en vez de con una curva inventada.
 *
 * NO crece (`flex: 0 0 auto`): una puerta de dos líneas no se gana alto. El
 * sobrante se lo lleva entero el héroe, que es el sujeto de la pantalla. Cuando
 * esto compartía el sobrante con la tarjeta quedaba una franja muerta de ~140 pt
 * entre las dos, que es justo lo que prohíbe el §6.2.
 */
function EntradaAlCiclo({
  nombre,
  semanaActual,
  total,
  visible,
  onAbrir,
}: {
  nombre: string;
  semanaActual: number;
  total: number;
  visible: boolean;
  onAbrir: () => void;
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        ...entradaStyle(visible, 200),
      }}
    >
      <Hairline />
      <button
        type="button"
        onClick={onAbrir}
        style={{
          appearance: 'none',
          background: 'none',
          border: 0,
          padding: '11px 0 2px',
          margin: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: SP.s,
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <Label size={10}>El bloque</Label>
          <span
            style={{
              font: '600 13px/1.25 var(--twin-font-sans)',
              color: 'var(--twin-fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nombre}
          </span>
          <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Semana {semanaActual} de {total} · ver el ciclo entero
          </span>
        </span>
        <span aria-hidden style={{ font: '500 17px/1 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
          ›
        </span>
      </button>
    </div>
  );
}

/** Lo que la app puede decir de un día al tocarlo, sin fabricar nada. */
function resumenDia(dia: DiaPlan, estado: EstadoDia): string {
  if (estado === 'descanso') return 'descanso, nada en el plan';
  const titulos = dia.sesiones.map((s) => s.plan.ref.titulo).join(', ');
  if (estado === 'hecha') {
    const medidos = dia.sesiones.reduce((n, s) => n + (s.hechaMin ?? 0), 0);
    return `${titulos}, hecha en ${medidos} min`;
  }
  if (estado === 'saltada') return `${titulos}, saltada`;
  return `${titulos}, por hacer`;
}

// ---------------------------------------------------------------------------
// Cromo superior — el bloque, la semana y lo que busca el coach con ella
// ---------------------------------------------------------------------------

function Cabecera({
  nombre,
  semanaActual,
  total,
  semana,
  visible,
}: {
  nombre: string;
  semanaActual: number;
  total: number;
  semana: SemanaPlan;
  visible: boolean;
}) {
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 9, ...entradaStyle(visible, 0) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)', flex: 1, minWidth: 0 }}>
          {nombre}
        </span>
        <Label size={10} color="var(--twin-muted)">
          Semana {semanaActual} de {total}
        </Label>
      </div>
      {/* La voz del coach, marcada con su filo. El sistema no escribe aquí. */}
      <div style={{ display: 'flex', gap: SP.m, alignItems: 'stretch' }}>
        <span aria-hidden style={{ width: 2, borderRadius: 1, background: 'var(--twin-accent)', flex: '0 0 auto' }} />
        <span
          style={{
            font: '500 13px/1.35 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            // Tres líneas de tope: si el coach se extiende, esta pantalla sigue
            // siendo la del día. El texto entero vive en la del plan.
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }}
        >
          {semana.intencion}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El héroe — la sesión de hoy
// ---------------------------------------------------------------------------

function HeroeSesion({ dia, sesion, visible }: { dia: DiaPlan; sesion: SesionDelDia; visible: boolean }) {
  const { plan } = sesion;
  const titulo = plan.ref.titulo;
  // Un título largo baja un escalón en vez de partirse en tres líneas: el
  // sujeto tiene que leerse de un vistazo desde el suelo.
  const tamano = titulo.length > 22 ? 27 : 33;
  // Las partes solo se enseñan cuando de verdad las hay: una sesión de un
  // bloque las repetiría con el título y sería relleno. Y se cuentan hasta
  // cuatro: a partir de ahí la lista empujaría la dosis fuera de la tarjeta, y
  // lo que importa aquí es cuántas partes tiene, no leerlas todas.
  const todasLasPartes = plan.ref.bloques.length > 1 ? plan.ref.bloques : [];
  const partes = todasLasPartes.slice(0, MAX_PARTES);
  const partesDeMas = todasLasPartes.length - partes.length;
  // El héroe se queda TODO el sobrante. Antes lo compartía con la rampa —y por
  // eso podía renunciar a crecer cuando la sesión no traía cifras de dosis—,
  // pero retirada la rampa el único que puede pagar el alto es el sujeto de la
  // pantalla. Que la tarjeta respire de más es preferible a una franja muerta
  // sobre la acción (§6.1: la altura la paga quien manda; §6.2: un hueco se gana
  // o no existe).

  return (
    <Card fill leftAccent style={{ flex: '1 1 auto', minHeight: 0, ...entradaStyle(visible, 120) }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.m }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
          <Label size={10} color="var(--twin-accent-text)">
            Hoy · {dia.nombre} {dia.numero}
          </Label>
          <span style={{ display: 'flex', gap: 4 }}>
            {plan.modalidades.map((m: Modalidad, i: number) => (
              <PuntoModalidad key={i} modalidad={m} size={7} />
            ))}
          </span>
        </div>
        <Display size={tamano}>{titulo}</Display>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '0 0 auto' }}>
          {plan.formato && <Pastilla>{plan.formato}</Pastilla>}
          {/* Minutos si el plan los escribe; si no, la razón. La pastilla solo
              va en acento cuando lleva un número: una razón no es un dato. */}
          <Pastilla acento={'minutos' in plan.duracion}>{textoDuracion(plan.duracion)}</Pastilla>
        </div>

        {partes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: '0 0 auto', paddingTop: 2 }}>
            {partes.map((b, i) => (
              <ParteSesion
                key={i}
                titulo={b.titulo}
                ejercicios={b.items.length}
                estructural={b.estructural === true}
                // El color de la parte lo pone su primer ejercicio, que es el
                // que la abre; no se inventa una modalidad para el conjunto.
                modalidad={b.items[0].modalidad}
              />
            ))}
            {partesDeMas > 0 && (
              <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                {cuenta(partesDeMas, 'parte más', 'partes más')}
              </span>
            )}
          </div>
        )}

        {/* El sobrante NO se queda en una bolsa: entra aquí y las cifras de la
            dosis se colocan en su centro, con el filo justo encima. */}
        {plan.claves.length > 0 && (
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: SP.m,
            }}
          >
            <Hairline />
            <div style={{ display: 'flex', gap: SP.m }}>
              {plan.claves.map((c, i) => (
                <DatoClave key={i} clave={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// El héroe — el día que no toca nada (Vacío: centra, y con salida)
// ---------------------------------------------------------------------------

function HeroeDescanso({
  semana,
  dia,
  visible,
  onAbrir,
}: {
  semana: SemanaPlan;
  dia: DiaPlan;
  visible: boolean;
  onAbrir: (que: string) => void;
}) {
  const ayer = sesionAnterior(semana);
  const manana = sesionSiguiente(semana);

  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: SP.xl,
        ...entradaStyle(visible, 120),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s, textAlign: 'center' }}>
        <Label size={10} color="var(--twin-accent-text)">
          Hoy · {dia.nombre} {dia.numero}
        </Label>
        <Display size={34}>Hoy descansas</Display>
        <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 250 }}>
          No hay nada en el plan para hoy.
        </span>
      </div>

      {/* La salida obligatoria del vacío (§5): de dónde vienes y a dónde vas. */}
      <div style={{ display: 'flex', gap: SP.s, alignItems: 'stretch' }}>
        {ayer && (
          <TarjetaDia
            cuando="Ayer"
            dia={`${ayer.dia.inicial} ${ayer.dia.numero}`}
            titulo={ayer.sesion.plan.ref.titulo}
            modalidad={ayer.sesion.plan.modalidades[0]}
            // Una sesión hecha se cuenta con lo que se midió, no con lo previsto.
            detalle={ayer.sesion.hechaMin !== null ? `${ayer.sesion.hechaMin} min` : 'sin registrar'}
            hecha={ayer.sesion.hechaMin !== null}
            onPulsar={() => onAbrir(ayer.sesion.plan.ref.titulo)}
          />
        )}
        {manana && (
          <TarjetaDia
            cuando="Mañana"
            dia={`${manana.dia.inicial} ${manana.dia.numero}`}
            titulo={manana.sesion.plan.ref.titulo}
            modalidad={manana.sesion.plan.modalidades[0]}
            detalle={detalleDeManana(manana.sesion)}
            hecha={false}
            onPulsar={() => onAbrir(manana.sesion.plan.ref.titulo)}
          />
        )}
      </div>
      {!manana && (
        <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          La semana ya está cerrada.
        </span>
      )}
    </div>
  );
}

/** El anticipo de mañana: su dato más claro y su duración, o por qué no la hay. */
function detalleDeManana(sesion: SesionDelDia): string {
  const clave = sesion.plan.claves[0];
  const tiempo = textoDuracion(sesion.plan.duracion);
  return clave ? `${clave.valor} · ${tiempo}` : tiempo;
}
