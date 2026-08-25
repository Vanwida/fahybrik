'use client';

// El ciclo del hierro, entero: serie → registro → descanso → serie.
//
// No son cuatro maquetas sueltas: es UNA máquina y cada escenario entra por un
// punto distinto. Así el estudio enseña lo que de verdad hay que juzgar — las
// transiciones — y no se puede colar una pantalla que sola se ve bien pero a la
// que no se llega desde ninguna parte.
//
// Dos máquinas porque son dos dominios distintos:
//   Fuerza   → series iguales con descanso prescrito (el back squat real).
//   Circuito → movimientos encadenados sin descanso en el plan (el circuito de
//              pierna real). Aquí ni siquiera se sabe QUÉ se mide, así que el
//              registro no puede preguntar un número: pregunta si se hizo.

import { useState } from 'react';
import { Card, Hairline, IconCheckCircle, Label, Mono, SP, SecondaryCTA } from '../../kit';
import { Ambiente, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import type { TwinAppearance } from '../../types';
import { useTimeline } from '../../sim';
import { Hueco, Pie, RielCircuito, RielSeries, SujetoNombre, UltimaVez } from './atoms';
import {
  CIRCUITO,
  CON_RELOJ,
  LUNGE,
  SERIE_1,
  SERIE_2,
  SERIE_ACTIVA,
  SLED,
  SQUAT,
  ULTIMA_VEZ,
  kg,
  pulsoTras,
  serieTexto,
  type Prescripcion,
  type SerieHecha,
} from './data';
import { VistaDescanso } from './vista-descanso';
import { VistaRegistro } from './vista-registro';
import { VistaSerie } from './vista-serie';

export type FaseFuerza = 'serie' | 'registro' | 'descanso';

/**
 * El pulso mientras trabajas, del reloj de la muñeca. Es el máximo MEDIDO de
 * esta misma asignación (ejecución 162: 122 ppm), que es lo que marcas al
 * soltar la barra — de ahí arranca la caída del descanso. Sobre el umbral de
 * 162 cae en Z1, y por eso el lienzo del hierro se tiñe de calma: lo dice el
 * dato, no la estética.
 */
const PULSO_TRABAJANDO = pulsoTras(0);

// ---------------------------------------------------------------------------
// El cierre del ejercicio — la cuarta serie no puede dejar la pantalla colgada
// ---------------------------------------------------------------------------

function VistaFin({
  p,
  hechas,
  appearance,
  onLog,
}: {
  p: Prescripcion;
  hechas: Record<number, SerieHecha>;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  return (
    <>
      <Ambiente zona={zonaDe(CON_RELOJ ? PULSO_TRABAJANDO : null)} appearance={appearance} />
      <MarcoVivo
        cromo={
          <Label size={10}>
            {p.series} de {p.series} series
          </Label>
        }
        sujeto={<SujetoNombre encima="Ejercicio hecho" nombre={p.ejercicio} />}
        apoyos={
          <Card padding={0} topAccent>
            {Array.from({ length: p.series }, (_, i) => {
              const h = hechas[i];
              return (
                <div key={i}>
                  {i > 0 && <Hairline />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.m, padding: '11px 14px' }}>
                    <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}>
                      <IconCheckCircle size={14} />
                    </span>
                    <Label size={9}>serie {i + 1}</Label>
                    <span style={{ flex: 1 }} />
                    {h?.rirSentido != null && (
                      <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                        te quedaban {h.rirSentido}
                      </span>
                    )}
                    <Mono size={14} weight={700}>
                      {(h && serieTexto(h.reps, h.cargaKg)) ?? 'sin apuntar'}
                    </Mono>
                  </div>
                </div>
              );
            })}
          </Card>
        }
        accion={<FranjaAccion titulo="CERRAR EL EJERCICIO" unicaSalida onClick={() => onLog('Ejercicio cerrado')} />}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Fuerza — Back Squat 4×5 @ 100 kg, descanso 1:30
// ---------------------------------------------------------------------------

const BLOQUE_FUERZA = 'Fuerza';

export function MaquinaFuerza({
  entrada,
  appearance,
  onLog,
}: {
  entrada: FaseFuerza;
  appearance: TwinAppearance;
  onLog: (l: string) => void;
}) {
  const pulso = CON_RELOJ ? PULSO_TRABAJANDO : null;
  // Entrar por el descanso significa que la serie 2 ya está cerrada y la que
  // viene es la 3. El estado inicial lo dice el escenario; de ahí en adelante
  // manda la máquina.
  const entraEnDescanso = entrada === 'descanso';
  const [fase, setFase] = useState<FaseFuerza>(entrada);
  const [activa, setActiva] = useState(entraEnDescanso ? SERIE_ACTIVA + 1 : SERIE_ACTIVA);
  const [hechas, setHechas] = useState<Record<number, SerieHecha>>(
    entraEnDescanso ? { 0: SERIE_1, 1: SERIE_2 } : { 0: SERIE_1 }
  );

  useTimeline([
    {
      at: 0,
      run: () =>
        onLog(
          entrada === 'serie'
            ? `Serie ${SERIE_ACTIVA + 1} de ${SQUAT.series} · ${serieTexto(SQUAT.reps, SQUAT.cargaKg)} · RIR ${SQUAT.rir}`
            : entrada === 'registro'
              ? 'Acabas la serie 2 — la app pregunta antes de archivar nada'
              : `Descanso de ${SQUAT.descansoS} s tras la serie 2`
        ),
    },
  ]);

  if (activa >= SQUAT.series && fase === 'serie' && hechas[SQUAT.series - 1]) {
    return <VistaFin p={SQUAT} hechas={hechas} appearance={appearance} onLog={onLog} />;
  }

  if (fase === 'registro') {
    return (
      <VistaRegistro
        p={SQUAT}
        serieActiva={activa}
        pulso={pulso}
        appearance={appearance}
        onLog={onLog}
        onConfirmar={(hecha) => {
          setHechas({ ...hechas, [activa]: hecha });
          const ultima = activa + 1 >= SQUAT.series;
          setActiva(activa + 1);
          // Sin descanso prescrito no se fabrica una cuenta atrás: se pasa a la
          // siguiente serie y punto.
          setFase(!ultima && SQUAT.descansoS != null ? 'descanso' : 'serie');
        }}
      />
    );
  }

  if (fase === 'descanso' && SQUAT.descansoS != null) {
    const hecha = hechas[activa - 1] ?? SERIE_2;
    return (
      <VistaDescanso
        p={SQUAT}
        totalS={SQUAT.descansoS}
        serieHecha={hecha}
        serieHechaIndice={activa - 1}
        siguienteIndice={activa}
        conReloj={CON_RELOJ}
        appearance={appearance}
        onEmpezar={() => setFase('serie')}
        onLog={onLog}
      />
    );
  }

  return (
    <VistaSerie
      bloque={BLOQUE_FUERZA}
      p={SQUAT}
      indice={activa + 1}
      total={SQUAT.series}
      encima={`Te toca · serie ${activa + 1} de ${SQUAT.series}`}
      ctaTitulo="SERIE HECHA"
      pulso={pulso}
      appearance={appearance}
      riel={<RielSeries total={SQUAT.series} activa={activa} hechas={hechas} />}
      pie={
        <UltimaVez
          haceDias={ULTIMA_VEZ.haceDias}
          linea={`${ULTIMA_VEZ.series}×${ULTIMA_VEZ.reps} · ${kg(ULTIMA_VEZ.cargaKg)}`}
          detalle={`las ${ULTIMA_VEZ.seriesCompletas} enteras · te quedaban ${ULTIMA_VEZ.rirUltimaSerie} en la última`}
        />
      }
      onHecha={() => {
        onLog(`Acabas la serie ${activa + 1}`);
        setFase('registro');
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Circuito — el caso real sin repeticiones (plantilla 442)
// ---------------------------------------------------------------------------

const BLOQUE_CIRCUITO = 'Circuito de pierna';
const LETRAS = CIRCUITO.map((c) => ({ letra: c.letra, nombre: c.item.nombre }));

export function MaquinaCircuito({
  appearance,
  onLog,
}: {
  appearance: TwinAppearance;
  onLog: (l: string) => void;
}) {
  const pulso = CON_RELOJ ? PULSO_TRABAJANDO : null;
  const [posicion, setPosicion] = useState(0); // 0 = A1, 1 = A2…
  const [vuelta, setVuelta] = useState(0);
  const [registrando, setRegistrando] = useState(false);
  const [hechas, setHechas] = useState<Record<number, SerieHecha>>({});

  useTimeline([
    {
      at: 0,
      run: () =>
        onLog('Reverse Lunge · 4 series a 30 kg y sin repeticiones: así está en el plan del coach'),
    },
  ]);

  const enLunge = posicion === 0;
  const p = enLunge ? LUNGE : SLED;

  const avanzar = () => {
    setRegistrando(false);
    // Solo se modela el par A1 → A2 del brief; al volver a A1 sube la vuelta.
    if (enLunge) setPosicion(1);
    else {
      setPosicion(0);
      setVuelta(Math.min(vuelta + 1, LUNGE.series - 1));
    }
  };

  if (registrando && enLunge) {
    return (
      <VistaRegistro
        p={LUNGE}
        serieActiva={vuelta}
        pulso={pulso}
        appearance={appearance}
        onLog={onLog}
        onConfirmar={(hecha) => {
          setHechas({ ...hechas, [vuelta]: hecha });
          avanzar();
        }}
      />
    );
  }

  const siguiente = CIRCUITO[enLunge ? 1 : 0];

  return (
    <VistaSerie
      bloque={BLOQUE_CIRCUITO}
      p={p}
      indice={posicion + 1}
      total={CIRCUITO.length}
      encima={enLunge ? `Te toca · serie ${vuelta + 1} de ${LUNGE.series}` : 'Te toca · sin soltar'}
      ctaTitulo={enLunge ? 'SERIE HECHA' : 'HECHO'}
      pulso={pulso}
      appearance={appearance}
      riel={<RielCircuito letras={LETRAS} activo={posicion} />}
      pie={
        <>
          <Hueco
            titulo=""
            texto=""
            accion={
              <SecondaryCTA
                title="Preguntar al coach"
                height={44}
                onClick={() => onLog('Abre el chat con el coach para pedir la dosis que falta')}
              />
            }
          />
          <Pie>
            <Label size={9}>y sin soltar</Label>
            <span style={{ flex: 1 }} />
            <Mono size={13} weight={700}>
              {siguiente.letra} · {siguiente.item.nombre}
            </Mono>
          </Pie>
        </>
      }
      onHecha={() => {
        if (enLunge) {
          onLog(`Acabas la serie ${vuelta + 1} de Reverse Lunge`);
          setRegistrando(true);
          return;
        }
        // Sin medida no hay nada que preguntar: preguntar «cuántas
        // repeticiones» de un trineo sería inventarse hasta la unidad.
        onLog('Sled Push hecho · no hay ningún número que apuntar');
        avanzar();
      }}
    />
  );
}
