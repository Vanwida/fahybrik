'use client';

// SUS UMBRALES, CON SU PELDAÑO, Y EL TOQUE PARA DECLARARLOS — pulso, ritmo de
// correr, el de cada máquina y los vatios de la bici, tal como los resuelve el
// servidor (`anclas`: medida > declarada > estimada > por edad) y lo que el
// coach o el atleta declararon de un toque (`PUT …/thresholds`, 0277).
//
// Es lo que convierte en carga el pulso que ya llega (modelo §6.1): una carga
// anclada en un umbral por edad no cuenta; una declarada sí, y se marca. Un
// test siempre gana a lo declarado: si lo hay, lo declarado se guarda y se dice
// que no manda.

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnclaResuelta, AnclasAtleta, ClaveDeclaracion } from '@fahybrid/shared/domain/analytics/anclas';
import { LIMITES_DECLARACION } from '@fahybrid/shared/domain/analytics/anclas';
import { Button, Input } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { reloj } from '@/lib/formato';
import { sendJson } from '@/components/v2/ajustes/autosave';
import { fechaLegible, leerReloj } from './formato';
import { AnclaChip } from './piezas';

export interface UmbralesDelAtleta {
  anclas: AnclasAtleta;
  declaraciones: Array<{ kind: string; value: number; declared_by: 'athlete' | 'coach'; declared_at_iso: string }>;
}

interface Fila {
  kind: ClaveDeclaracion;
  etiqueta: string;
  /** Cómo se escribe y se teclea: un tiempo (s/km, s/500m) o un número entero (ppm, vatios). */
  forma: 'tiempo' | 'entero';
  sufijo: string;
  resuelta: (a: AnclasAtleta) => AnclaResuelta | null;
  /** Qué hace el umbral en el panel, una línea. */
  para: string;
}

const FILAS: readonly Fila[] = [
  { kind: 'lthr_bpm', etiqueta: 'Pulso umbral', forma: 'entero', sufijo: 'ppm', resuelta: (a) => a.pulso, para: 'Reparte cada entreno por zonas y convierte su pulso en carga.' },
  { kind: 'run_s_per_km', etiqueta: 'Ritmo umbral · correr', forma: 'tiempo', sufijo: '/km', resuelta: (a) => a.ritmo.run, para: 'Carga de cada tramo corrido por su ritmo (calle o cinta).' },
  { kind: 'row_s_per_500m', etiqueta: 'Umbral · remo', forma: 'tiempo', sufijo: '/500m', resuelta: (a) => a.ritmo.row, para: 'Carga de cada pieza de remo por sus vatios.' },
  { kind: 'ski_s_per_500m', etiqueta: 'Umbral · SkiErg', forma: 'tiempo', sufijo: '/500m', resuelta: (a) => a.ritmo.ski, para: 'Carga de cada pieza de SkiErg por sus vatios.' },
  { kind: 'bike_s_per_500m', etiqueta: 'Umbral · BikeErg (ritmo)', forma: 'tiempo', sufijo: '/500m', resuelta: (a) => a.ritmo.bike, para: 'El ritmo de la bici; si no hay vatios de umbral, sale de aquí.' },
  { kind: 'bike_watts', etiqueta: 'Umbral · BikeErg (vatios)', forma: 'entero', sufijo: 'W', resuelta: (a) => a.potencia.bike, para: 'Carga de cada pieza de bici por sus vatios (su FTP).' },
];

function escribir(f: Fila, v: number): string {
  return f.forma === 'tiempo' ? `${reloj(v)}${f.sufijo}` : `${Math.round(v)} ${f.sufijo}`;
}

function leer(f: Fila, texto: string): number | null {
  if (f.forma === 'tiempo') return leerReloj(texto);
  const n = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(n) && texto.trim() !== '' ? Math.round(n) : null;
}

function limites(f: Fila): string {
  const l = LIMITES_DECLARACION[f.kind];
  return f.forma === 'tiempo' ? `entre ${reloj(l.min)} y ${reloj(l.max)}${f.sufijo}` : `entre ${l.min} y ${l.max} ${f.sufijo}`;
}

