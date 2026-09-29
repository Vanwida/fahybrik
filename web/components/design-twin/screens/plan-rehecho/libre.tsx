'use client';

// PLAN SIN COACH — la pestaña del tier libre (`FreePlanView`), con el lenguaje de
// «Hoy · El día».
//
// La regla que la gobierna (DECISIONS 27-jul): el tier libre MIDE y COMPARA, el de
// pago DECIDE. Tiene que valer la pena aunque nadie pague nunca, así que todo es
// dato SUYO, lo que falta se dice, y primero se le da lo que ya tenemos y luego se
// le pide algo.
//
// El SUJETO cambia según lo que hay:
//   · sin nada medido → «Primero, saber dónde estás» (naranja sólido: es lo que
//     hay que hacer ahora) y la acción es la primera marca;
//   · con carreras o marcas → lo que ya demuestran, en un tinte suave, con la
//     acción de programar un entreno;
//   · en frío → esqueleto (jamás «sin datos» un instante y luego otra cosa).
//
// Sin coach: cero chat, comunicados, revisión ni tests. La única pieza que habla
// de un coach es la de conversión, la última y sin nombre.
//
// Altura `llena`: el sobrante entra en el sujeto (que crece), nunca en una cola.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { reloj, ritmoKm } from '../../kit-composicion/formato';
import { Estilos } from '../../kit-dia/estilos';
import { IcoMas } from '../../kit-dia/iconos';
import { Etiqueta, TituloSeccion } from '../../kit-dia/piezas';
import { MARGEN, fuente, RADIO, TAM, TOQUE, velo } from '../../kit-dia/tokens';
import type { SemanaDelPlan, SesionDelPlan } from '../../kit-plan/contrato';
import { tieneEvidencia, type CasoLibre, type EvidenciaDeCarreras, type LecturaLibre } from '../../kit-plan/contrato-libre';
import {
  accionLibre,
  dondeYCuando,
  lineaDeProgreso,
  nombreEnBoton,
  recuentoDeCarreras,
  resumenDeSemana,
  rotuloDelPanel,
  textoDiaLibreVacio,
  notaOchoKm,
} from '../../kit-plan/libre';
import {
  accionesDeSesion,
  borrarSesion,
  diasDestino,
  estadoEfectivo,
  etiquetaDeDiaDestino,
  etiquetaDeFecha,
  moverSesion,
  textoDuracion,
  trabajado,
  type ClaveAccion,
} from '../../kit-plan/modelo';
import { SelloEstado } from '../../kit-dia/iconos';
import { HojaAcciones, HojaMover, type GrupoDeAcciones } from './capas';
import { Dialogos } from './dialogos';
import { Carril } from './carril';
import { SujetoEsqueleto } from './estados';
import { EstilosPlan } from './estilos';
import { Dock, DockEsqueleto } from './filas';
import { IcoPuntos } from './iconos';
import {
  FilaEvidencia,
  TarjetaArranque,
  TarjetaCarrera,
  TarjetaCatalogoCaido,
  TarjetaConversion,
  TarjetaImportar,
  TarjetaMarcas,
  TarjetaSemanaBloqueada,
  TarjetaSinCarrera,
  TarjetaVo2,
  TarjetasEsqueleto,
} from './libre-tarjetas';
import { Abajo, ApoyoPlan, Arriba, KickerPlan, PuntoModalidad, ShellSujeto, TituloPlan } from './shell';

/** Lo que un atleta libre puede hacerle a una sesión suya: el menú de `SemanaAtletaOperativa`, más corto que el del coach. */
const CLAVES_LIBRES: ClaveAccion[] = ['editar-libre', 'mover', 'borrar-libre'];

// ── El sujeto ───────────────────────────────────────────────────────────────

