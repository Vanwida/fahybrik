'use client';

// El método del coach para las ANALÍTICAS: con esto se calcula y se juzga la
// forma, la frescura, el cumplimiento y lo que cuenta como cambio de todos sus
// atletas (`coach_analytics_method`). Guardar reemplaza el conjunto entero de
// un grupo a la vez (§ modelo.ts, «por qué por grupo»); «Restaurar todo» vuelve
// a los defectos del producto. El panel del atleta enlaza aquí con
// `/ajustes/metodo#analiticas`.

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react';
import {
  ANALYTICS_METHOD_BOUNDS,
  type BaseCumplimiento,
  type ClaveNumericaMetodo,
  type CoachAnalyticsMethod,
  type FuenteCarga,
  type ModalidadCarga,
} from '@fahybrid/shared/domain/analytics/metodo';
import { Button, IconButton, Input, Select, useToast } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { SaveStatus, sendJson, useSaveState } from './autosave';
import {
  CAMPOS_POR_GRUPO,
  DESCRIPTORES_METODO_ANALITICO,
  GRUPOS,
  PELDANO_ETIQUETA,
  type CampoEscalera,
  type CampoNumero,
  type CampoSeleccion,
  type GrupoId,
} from './metodo-analiticas/descriptores';
import {
  anadirPeldano,
  bajarPeldano,
  candidatoDe,
  CLAVES_NUMERICAS_POR_GRUPO,
  draftOf,
  formatearBandasFrescura,
  formatearNumero,
  grupoDifiereDeDefecto,
  peldanosDisponibles,
  quitarPeldano,
  subirPeldano,
  validarCandidato,
  type BorradorMetodoAnalitico,
  type Problema,
} from './metodo-analiticas/modelo';

type Setting = { method: CoachAnalyticsMethod; is_custom: boolean; defaults: CoachAnalyticsMethod };