function FilaUmbral({ f, datos, athleteId, hoy, onDatos }: { f: Fila; datos: UmbralesDelAtleta; athleteId: string; hoy: string; onDatos: (d: UmbralesDelAtleta) => void }) {
  const id = useId();
  const resuelta = f.resuelta(datos.anclas);
  const declarada = datos.declaraciones.find((d) => d.kind === f.kind) ?? null;
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState(false);
  // Lo declarado no manda cuando el peldaño que gana es otro (un test): se dice, no se esconde.
  const declaradaNoManda = declarada != null && resuelta != null && resuelta.ancla !== 'declarada';

  const abrir = () => {
    setBorrador(declarada ? (f.forma === 'tiempo' ? reloj(declarada.value) : String(Math.round(declarada.value))) : resuelta ? (f.forma === 'tiempo' ? reloj(resuelta.valor) : String(Math.round(resuelta.valor))) : '');
    setError(null);
    setEditando(true);
  };

  const guardar = async (valor: number | null) => {
    if (valor != null) {
      const l = LIMITES_DECLARACION[f.kind];
      if (valor < l.min || valor > l.max) {
        setError(`Tiene que estar ${limites(f)}.`);
        return;
      }
    }
    setGuardando(true);
    setError(null);
    const res = await sendJson<UmbralesDelAtleta>(`/api/coach/athletes/${encodeURIComponent(athleteId)}/thresholds`, 'PUT', { kind: f.kind, value: valor });
    setGuardando(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setEditando(false);
    onDatos(res.data);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 border-b border-v2-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="t-body font-medium text-v2-fg">{f.etiqueta}</span>
        {resuelta ? <>
          <span className="t-title-sm t-tnum font-semibold text-v2-fg">{escribir(f, resuelta.valor)}</span>
          <AnclaChip ancla={resuelta.ancla} />
          {resuelta.desde_iso ? <span className="t-meta text-v2-muted">Desde el {fechaLegible(resuelta.desde_iso.slice(0, 10), hoy)}</span> : null}
        </> : <span className="t-body font-medium text-v2-fg">Sin umbral</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {!editando ? <Button size="sm" variant="secondary" disabled={guardando} onClick={abrir} aria-label={`${declarada ? 'Editar' : 'Declarar'} ${f.etiqueta}`}>
            {declarada ? 'Editar' : 'Declarar'}
          </Button> : null}
          <Button size="sm" variant="ghost" iconEnd={ChevronDown} className={cn(detalle && '[&_svg]:rotate-180')} aria-label={`Detalles de ${f.etiqueta}`} aria-expanded={detalle} aria-controls={`${id}-detalle`} onClick={() => setDetalle((open) => !open)}>
            Detalles
          </Button>
        </div>
      </div>
        {editando ? (
          <form
            className="mt-1 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = leer(f, borrador);
              if (v == null) {
                setError(f.forma === 'tiempo' ? 'Escríbelo como minutos:segundos, por ejemplo 4:12.' : 'Escribe un número.');
                return;
              }
              void guardar(v);
            }}
          >
            <label htmlFor={id} className="sr-only">
              {f.etiqueta}
            </label>
            <Input
              id={id}
              autoFocus
              inputMode={f.forma === 'tiempo' ? 'text' : 'numeric'}
              value={borrador}
              invalid={error != null}
              placeholder={f.forma === 'tiempo' ? '4:12' : ''}
              aria-describedby={`${id}-ayuda`}
              onChange={(e) => {
                setBorrador(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditando(false);
              }}
              className="w-24 text-right t-tnum"
            />
            <span className="t-body-sm text-v2-muted">{f.sufijo}</span>
            <Button type="submit" size="sm" loading={guardando}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <span id={`${id}-ayuda`} className={cn('basis-full t-meta', error ? 'text-v2-danger' : 'text-v2-faint')} role={error ? 'alert' : undefined}>
              {error ?? `Un número ${limites(f)}. Lo que declares vale hasta que un test lo mida.`}
            </span>
          </form>
        ) : error ? (
          <p role="alert" className="t-meta text-v2-danger">
            {error}
          </p>
        ) : null}
      <div id={`${id}-detalle`} hidden={!detalle}>
        <div className="flex flex-col items-start gap-2 border-l border-v2-border pl-3">
          <p className="t-body-sm text-v2-muted">{f.para}</p>
          {resuelta ? <p className="t-body-sm text-v2-muted">{resuelta.explica_es}.</p> : null}
          {declarada ? <p className="t-body-sm text-v2-muted">
            Declarado por {declarada.declared_by === 'coach' ? 'el coach' : 'el atleta'}: {escribir(f, declarada.value)} · {fechaLegible(declarada.declared_at_iso.slice(0, 10), hoy)}.
            {declaradaNoManda ? ` No manda: ${resuelta?.ancla === 'medida' ? 'hay un test' : 'hay un dato de más peso'}.` : ''}
          </p> : null}
          {declarada && !editando ? <Button size="sm" variant="ghost" loading={guardando} onClick={() => void guardar(null)}>Quitar lo declarado</Button> : null}
        </div>
      </div>
    </div>
  );
}

/** El bloque de umbrales de la ficha: los seis, con su peldaño y el toque para declararlos. */
export function Umbrales({ athleteId, inicial, hoy, onGuardado }: { athleteId: string; inicial: UmbralesDelAtleta; hoy: string; /** Tras guardar: el panel se recalcula con el umbral nuevo. */ onGuardado?: () => void }) {
  const [datos, setDatos] = useState(inicial);
  return (
    <div className="flex flex-col gap-2">
      <p className="t-body-sm text-v2-muted">
        Un umbral medido o declarado permite calcular carga; uno estimado se usa y se marca; uno por edad no cuenta. Si falta un umbral, esa carga no se calcula. El test del umbral tiene prioridad sobre lo declarado.
      </p>
      <div className="rounded-panel border border-v2-border bg-v2-surface">
        {FILAS.map((f) => (
          <FilaUmbral
            key={f.kind}
            f={f}
            datos={datos}
            athleteId={athleteId}
            hoy={hoy}
            onDatos={(d) => {
              setDatos(d);
              onGuardado?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}