function OchoKmYTransiciones({ e }: { e: EvidenciaDeCarreras }) {
  const progreso = lineaDeProgreso(e);
  return (
    <div>
      {e.mejor8km ? (
        <FilaEvidencia titulo="Tus 8 km" valor={ritmoKm(e.mejor8km.ritmoSKm)} extra={reloj(e.mejor8km.totalS)} nota={notaOchoKm(e.mejor8km)} ritmo />
      ) : null}
      {e.transiciones ? (
        <FilaEvidencia
          titulo="Tus transiciones"
          valor={reloj(e.transiciones.segundos)}
          nota={`Lo que pierdes yendo de una estación a otra. Tu mejor registro, en ${e.transiciones.lugar}.`}
        />
      ) : null}
      {progreso ? (
        <p style={{ margin: 0, padding: '14px 0 0', borderTop: `1px solid ${velo('var(--twin-fg)', 14)}`, ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{progreso}</p>
      ) : null}
    </div>
  );
}

function SujetoLibre({ l }: { l: LecturaLibre }) {
  if (l.cargando) return <SujetoEsqueleto />;

  if (!tieneEvidencia(l)) {
    return (
      <ShellSujeto tono="accion" etiqueta="Primero, saber dónde estás">
        <Arriba>
          <KickerPlan tono="accion">Plan</KickerPlan>
          <TituloPlan tono="accion">Primero, saber dónde estás.</TituloPlan>
          <ApoyoPlan tono="accion">Sin números no hay plan que valga. Traemos lo que ya has corrido y medimos el resto.</ApoyoPlan>
        </Arriba>
        <Abajo>
          <ApoyoPlan tono="accion">Tus marcas son tuyas. Sin cuenta de pago, sin tarjeta.</ApoyoPlan>
        </Abajo>
      </ShellSujeto>
    );
  }

  const e = l.evidencia;
  if (e && (e.mejorTiempo || e.mejor8km)) {
    const f = e.mejorTiempo;
    return (
      <ShellSujeto tono="info" etiqueta="Lo que dicen tus carreras">
        <Arriba>
          <KickerPlan tono="info">Lo que dicen tus carreras</KickerPlan>
          {f ? (
            <>
              <TituloPlan tono="info">{reloj(f.tiempoS)}</TituloPlan>
              <ApoyoPlan tono="info">
                Tu mejor tiempo de {recuentoDeCarreras(e.carreras)} · {dondeYCuando(f)}
                {f.categoria ? ` · ${f.categoria}` : ''}
              </ApoyoPlan>
              {/* El tiempo de una pareja es suyo, pero no es una medida de él solo: decirlo es lo que permite enseñar el número grande sin mentir. */}
              {f.equipo ? <ApoyoPlan tono="info">Es el tiempo de la pareja. Lo que sí es tuyo solo, debajo.</ApoyoPlan> : null}
            </>
          ) : e.mejor8km ? (
            <>
              <TituloPlan tono="info">{ritmoKm(e.mejor8km.ritmoSKm)}</TituloPlan>
              <ApoyoPlan tono="info">Tu mejor ritmo en 8 km · {e.mejor8km.lugar}</ApoyoPlan>
            </>
          ) : null}
        </Arriba>
        <Abajo>
          <OchoKmYTransiciones e={e} />
        </Abajo>
      </ShellSujeto>
    );
  }

  // Solo marcas: lo que ya ha medido, con la mejor a la vista.
  const m = l.marcas.medidas[0];
  return (
    <ShellSujeto tono="info" etiqueta="Tus marcas">
      <Arriba>
        <KickerPlan tono="info">Tus marcas</KickerPlan>
        <TituloPlan tono="info">{m?.valor ?? ''}</TituloPlan>
        <ApoyoPlan tono="info">
          {m?.etiqueta}
          {m?.cuando ? ` · ${m.cuando}` : ''}
        </ApoyoPlan>
      </Arriba>
      <Abajo>
        <ApoyoPlan tono="info">Tus marcas son tuyas. Sin cuenta de pago, sin tarjeta.</ApoyoPlan>
      </Abajo>
    </ShellSujeto>
  );
}

// ── Tu semana ───────────────────────────────────────────────────────────────

function FilaDelDia({ sesion, iso, hoyIso, onAbrir, onMenu }: { sesion: SesionDelPlan; iso: string; hoyIso: string; onAbrir: () => void; onMenu: () => void }) {
  const estado = estadoEfectivo(sesion, iso, hoyIso);
  const meta = textoDuracion(sesion.duracion);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--twin-hairline)' }}>
      <button
        type="button"
        className="pl-btn"
        onClick={onAbrir}
        aria-label={`${sesion.titulo}, ${estado === 'saltada' ? 'sin hacer' : trabajado(estado) ? 'hecha' : 'por hacer'}`}
        style={{ flex: 1, minWidth: 0, minHeight: 64, padding: '10px 4px 10px 0', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'var(--twin-fg)' }}
      >
        <PuntoModalidad modalidad={sesion.modalidad} tam={10} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25) }}>{sesion.titulo}</span>
          {meta ? <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{meta}</span> : null}
        </span>
        <SelloEstado estado={estado} tam={24} />
      </button>
      <button type="button" className="pl-btn" aria-label={`Acciones de ${sesion.titulo}`} onClick={onMenu} style={{ width: TOQUE, display: 'grid', placeItems: 'center', color: 'var(--twin-muted)' }}>
        <IcoPuntos tam={22} />
      </button>
    </div>
  );
}

