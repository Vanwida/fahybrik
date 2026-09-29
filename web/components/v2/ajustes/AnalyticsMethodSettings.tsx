'use client';

// El método del coach para las ANALÍTICAS: con esto se calcula y se juzga la
// forma, la frescura, el cumplimiento, el reparto de intensidad y lo que cuenta
// como cambio o como mejora de todos sus atletas (`coach_analytics_method`).
// Cada campo sale del catálogo (`metodo-analiticas/catalogo.ts`) y sus límites
// de `ANALYTICS_METHOD_BOUNDS`: aquí no se copia ni un valor. Guardar valida el
// grupo con el mismo esquema Zod que la API (§ modelo.ts, «por qué por grupo»);
// «Restaurar todo» vuelve a los defectos del producto. El panel del atleta enlaza aquí con
// `/ajustes/metodo#analiticas`.

import { useState } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, Plus, RotateCcw, X } from 'lucide-react';
import {
  ANALYTICS_METHOD_BOUNDS,
  type BaseCumplimiento,
  type BaseSesion,
  type ClaveNumericaMetodo,
  type CoachAnalyticsMethod,
  type FuenteCarga,
} from '@fahybrid/shared/domain/analytics/metodo';
import { FAMILIA_ETIQUETA_ES, FAMILIAS, type Familia } from '@fahybrid/shared/domain/analytics/lectura';
import { Button, Checkbox, IconButton, Input, Select, useToast } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { SaveStatus, sendJson, useSaveState } from './autosave';
import { DESCRIPTORES_METODO_ANALITICO } from './metodo-analiticas/catalogo';
import {
  CAMPOS_POR_GRUPO,
  GRUPOS,
  PELDANO_ETIQUETA,
  type CampoFamilias,
  type CampoNumero,
  type CampoSeleccion,
  type GrupoId,
} from './metodo-analiticas/descriptores';
import {
  alternarFamilia,
  anadirBase,
  anadirPeldano,
  bajarPeldano,
  basesDisponibles,
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
  const cambiarValor = (clave: keyof CoachAnalyticsMethod, valor: FuenteCarga[] | BaseSesion[] | Familia[] | BaseCumplimiento) =>
    manejar(validarCandidato({ ...m, [clave]: valor }), DESCRIPTORES_METODO_ANALITICO[clave].grupo);

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
            <SaveStatus state={state} error={error} />
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
            Con esto se calculan y se juzgan las analíticas de todos tus atletas: la forma, la frescura, el cumplimiento, el
            reparto de intensidad y lo que cuenta como cambio o como mejora. Lo que no toques sigue el estándar del mercado.
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
            {!plegado && problemaConjunto ? (
              <div role="alert" className="flex items-start gap-2 px-4 py-3 t-body-sm text-v2-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                {problemaConjunto}
              </div>
            ) : null}
            {!plegado && grupo.nota ? (
              <div className="px-4 pt-3.5 pb-1">
                <p className="t-body-sm text-v2-muted">{grupo.nota}</p>
              </div>
            ) : null}
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
                      <FilaOrden
                        key={clave}
                        etiqueta={descriptor.etiqueta}
                        ayuda={descriptor.ayuda}
                        lista={lista}
                        nombres={PELDANO_ETIQUETA}
                        disponibles={peldanosDisponibles(lista, modalidad)}
                        error={problemaDe(clave)}
                        onSubir={(i) => cambiarValor(clave, subirPeldano(lista, i))}
                        onBajar={(i) => cambiarValor(clave, bajarPeldano(lista, i))}
                        onQuitar={(i) => cambiarValor(clave, quitarPeldano(lista, i))}
                        onAnadir={(f) => cambiarValor(clave, anadirPeldano(lista, modalidad, f))}
                      />
                    );
                  }
                  if (descriptor.tipo === 'orden') {
                    const lista = m[clave] as BaseSesion[];
                    return (
                      <FilaOrden
                        key={clave}
                        etiqueta={descriptor.etiqueta}
                        ayuda={descriptor.ayuda}
                        lista={lista}
                        nombres={descriptor.etiquetas}
                        disponibles={basesDisponibles(lista)}
                        error={problemaDe(clave)}
                        onSubir={(i) => cambiarValor(clave, subirPeldano(lista, i))}
                        onBajar={(i) => cambiarValor(clave, bajarPeldano(lista, i))}
                        onQuitar={(i) => cambiarValor(clave, quitarPeldano(lista, i))}
                        onAnadir={(b) => cambiarValor(clave, anadirBase(lista, b))}
                      />
                    );
                  }
                  if (descriptor.tipo === 'familias') {
                    const lista = m[clave] as Familia[];
                    const porDefecto = d[clave] as Familia[];
                    return (
                      <FilaFamilias
                        key={clave}
                        clave={clave}
                        descriptor={descriptor}
                        lista={lista}
                        porDefecto={porDefecto}
                        error={problemaDe(clave)}
                        onAlternar={(f) => cambiarValor(clave, alternarFamilia(lista, f))}
                        onUsarDefecto={() => cambiarValor(clave, porDefecto)}
                      />
                    );
                  }
                  return (
                    <FilaSeleccion
                      key={clave}
                      clave={clave}
                      descriptor={descriptor}
                      valor={m[clave] as BaseCumplimiento}
                      onCambiar={(valor) => cambiarValor(clave, valor)}
                    />
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

// ── Una lista ordenada (peldaños de una escalera, bases de una sesión) ────────

function FilaOrden<T extends string>({
  etiqueta,
  ayuda,
  lista,
  nombres,
  disponibles,
  error,
  onSubir,
  onBajar,
  onQuitar,
  onAnadir,
}: {
  etiqueta: string;
  ayuda: string;
  lista: T[];
  nombres: Record<T, string>;
  disponibles: T[];
  error?: string;
  onSubir: (i: number) => void;
  onBajar: (i: number) => void;
  onQuitar: (i: number) => void;
  onAnadir: (f: T) => void;
}) {
  return (
    <SettingRow label={etiqueta} hint={ayuda} status={error ? 'error' : undefined} error={error}>
      <div className="flex w-full flex-col gap-2">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label={etiqueta}>
          {lista.map((f, i) => {
            const nombre = nombres[f];
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
                {nombres[f]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}

// ── Un desplegable de vocabulario cerrado (sobre qué se mide el cumplimiento) ─

function FilaSeleccion({
  clave,
  descriptor,
  valor,
  onCambiar,
}: {
  clave: keyof CoachAnalyticsMethod;
  descriptor: CampoSeleccion;
  valor: BaseCumplimiento;
  onCambiar: (v: BaseCumplimiento) => void;
}) {
  const id = `am-${clave}`;
  return (
    <SettingRow layout="inline" label={descriptor.etiqueta} htmlFor={id} hint={descriptor.ayuda}>
      <Select id={id} aria-label={descriptor.etiqueta} value={valor} onValueChange={onCambiar} options={descriptor.opciones} className="w-56" />
    </SettingRow>
  );
}

// ── Un conjunto de familias de entreno ───────────────────────────────────────

function FilaFamilias({
  clave,
  descriptor,
  lista,
  porDefecto,
  error,
  onAlternar,
  onUsarDefecto,
}: {
  clave: keyof CoachAnalyticsMethod;
  descriptor: CampoFamilias;
  lista: Familia[];
  porDefecto: Familia[];
  error?: string;
  onAlternar: (f: Familia) => void;
  onUsarDefecto: () => void;
}) {
  const id = `am-${clave}`;
  const defectoTexto = porDefecto.map((f) => FAMILIA_ETIQUETA_ES[f]).join(', ');
  const cambiado = JSON.stringify(lista) !== JSON.stringify(porDefecto);
  return (
    <SettingRow
      label={descriptor.etiqueta}
      hintId={`${id}-hint`}
      status={error ? 'error' : undefined}
      error={error}
      hint={
        <>
          {descriptor.ayuda} <span className="text-v2-faint">Por defecto: {defectoTexto}.</span>
        </>
      }
    >
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label={descriptor.etiqueta} aria-describedby={`${id}-hint`}>
        {FAMILIAS.map((f) => {
          const activa = lista.includes(f);
          return (
            <Checkbox
              key={f}
              checked={activa}
              disabled={activa && lista.length === 1}
              onCheckedChange={() => onAlternar(f)}
              label={FAMILIA_ETIQUETA_ES[f]}
            />
          );
        })}
        {cambiado ? (
          <Button size="sm" variant="ghost" onClick={onUsarDefecto}>
            Usar el de siempre
          </Button>
        ) : null}
      </div>
    </SettingRow>
  );
}
