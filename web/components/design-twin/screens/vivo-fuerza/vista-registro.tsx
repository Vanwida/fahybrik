'use client';

// EL GESTO DE ACABAR LA SERIE.
//
// Es el único momento en el que la app pide algo, y por eso tiene que costar UN
// toque cuando no ha pasado nada raro (§7: declarar tiene que costar un toque).
// Lo prescrito viene puesto y el botón lo confirma; ajustarlo es la excepción y
// vive detrás de un toque más.
//
// Lo que NO viene puesto es el RIR sentido: el del coach es una orden, no una
// medida, y copiarlo al registro sería inventarse cómo te fue. Se pregunta, y
// se puede no contestar.
//
// Va sobre el MISMO marco que la serie y el descanso (§10.3): lo que se apunta
// cae exactamente donde estaba el «100 kg» que acabas de levantar, así que el
// atleta no reencuadra al pasar de una a otra. Los objetivos siguen siendo de
// 56 pt para arriba: esto se toca de pie, con la mano sudada y sin gafas.

import { useState } from 'react';
import { Label, Mono, RAD, SP, SecondaryCTA } from '../../kit';
import { Ambiente, EtiquetaSujeto, FranjaAccion, MarcoVivo, Numeral, zonaDe } from '../../kit-vivo';
import type { TwinAppearance } from '../../types';
import { Barra } from './barra';
import { NombreEjercicio, TiraPlan, dosisEnPeldanos } from './atoms';
import { kg, numeroTexto, serieTexto, type Prescripcion, type SerieHecha } from './data';

/** Paso de carga = el par de discos más pequeño que existe (1,25 por lado). */
const PASO_KG = 2.5;

// ---------------------------------------------------------------------------