function SemanaPropia({
  semana,
  hoyIso,
  conBoton,
  onLog,
  onMenu,
  onProgramar,
}: {
  semana: SemanaDelPlan;
  hoyIso: string;
  conBoton: boolean;
  onLog: (l: string) => void;
  onMenu: (ids: string[]) => void;
  onProgramar: () => void;
}) {
  const [seleccion, setSeleccion] = useState<string>(hoyIso);
  const dia = semana.dias.find((d) => d.iso === seleccion) ?? semana.dias[semana.indiceHoy ?? 0]!;
  const resumen = resumenDeSemana(semana);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion aparte={<span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>toca un día</span>}>Tu semana</TituloSeccion>
      <div style={{ borderRadius: RADIO.tarjeta, background: 'var(--twin-surface)', border: '1px solid var(--twin-hairline)', padding: '12px 12px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Carril
          dias={semana.dias}
          hoyIso={hoyIso}
          mostradoIso={dia.iso}
          tono="acento"
          onDia={(d) => {
            setSeleccion(d.iso);
            onLog(`${etiquetaDeFecha(d.iso, hoyIso)} → enseña ese día`);
          }}
          onLargo={(d) => onMenu(d.sesiones.map((s) => s.id))}
          onDeslizar={() => undefined}
        />
        <div style={{ padding: '0 6px' }}>
          <Etiqueta>
            {etiquetaDeFecha(dia.iso, hoyIso)}
            {rotuloDelPanel(dia.iso, hoyIso) ? ` · ${rotuloDelPanel(dia.iso, hoyIso)}` : ''}
          </Etiqueta>
          {dia.sesiones.length === 0 ? (
            <p style={{ margin: '8px 0 14px', ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)' }}>{textoDiaLibreVacio(dia.iso, hoyIso)}</p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {dia.sesiones.map((s) => (
                <FilaDelDia
                  key={s.id}
                  sesion={s}
                  iso={dia.iso}
                  hoyIso={hoyIso}
                  onAbrir={() => onLog(trabajado(s.estado) ? `Abrir «${s.titulo}» → abre lo que registraste` : `Abrir «${s.titulo}» → abre la ficha y de ahí arranca`)}
                  onMenu={() => onMenu([s.id])}
                />
              ))}
            </div>
          )}
          {resumen ? <p style={{ margin: '4px 0 12px', ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>{resumen}</p> : null}
        </div>
      </div>
      {conBoton ? (
        <button
          type="button"
          className="pl-btn"
          onClick={onProgramar}
          style={{ minHeight: 56, borderRadius: RADIO.tarjeta, border: `1.5px solid ${velo('var(--twin-fg)', 30)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--twin-fg)', ...fuente(700, TAM.cuerpo, 1) }}
        >
          <IcoMas tam={20} />
          Programar entreno
        </button>
      ) : null}
    </section>
  );
}

// ── La pantalla ─────────────────────────────────────────────────────────────

type Hoja = { tipo: 'sesiones'; ids: string[] } | { tipo: 'mover'; id: string };

export function PlanLibre({ caso, onLog }: { caso: CasoLibre; onLog: (linea: string) => void }) {
  const base = caso.lectura;
  const [semana, setSemana] = useState<SemanaDelPlan | null>(base.semana);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [borrar, setBorrar] = useState<SesionDelPlan | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const l = base;
  const accion = accionLibre(l);
  const sinEvidencia = !tieneEvidencia(l);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const mutar = (f: (s: SemanaDelPlan) => SemanaDelPlan) => setSemana((s) => (s ? f(s) : s));
  const sesiones = semana?.dias.flatMap((d) => d.sesiones) ?? [];
  const sesionPorId = (id: string) => sesiones.find((s) => s.id === id) ?? null;

  const grupos = (ids: string[]): GrupoDeAcciones[] =>
    ids.flatMap((id) => {
      const dia = semana?.dias.find((d) => d.sesiones.some((s) => s.id === id));
      const s = dia?.sesiones.find((x) => x.id === id);
      return dia && s
        ? [{ sesion: s, cuando: etiquetaDeFecha(dia.iso, l.hoyIso), acciones: accionesDeSesion(s, { conCoach: false }).filter((a) => CLAVES_LIBRES.includes(a.clave) && (a.clave !== 'editar-libre' || s.libre)) }]
        : [];
    }).filter((g) => g.acciones.length > 0);

  const elegir = (clave: ClaveAccion, s: SesionDelPlan) => {
    if (clave === 'mover') return setHoja({ tipo: 'mover', id: s.id });
    setHoja(null);
    if (clave === 'borrar-libre') return setBorrar(s);
    onLog(`Editar entreno libre → abre el constructor con «${s.titulo}»`);
  };

  const programar = () => onLog('Programar entreno → abre el constructor de entreno libre');

  const columna: CSSProperties = { minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 22, padding: `14px ${MARGEN}px 24px` };

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <EstilosPlan />
      <Pantalla
        estrategia="llena"
        pie={
          l.cargando ? (
            <DockEsqueleto conMenu={false} />
          ) : accion ? (
            <Dock
              texto={accion.tipo === 'medir' ? `Empezar por ${nombreEnBoton(accion.marca.etiqueta)}` : 'Programar entreno'}
              icono={accion.tipo === 'medir' ? 'play' : 'mas'}
              alFinal={false}
              ocupada={reintentando}
              onAccion={() => (accion.tipo === 'medir' ? onLog(`Empezar por ${nombreEnBoton(accion.marca.etiqueta)} → abre «Probarme»`) : programar())}
            />
          ) : null
        }
        tabBar={<TabBar activa="Plan" />}
      >
        <div style={columna}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: sinEvidencia || l.cargando ? '1 0 auto' : undefined }}>
            <SujetoLibre l={l} />
          </div>

          {l.cargando ? (
            <TarjetasEsqueleto />
          ) : (
            <>
              {l.carrera.tipo === 'fijada' ? (
                <TarjetaCarrera carrera={l.carrera.carrera} />
              ) : (
                <TarjetaSinCarrera onAbrir={() => onLog('Ponla → abre el buscador de carreras')} />
              )}

              {l.vo2 ? <TarjetaVo2 vo2={l.vo2} /> : null}

              {!sinEvidencia && l.semanaBloqueada ? <TarjetaSemanaBloqueada semana={l.semanaBloqueada} /> : null}

              {!sinEvidencia ? (
                l.marcas.falloCatalogo && l.marcas.medidas.length + l.marcas.faltan.length === 0 ? (
                  <TarjetaCatalogoCaido onReintentar={() => onLog('Reintentar → vuelve a pedir tus marcas')} />
                ) : (
                  <TarjetaMarcas
                    medidas={l.marcas.medidas}
                    faltan={l.marcas.faltan}
                    onAbrir={(m) => onLog(`${m.etiqueta} → abre su ficha en «Probarme»`)}
                    onTodas={() => onLog('Todas → abre la biblioteca de marcas')}
                  />
                )
              ) : null}

              {l.puedeImportar ? <TarjetaImportar onAbrir={() => onLog('Importar → abre la búsqueda de tu historial de HYROX')} /> : null}

              {sinEvidencia ? (
                l.marcas.arranque.length > 0 ? (
                  <TarjetaArranque pasos={l.marcas.arranque} onAbrir={(m) => onLog(`${m.etiqueta} → abre su ficha en «Probarme»`)} />
                ) : l.marcas.falloCatalogo ? (
                  <TarjetaCatalogoCaido
                    onReintentar={() => {
                      setReintentando(true);
                      timers.current.push(setTimeout(() => setReintentando(false), 1400));
                      onLog('Reintentar → vuelve a pedir tus marcas');
                    }}
                  />
                ) : null
              ) : null}

              {semana ? (
                <SemanaPropia
                  semana={semana}
                  hoyIso={l.hoyIso}
                  conBoton={accion?.tipo !== 'programar'}
                  onLog={onLog}
                  onMenu={(ids) => setHoja({ tipo: 'sesiones', ids })}
                  onProgramar={programar}
                />
              ) : null}

              {!sinEvidencia ? <TarjetaConversion onHablar={() => onLog('Hablar con un coach → abre el formulario del club en el navegador')} /> : null}
            </>
          )}
        </div>
      </Pantalla>

      {hoja?.tipo === 'sesiones' && grupos(hoja.ids).length > 0 ? <HojaAcciones grupos={grupos(hoja.ids)} onElegir={elegir} onCerrar={() => setHoja(null)} /> : null}
      {hoja?.tipo === 'mover' && semana && sesionPorId(hoja.id) ? (
        <HojaMover
          sesion={sesionPorId(hoja.id)!}
          destinos={diasDestino(semana, sesionPorId(hoja.id)!).map((d) => ({ iso: d.iso, etiqueta: etiquetaDeDiaDestino(d) }))}
          onAtras={() => setHoja({ tipo: 'sesiones', ids: [hoja.id] })}
          onElegir={(iso, etiqueta) => {
            const s = sesionPorId(hoja.id)!;
            mutar((sem) => moverSesion(sem, s.id, iso, l.hoyIso));
            setHoja(null);
            onLog(`Mover a otro día → «${s.titulo}» pasa a ${etiqueta}`);
          }}
          onCerrar={() => setHoja(null)}
        />
      ) : null}
      <Dialogos
        dialogo={borrar ? { tipo: 'borrar', sesion: borrar } : null}
        onCerrar={() => setBorrar(null)}
        onBorrar={(s) => {
          mutar((sem) => borrarSesion(sem, s.id, l.hoyIso));
          setBorrar(null);
          onLog(`Borrar entreno libre → «${s.titulo}» se borra del todo`);
        }}
        onLog={onLog}
      />
    </div>
  );
}