export function AnalyticsMethodSettings({ initial }: { initial: Setting }) {
  const toast = useToast();
  const [setting, setSetting] = useState(initial);
  const [borrador, setBorrador] = useState<BorradorMetodoAnalitico>(() => draftOf(initial.method));
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [grupoActivo, setGrupoActivo] = useState<GrupoId | null>(null);
  const [expandido, setExpandido] = useState<Set<GrupoId>>(
    () => new Set(GRUPOS.filter((g) => g.plegadoPorDefecto && grupoDifiereDeDefecto(g.id, initial.method, initial.defaults)).map((g) => g.id)),
  );
  const { state, error, run } = useSaveState();
  const m = setting.method;
  const d = setting.defaults;

  const put = (method: CoachAnalyticsMethod | null) =>
    run(async () => {
      const res = await sendJson<Setting>('/api/coach/analytics-method', 'PUT', { method });
      if (!res.ok) return res;
      setSetting(res.data);
      setBorrador(draftOf(res.data.method));
      setProblemas([]);
      return { ok: true };
    });

  const manejar = (resultado: ReturnType<typeof validarCandidato>, grupo: GrupoId) => {
    setGrupoActivo(grupo);
    if (!resultado.ok) return setProblemas(resultado.problemas);
    setProblemas([]);
    if (JSON.stringify(resultado.method) !== JSON.stringify(m)) void put(resultado.method);
  };

  const commitGrupo = (grupo: GrupoId) => {
    const subset: Partial<BorradorMetodoAnalitico> = {};
    for (const clave of CLAVES_NUMERICAS_POR_GRUPO[grupo]) subset[clave] = borrador[clave];
    manejar(candidatoDe(subset, m), grupo);
  };
  const cambiarBorrador = (clave: ClaveNumericaMetodo, texto: string) => setBorrador((b) => ({ ...b, [clave]: texto }));
  const usarDefecto = (clave: ClaveNumericaMetodo, grupo: GrupoId) => manejar(validarCandidato({ ...m, [clave]: d[clave] }), grupo);
  const cambiarLista = (clave: keyof CoachAnalyticsMethod, lista: FuenteCarga[]) =>
    manejar(validarCandidato({ ...m, [clave]: lista }), 'carga');
  const cambiarSeleccion = (valor: BaseCumplimiento) => manejar(validarCandidato({ ...m, cumplimiento_base: valor }), 'cumplimiento');

  const restaurarTodo = async () => {
    const previo = m;
    const ok = await put(null);
    if (ok) toast.toast({ title: 'Método de analíticas por defecto', tone: 'ok', undo: async () => void (await put(previo)) });
  };

  const leerFrescura = (clave: ClaveNumericaMetodo): number => {
    const n = Number(borrador[clave].replace(',', '.'));
    return Number.isFinite(n) ? n : m[clave];
  };
  const previsualizacionFrescura = formatearBandasFrescura(
    leerFrescura('frescura_sobrecarga_hasta'),
    leerFrescura('frescura_optimo_hasta'),
    leerFrescura('frescura_mantener_hasta'),
    leerFrescura('frescura_fresco_hasta'),
  );

  const problemaDe = (clave: string) => problemas.find((p) => p.clave === clave)?.mensaje;

  return (
    <>
      <SettingsSection
        id="analiticas"
        title="Analíticas"
        action={
          <span className="flex items-center gap-2">
            <SaveStatus state={problemas.length > 0 ? 'error' : state} error={problemas[0]?.mensaje ?? error} />
            {setting.is_custom ? (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void restaurarTodo()}>
                Restaurar todo
              </Button>
            ) : null}
          </span>
        }
      >
        <div className="px-4 pt-3.5 pb-1">
          <p className="t-body-sm text-v2-muted">
            Con esto se calculan y se juzgan las analíticas de todos tus atletas: la forma, la frescura, el cumplimiento y
            lo que cuenta como cambio. Lo que no toques sigue el estándar del mercado.
          </p>
        </div>
      </SettingsSection>

      {GRUPOS.map((grupo) => {
        const plegado = grupo.plegadoPorDefecto && !expandido.has(grupo.id);
        const problemaConjunto = grupoActivo === grupo.id ? (problemas.find((p) => p.clave === null)?.mensaje ?? null) : null;
        return (
          <SettingsSection
            key={grupo.id}
            id={`am-grupo-${grupo.id}`}
            title={grupo.titulo}
            bare={plegado}
            action={
              <span className="flex items-center gap-2">
                {problemaConjunto ? <SaveStatus state="error" error={problemaConjunto} /> : null}
                {grupo.plegadoPorDefecto ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={!plegado}
                    aria-controls={`am-grupo-${grupo.id}`}
                    onClick={() =>
                      setExpandido((prev) => {
                        const next = new Set(prev);
                        if (next.has(grupo.id)) next.delete(grupo.id);
                        else next.add(grupo.id);
                        return next;
                      })
                    }
                  >
                    {plegado ? 'Mostrar' : 'Ocultar'}
                  </Button>
                ) : null}
              </span>
            }
          >
            {plegado
              ? null
              : CAMPOS_POR_GRUPO[grupo.id].map((clave) => {
                  const descriptor = DESCRIPTORES_METODO_ANALITICO[clave];
                  if (descriptor.tipo === 'numero') {
                    const k = clave as ClaveNumericaMetodo;
                    return (
                      <FilaNumerica
                        key={clave}
                        clave={k}
                        descriptor={descriptor}
                        valorTexto={borrador[k]}
                        valorGuardado={m[k]}
                        defecto={d[k]}
                        error={problemaDe(clave)}
                        onCambiar={(texto) => cambiarBorrador(k, texto)}
                        onCommit={() => commitGrupo(grupo.id)}
                        onUsarDefecto={() => usarDefecto(k, grupo.id)}
                      />
                    );
                  }
                  if (descriptor.tipo === 'escalera') {
                    const modalidad = descriptor.modalidad;
                    const lista = m[clave] as FuenteCarga[];
                    return (
                      <FilaEscalera
                        key={clave}
                        descriptor={descriptor}
                        modalidad={modalidad}
                        lista={lista}
                        error={problemaDe(clave)}
                        onSubir={(i) => cambiarLista(clave, subirPeldano(lista, i))}
                        onBajar={(i) => cambiarLista(clave, bajarPeldano(lista, i))}
                        onQuitar={(i) => cambiarLista(clave, quitarPeldano(lista, i))}
                        onAnadir={(f) => cambiarLista(clave, anadirPeldano(lista, modalidad, f))}
                      />
                    );
                  }
                  return (
                    <FilaSeleccion key={clave} descriptor={descriptor} valor={m.cumplimiento_base} onCambiar={cambiarSeleccion} />
                  );
                })}
            {!plegado && grupo.id === 'frescura' ? (
              <div className="px-4 py-3">
                <p className="t-body-sm text-v2-muted">
                  Lectura resultante: <span className="t-tnum text-v2-fg">{previsualizacionFrescura}</span>.
                </p>
              </div>
            ) : null}
          </SettingsSection>
        );
      })}
    </>
  );
}

// ── Una fila numérica ────────────────────────────────────────────────────────

