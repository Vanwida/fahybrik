'use client';

// La composición: dónde estás hoy dentro del bloque, y qué toca.
//
// De arriba abajo hay una sola idea, contada tres veces a tres distancias: el
// BLOQUE (la rampa de semanas), la SEMANA (el carril de siete días) y HOY (la
// sesión, en grande). El hilo naranja que baja del día de hoy hasta la tarjeta
// dice que son la misma cosa vista de lejos y de cerca.
//
// Altura (§6.1), `llena`: el cromo de arriba y la acción de abajo son fijos, y
// el sobrante se lo reparten los dos que pueden pagarlo. El héroe crece con lo
// que la sesión tenga que contar (sus partes, su dosis) y la rampa se queda el
// resto hasta su tope, porque un bloque dibujado grande es justo lo que da
// sentido a la semana. Ninguna cola debajo de nada.
//
// En el día de descanso el héroe degrada a `centra`: no hay contenido que
// estirar, hay un hueco que explicar y del que salir.

import { useState } from 'react';
import type { Modalidad } from '../../datos-reales';
import { CTA, Card, Display, Hairline, Label, Mono, SP } from '../../kit';
import { useTimeline } from '../../sim';
import { CarrilSemana, DatoClave, entradaStyle, ParteSesion, Pastilla, PuntoModalidad, Rampa, TarjetaDia } from './atoms';
import type { DiaPlan, EstadoDia, SemanaPlan, SesionDelDia } from './data';
import {
  estadoDia,
  horasPrevistas,
  lecturaRampa,
  minutosPrevistosSemana,
  planDeEscenario,
  rampaDelBloque,
  sesionAnterior,
  sesionSiguiente,
} from './data';

/** «3 sesiones hechas» / «1 sesión hecha» — el plural, una sola vez. */
function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Partes de la sesión que caben en el héroe sin desalojar a la dosis. */
const MAX_PARTES = 4;

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const [entrada, setEntrada] = useState(false);
  const [sellos, setSellos] = useState(false);
  const [rampa, setRampa] = useState(false);

  const { bloque, semanaActual, semana } = planDeEscenario(escenario);
  const minutos = minutosPrevistosSemana(semana);
  const semanas = rampaDelBloque(bloque, semanaActual, minutos);
  const lectura = lecturaRampa(semanas, semanaActual - 1);

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
        setRampa(true);
        const parte = saltadas > 0 ? `, ${cuenta(saltadas, 'saltada', 'saltadas')}` : '';
        onLog(`0:01 · ${cuenta(hechas, 'sesión hecha', 'sesiones hechas')} esta semana${parte}`);
      },
    },
    { at: 1750, run: () => onLog(`0:01 · La rampa se dibuja. ${lectura} ${horasPrevistas(minutos)} h previstas`) },
    {
      at: 2350,
      run: () =>
        onLog(
          sesionHoy
            ? `0:02 · Hoy: ${sesionHoy.plan.ref.titulo}, unos ${sesionHoy.plan.minutosPrevistos} min`
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

      <div
        style={{
          // Flexible a propósito: la rampa se queda con lo que sobre después
          // del héroe, hasta su tope. Es lo que da sentido a la semana, así
          // que si hay alto, se lo gana ella.
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.s,
          ...entradaStyle(entrada, 200),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <Label size={10}>El bloque</Label>
          <span style={{ flex: 1 }} />
          <Mono size={13} weight={700}>
            {horasPrevistas(minutos)}
          </Mono>
          <Label size={9} color="var(--twin-muted)">
            h previstas
          </Label>
        </div>
        <Rampa semanas={semanas} indiceActual={semanaActual - 1} dibujada={rampa} />
        <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{lectura}</span>
      </div>

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
  // Sin cifras de dosis no hay nada dentro que pueda absorber alto (pasa: hay
  // sesiones del método sin medida escrita). Entonces la tarjeta se queda con
  // lo suyo y el sobrante se lo lleva la rampa, en vez de estirarse sobre nada.
  const puedeCrecer = plan.claves.length > 0;

  return (
    <Card
      fill={puedeCrecer}
      leftAccent
      style={{ flex: puedeCrecer ? '1 1 auto' : '0 0 auto', minHeight: 0, ...entradaStyle(visible, 120) }}
    >
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
          <Pastilla acento>unos {plan.minutosPrevistos} min</Pastilla>
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

/** El anticipo de mañana: su dato más claro y la estimación, marcada como tal. */
function detalleDeManana(sesion: SesionDelDia): string {
  const clave = sesion.plan.claves[0];
  const tiempo = `unos ${sesion.plan.minutosPrevistos} min`;
  return clave ? `${clave.valor} · ${tiempo}` : tiempo;
}
