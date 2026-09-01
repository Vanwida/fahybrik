// LA VOZ DEL PANEL — el mecanismo es compartido, las palabras son de aquí.
//
// El veredicto lo emite UN motor (`@fahybrid/shared/domain/adherence`) y se
// clasifica igual en las dos superficies. Lo que cambia es la boca: el atleta
// habla de SUS repeticiones («Dentro», «Más lenta»), el coach habla de lo que
// pidió («En banda», «Más lento»). Misma clasificación, mismos colores, otra
// conjugación — y por eso esto vive aparte de `lectura.ts`, que no sabe de
// palabras.
//
// POR QUÉ HAY ETIQUETAS CORTAS. `RECOVERY_COMPLIANCE_LABEL` dice «Recuperación
// controlada», que es correcto cuando la etiqueta va sola. Dentro de una fila
// que ya empieza por «2:00 · trotando», la palabra «recuperación» se repite y
// come el ancho que necesita la cifra. La versión corta NO es otro vocabulario:
// es la misma etiqueta sin el sustantivo que el contexto ya ha dicho.

import {
  RECOVERY_COMPLIANCE_TIER,
  RECOVERY_DURATION_TIER,
  RUN_COMPLIANCE_TIER,
  WORK_DURATION_TIER,
  type RecoveryComplianceVerdict,
  type RecoveryDurationVerdict,
  type RunComplianceVerdict,
  type WorkDurationVerdict,
} from '@fahybrid/shared/domain/adherence';
import type { PillTone } from '@/components/v2/Pill';
import type { RecoveryMode } from '@fahybrid/shared/domain/prescription';

/** El tier compartido decide el color. Los DOS lados de fuera de banda van del
 *  mismo ámbar a propósito: salirse es una señal para el entrenador, no un
 *  suspenso, y por eso el rojo no aparece en ningún veredicto de carrera. */
const TONO_POR_TIER: Record<'success' | 'warning' | 'neutral', PillTone> = {
  success: 'ok',
  warning: 'warn',
  neutral: 'neutral',
};

export const tonoTrabajo = (v: RunComplianceVerdict): PillTone => TONO_POR_TIER[RUN_COMPLIANCE_TIER[v]];
export const tonoRecuperacion = (v: RecoveryComplianceVerdict): PillTone =>
  TONO_POR_TIER[RECOVERY_COMPLIANCE_TIER[v]];
export const tonoDuracionTrabajo = (v: WorkDurationVerdict): PillTone => TONO_POR_TIER[WORK_DURATION_TIER[v]];
export const tonoDuracionRecuperacion = (v: RecoveryDurationVerdict): PillTone =>
  TONO_POR_TIER[RECOVERY_DURATION_TIER[v]];

/** Intensidad del trabajo. Es ya la voz del coach, se usa tal cual. */
export const VOZ_TRABAJO: Record<RunComplianceVerdict, string> = {
  dentro: 'En banda',
  fuera_rapido: 'Más rápido',
  fuera_lento: 'Más lento',
  sin_dato: 'Sin dato',
};

/** Intensidad de la recuperación, sin repetir el sustantivo de la fila. */
export const VOZ_RECUPERACION: Record<RecoveryComplianceVerdict, string> = {
  controlada: 'Controlada',
  demasiado_rapida: 'Demasiado fuerte',
  sin_dato: 'Sin dato',
};

/** Duración del trabajo. Solo se pinta cuando falla: que un tramo dure lo que
 *  se pidió es lo esperado, y el agregado va arriba, así que no se esconde. */
export const VOZ_DURACION_TRABAJO: Record<WorkDurationVerdict, string> = {
  duracion_completa: 'Duración cumplida',
  duracion_incompleta: 'Se quedó corto',
  sin_dato: 'Sin dato',
};

/** Duración de la recuperación. El único fallo es pasarse. */
export const VOZ_DURACION_RECUPERACION: Record<RecoveryDurationVerdict, string> = {
  duracion_controlada: 'En tiempo',
  duracion_excedida: 'Se pasó de tiempo',
  sin_dato: 'Sin dato',
};

/** Cómo se pidió recuperar, en la palabra que se dice en un gimnasio. */
export const VOZ_MODO: Record<RecoveryMode, string> = {
  trote: 'trotando',
  caminar: 'andando',
  parado: 'parado',
};

/** Cómo se cuenta lo que se salió, en una línea. Espeja `fraseSesgo` del doble:
 *  el atleta lee «La que se salió fue más lenta» y el coach lo mismo, porque es
 *  el mismo hecho contado en la misma dirección. */
export function fraseSesgo(fueraRapido: number, fueraLento: number): string | null {
  const fuera = fueraRapido + fueraLento;
  if (fuera === 0) return null;
  const cuantas = fuera === 1 ? 'El que se salió' : `Los ${fuera} que se salieron`;
  if (fueraRapido > 0 && fueraLento > 0) return `${cuantas} se fueron por los dos lados`;
  const verbo = fuera === 1 ? 'fue' : 'fueron';
  const adjetivo = fueraLento > 0 ? 'lento' : 'rápido';
  return `${cuantas} ${verbo} más ${adjetivo}${fuera === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** m:ss. Los segundos siempre con dos cifras: una tabla de ritmos que baila no
 *  se puede escanear en vertical. */
export function reloj(segundos: number): string {
  const total = Math.round(segundos);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** h:mm:ss cuando pasa de la hora; m:ss si no. Para totales de sesión. */
export function relojLargo(segundos: number): string {
  const total = Math.round(segundos);
  if (total < 3600) return reloj(total);
  const h = Math.floor(total / 3600);
  const resto = total % 3600;
  return `${h}:${String(Math.floor(resto / 60)).padStart(2, '0')}:${String(resto % 60).padStart(2, '0')}`;
}

/** Una distancia como la diría un corredor: metros por debajo del kilómetro,
 *  kilómetros con dos decimales por encima. */
export function distancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(2).replace('.', ',')} km`;
}