function FilaNumerica({
  clave,
  descriptor,
  valorTexto,
  valorGuardado,
  defecto,
  error,
  onCambiar,
  onCommit,
  onUsarDefecto,
}: {
  clave: ClaveNumericaMetodo;
  descriptor: CampoNumero;
  valorTexto: string;
  valorGuardado: number;
  defecto: number;
  error?: string;
  onCambiar: (texto: string) => void;
  onCommit: () => void;
  onUsarDefecto: () => void;
}) {
  const id = `am-${clave}`;
  const divisor = descriptor.escalaDivisor ?? 1;
  const defectoMostrado = formatearNumero(defecto / divisor, descriptor.decimales);
  const negativo = ANALYTICS_METHOD_BOUNDS[clave].min < 0;
  return (
    <SettingRow
      layout="inline"
      label={descriptor.etiqueta}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={error ? 'error' : undefined}
      error={error}
      hint={
        <>
          {descriptor.ayuda} <span className="text-v2-faint t-tnum">Por defecto: {defectoMostrado}.</span>
        </>
      }
    >
      {valorGuardado !== defecto ? (
        <Button size="sm" variant="ghost" onClick={onUsarDefecto}>
          Usar {defectoMostrado}
        </Button>
      ) : null}
      <Input
        id={id}
        inputMode={negativo ? 'text' : descriptor.decimales > 0 ? 'decimal' : 'numeric'}
        value={valorTexto}
        invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onCambiar(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        className="w-20 text-right t-tnum"
      />
      <span className="w-24 whitespace-nowrap t-body-sm text-v2-muted">{descriptor.unidad}</span>
    </SettingRow>
  );
}

// ── Una escalera de carga (una modalidad) ────────────────────────────────────

function FilaEscalera({
  descriptor,
  modalidad,
  lista,
  error,
  onSubir,
  onBajar,
  onQuitar,
  onAnadir,
}: {
  descriptor: CampoEscalera;
  modalidad: ModalidadCarga;
  lista: FuenteCarga[];
  error?: string;
  onSubir: (i: number) => void;
  onBajar: (i: number) => void;
  onQuitar: (i: number) => void;
  onAnadir: (f: FuenteCarga) => void;
}) {
  const disponibles = peldanosDisponibles(lista, modalidad);
  return (
    <SettingRow label={descriptor.etiqueta} hint={descriptor.ayuda} status={error ? 'error' : undefined} error={error}>
      <div className="flex w-full flex-col gap-2">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label={descriptor.etiqueta}>
          {lista.map((f, i) => {
            const nombre = PELDANO_ETIQUETA[f];
            const iconBtn = 'h-5 w-5 rounded-[4px] [&_svg]:size-3.5';
            return (
              <li
                key={f}
                className="inline-flex h-7 items-center gap-0.5 rounded-ctl border border-v2-border bg-v2-surface-2 pr-1 pl-2.5 t-body-sm text-v2-fg"
              >
                <span className="t-tnum text-v2-faint">{i + 1}.</span>
                {nombre}
                <IconButton icon={ArrowUp} label={`Subir ${nombre}`} size="sm" disabled={i === 0} onClick={() => onSubir(i)} className={iconBtn} />
                <IconButton
                  icon={ArrowDown}
                  label={`Bajar ${nombre}`}
                  size="sm"
                  disabled={i === lista.length - 1}
                  onClick={() => onBajar(i)}
                  className={iconBtn}
                />
                <IconButton icon={X} label={`Quitar ${nombre}`} size="sm" disabled={lista.length === 1} onClick={() => onQuitar(i)} className={iconBtn} />
              </li>
            );
          })}
        </ol>
        {disponibles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {disponibles.map((f) => (
              <Button
                key={f}
                size="sm"
                variant="ghost"
                icon={Plus}
                onClick={() => onAnadir(f)}
                className="border-dashed border-v2-border-strong"
              >
                {PELDANO_ETIQUETA[f]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}

// ── El desplegable de cumplimiento ───────────────────────────────────────────

function FilaSeleccion({
  descriptor,
  valor,
  onCambiar,
}: {
  descriptor: CampoSeleccion;
  valor: BaseCumplimiento;
  onCambiar: (v: BaseCumplimiento) => void;
}) {
  const id = 'am-cumplimiento_base';
  return (
    <SettingRow layout="inline" label={descriptor.etiqueta} htmlFor={id} hint={descriptor.ayuda}>
      <Select id={id} aria-label={descriptor.etiqueta} value={valor} onValueChange={onCambiar} options={descriptor.opciones} className="w-56" />
    </SettingRow>
  );
}