function BotonPaso({
  signo,
  paso,
  etiqueta,
  grande,
  onClick,
}: {
  signo: -1 | 1;
  paso: number;
  etiqueta: string;
  grande: boolean;
  onClick: () => void;
}) {
  const lado = grande ? 58 : 52;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${signo > 0 ? 'Subir' : 'Bajar'} ${etiqueta} ${paso}`}
      style={{
        width: lado,
        height: lado,
        flex: '0 0 auto',
        borderRadius: RAD.m,
        border: '1px solid var(--twin-outline)',
        background: grande ? 'var(--twin-surface-elevated)' : 'var(--twin-surface)',
        color: grande ? 'var(--twin-fg)' : 'var(--twin-muted)',
        font: `700 ${grande ? 26 : 15}px/1 var(--twin-font-mono)`,
        cursor: 'pointer',
      }}
    >
      {signo > 0 ? '+' : '−'}
      {!grande && numeroTexto(paso)}
    </button>
  );
}

/** El hueco a rellenar. Ni un cero (sería un dato) ni un guion (§7): un sitio vacío. */
function Vacio() {
  return (
    <span
      aria-label="sin poner"
      style={{
        display: 'inline-block',
        width: 46,
        height: 8,
        borderRadius: 4,
        background: 'var(--twin-hairline-strong)',
        verticalAlign: 'middle',
      }}
    />
  );
}

function Stepper({
  etiqueta,
  valor,
  unidad,
  paso,
  pasoGrande,
  min,
  onCambio,
}: {
  etiqueta: string;
  valor: number | null;
  unidad: string;
  paso: number;
  /**
   * Salto largo. Solo cuando NO hay prescripción que confirmar: ahí se parte de
   * vacío y llegar a 12 de uno en uno son doce toques con la mano sudada.
   */
  pasoGrande?: number;
  min: number;
  onCambio: (v: number) => void;
}) {
  const mover = (signo: -1 | 1, salto: number) => {
    const base = valor ?? min - salto;
    onCambio(Math.max(min, Math.round((base + signo * salto) * 100) / 100));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <Label size={9}>{etiqueta}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: pasoGrande ? 6 : SP.m }}>
        {pasoGrande && (
          <BotonPaso signo={-1} paso={pasoGrande} etiqueta={etiqueta} grande={false} onClick={() => mover(-1, pasoGrande)} />
        )}
        <BotonPaso signo={-1} paso={paso} etiqueta={etiqueta} grande onClick={() => mover(-1, paso)} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          {valor == null ? (
            <Vacio />
          ) : (
            <Mono size={40} weight={800}>
              {numeroTexto(valor)}
            </Mono>
          )}
          <Mono size={15} weight={600} color="var(--twin-muted)">
            {unidad}
          </Mono>
        </div>
        <BotonPaso signo={1} paso={paso} etiqueta={etiqueta} grande onClick={() => mover(1, paso)} />
        {pasoGrande && (
          <BotonPaso signo={1} paso={pasoGrande} etiqueta={etiqueta} grande={false} onClick={() => mover(1, pasoGrande)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const OPCIONES_RIR = [0, 1, 2, 3, 4] as const;

function EscalaRir({
  valor,
  delCoach,
  onElegir,
}: {
  valor: number | null;
  delCoach: number | null;
  onElegir: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto' }}>
      <Label size={9}>¿cuántas más te quedaban?</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        {OPCIONES_RIR.map((n) => {
          const elegido = valor === n;
          const pedido = delCoach === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onElegir(n)}
              style={{
                flex: 1,
                height: 56,
                borderRadius: RAD.m,
                cursor: 'pointer',
                background: elegido ? 'var(--twin-accent)' : 'var(--twin-surface)',
                color: elegido ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
                border: elegido
                  ? '1.5px solid var(--twin-accent-text)'
                  : `1px ${pedido ? 'dashed' : 'solid'} ${pedido ? 'var(--twin-accent-text)' : 'var(--twin-hairline)'}`,
                font: '800 19px/1 var(--twin-font-mono)',
              }}
            >
              {n === 4 ? '4+' : n}
            </button>
          );
        })}
      </div>
      <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {delCoach != null
          ? `El coach pidió RIR ${delCoach}. Si no dices cómo fue, no se apunta.`
          : 'Si no dices cómo fue, no se apunta.'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function VistaRegistro({
  p,
  serieActiva,
  pulso,
  appearance,
  onConfirmar,
  onLog,
}: {
  p: Prescripcion;
  serieActiva: number;
  /** El pulso del reloj. Nulo = sin reloj, y el lienzo se queda neutro (§10.1). */
  pulso: number | null;
  appearance: TwinAppearance;
  onConfirmar: (hecha: SerieHecha) => void;
  onLog: (linea: string) => void;
}) {
  const [reps, setReps] = useState<number | null>(p.reps);
  const [cargaKg, setCargaKg] = useState<number | null>(p.cargaKg);
  const [rirSentido, setRirSentido] = useState<number | null>(null);
  // Sin prescripción que confirmar no hay «tal cual»: se entra ajustando.
  const [ajustando, setAjustando] = useState(p.reps == null);

  const prescrito = serieTexto(p.reps, p.cargaKg);
  const apuntado = dosisEnPeldanos(reps, cargaKg);
  const cambiado = reps !== p.reps || cargaKg !== p.cargaKg;
  const puedeCerrar = p.reps != null || reps != null;

  const cerrar = (hecha: SerieHecha, nota: string) => {
    onLog(nota);
    onConfirmar(hecha);
  };

  const confirmar = () => {
    if (!puedeCerrar) return;
    const hecha: SerieHecha = { reps, cargaKg, rirSentido };
    const texto = serieTexto(reps, cargaKg) ?? 'sin medida';
    cerrar(
      hecha,
      `Serie ${serieActiva + 1} apuntada · ${texto}${rirSentido != null ? ` · RIR ${rirSentido}` : ' · sin RIR'}`
    );
  };

  const discos = cargaKg != null && p.implemento === 'barra' ? <Barra totalKg={cargaKg} /> : null;

  return (
    <>
      <Ambiente zona={zonaDe(pulso)} appearance={appearance} />
      <MarcoVivo
        cromo={
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, width: '100%' }}>
            <Label size={10}>
              Serie {serieActiva + 1} de {p.series}
            </Label>
            <span style={{ flex: 1 }} />
            <NombreEjercicio>{p.ejercicio}</NombreEjercicio>
          </div>
        }
        contexto={<TiraPlan p={p} />}
        sujeto={
          ajustando ? (
            <>
              <Stepper
                etiqueta="repeticiones"
                valor={reps}
                unidad="reps"
                paso={1}
                pasoGrande={p.reps == null ? 5 : undefined}
                min={1}
                onCambio={(v) => {
                  setReps(v);
                  onLog(`Repeticiones: ${v}`);
                }}
              />
              {cargaKg != null && (
                <Stepper
                  etiqueta="carga"
                  valor={cargaKg}
                  unidad="kg"
                  paso={PASO_KG}
                  min={PASO_KG}
                  onCambio={(v) => {
                    setCargaKg(v);
                    onLog(`Carga: ${kg(v)}`);
                  }}
                />
              )}
              {/* Los discos siguen al número: subes 2,5 y ves qué disco añades. */}
              {discos}
            </>
          ) : (
            <>
              <EtiquetaSujeto>lo que se apunta</EtiquetaSujeto>
              {apuntado && (
                <>
                  <Numeral unidad={apuntado.sujeto.unidad ?? undefined}>{apuntado.sujeto.cifra}</Numeral>
                  {apuntado.segundo && (
                    <Numeral escala="segundo" unidad={apuntado.segundo.unidad ?? undefined}>
                      {apuntado.segundo.cifra}
                    </Numeral>
                  )}
                </>
              )}
              {discos}
            </>
          )
        }
        apoyos={
          <>
            <EscalaRir
              valor={rirSentido}
              delCoach={p.rir}
              onElegir={(v) => {
                setRirSentido(v);
                onLog(`Te quedaban ${v === 4 ? '4 o más' : v}`);
              }}
            />
            {p.reps == null ? (
              // La salida honesta: si no las contaste, se apunta que no las
              // contaste. Mejor un hueco declarado que un número inventado.
              <SecondaryCTA
                title="No las conté"
                height={46}
                onClick={() =>
                  cerrar(
                    { reps: null, cargaKg, rirSentido },
                    `Serie ${serieActiva + 1} apuntada sin repeticiones (el atleta no las contó)`
                  )
                }
              />
            ) : (
              <SecondaryCTA
                title={ajustando ? `Tal cual · ${prescrito}` : 'Ajustar reps o kilos'}
                height={46}
                onClick={() => {
                  if (ajustando) {
                    setReps(p.reps);
                    setCargaKg(p.cargaKg);
                    onLog('Vuelve a lo prescrito');
                  } else {
                    onLog('Abre los ajustes de la serie');
                  }
                  setAjustando(!ajustando);
                }}
              />
            )}
          </>
        }
        accion={
          <FranjaAccion
            titulo={
              puedeCerrar
                ? `${cambiado || p.reps == null ? 'APUNTAR' : 'HECHA'} · ${serieTexto(reps, cargaKg) ?? ''}`
                : '¿CUÁNTAS HICISTE?'
            }
            // El toque del atleta es lo ÚNICO que pasa la serie de prescrita a
            // hecha: ahí el relleno naranja significa algo (§10.5). Mientras no
            // haya nada que cerrar, la franja es contorno punteado — el mismo
            // trazo con el que esta familia declara sus huecos.
            unicaSalida={puedeCerrar}
            style={puedeCerrar ? undefined : { borderStyle: 'dashed', color: 'var(--twin-muted)' }}
            onClick={confirmar}
          />
        }
      />
    </>
  );
}
