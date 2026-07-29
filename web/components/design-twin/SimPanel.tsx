'use client';

// Panel de dirección: escenarios, vista y cronología. Es la mesa del estudio,
// no la app — vive fuera de .twin-root y habla el idioma de Alex (aquí sí se
// puede decir PM5 o BLE; el copy DE la pantalla sigue siendo el del atleta).

import Link from 'next/link';
import type { LogLine } from './TwinStage';
import type {
  TwinAppearance,
  TwinArquetipo,
  TwinEscenario,
  TwinEstrategia,
  TwinMeta,
  TwinOrientation,
  TwinVista,
} from './types';
import { ESTADO_LABEL } from './registry';

const ARQUETIPO_LABEL: Record<TwinArquetipo, string> = {
  configurar: 'Configurar',
  lista: 'Lista',
  detalle: 'Detalle',
  vacio: 'Vacío',
  'en-vivo': 'En vivo',
};

const ESTRATEGIA_NOTA: Record<TwinEstrategia, string> = {
  llena: 'el contenido ocupa el alto y scrollea SOLO cuando desborda',
  centra: 'poco contenido, deliberado: el aire es simétrico, no una cola',
  previsualiza: 'el sobrante se convierte en el sujeto',
  gobierna: 'un dato manda y escala hasta llenar; el resto se subordina',
};

interface SimPanelProps {
  meta: TwinMeta;
  escenarios: TwinEscenario[];
  escenarioActivo: string;
  onEscenario: (id: string) => void;
  onReplay: () => void;
  orientation: TwinOrientation;
  onOrientation: (o: TwinOrientation) => void;
  appearance: TwinAppearance;
  onAppearance: (a: TwinAppearance) => void;
  vista: TwinVista;
  onVista: (v: TwinVista) => void;
  onFullscreen: () => void;
  logs: LogLine[];
  indexHref: string;
}

export function SimPanel(p: SimPanelProps) {
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <aside className="studio-panel">
      <div className="studio-panel-head">
        <Link href={p.indexHref} className="studio-back">← Índice</Link>
        <span className="studio-stamp" data-estado={p.meta.estado}>{ESTADO_LABEL[p.meta.estado]}</span>
      </div>

      <h1 className="studio-title">{p.meta.titulo}</h1>
      <p className="studio-desc">{p.meta.descripcion}</p>

      {p.meta.composicion && (
        <section aria-label="Composición" className="studio-composicion">
          <h2 className="studio-label">Composición · contrato §6</h2>
          <div className="studio-seg studio-seg-ancho" role="group" aria-label="Antes y después">
            <button type="button" data-active={p.vista === 'hoy' || undefined} onClick={() => p.onVista('hoy')}>
              Cómo está hoy
            </button>
            <button
              type="button"
              data-active={p.vista === 'propuesta' || undefined}
              onClick={() => p.onVista('propuesta')}
            >
              Propuesta
            </button>
          </div>
          <dl className="studio-ficha">
            <dt>Arquetipo</dt>
            <dd>{ARQUETIPO_LABEL[p.meta.composicion.arquetipo]}</dd>
            <dt>Estrategia</dt>
            <dd>
              <code>{p.meta.composicion.estrategia}</code> — {ESTRATEGIA_NOTA[p.meta.composicion.estrategia]}
            </dd>
            <dt>Sujeto</dt>
            <dd>{p.meta.composicion.sujeto}</dd>
            <dt>Hoy</dt>
            <dd className="studio-ficha-mal">{p.meta.composicion.diagnostico}</dd>
            <dt>Se resuelve</dt>
            <dd>{p.meta.composicion.resuelve}</dd>
          </dl>
          <p className="studio-hint">
            En «cómo está hoy» las bandas rayadas y la franja roja se MIDEN del propio layout: el número
            de pt cambia con el escenario.
          </p>
        </section>
      )}

      <section aria-label="Escenarios">
        <h2 className="studio-label">Escenarios</h2>
        <div className="studio-escenarios">
          {p.escenarios.map((e) => (
            <button
              key={e.id}
              type="button"
              className="studio-escenario"
              data-active={e.id === p.escenarioActivo || undefined}
              onClick={() => p.onEscenario(e.id)}
            >
              <span className="studio-escenario-titulo">{e.titulo}</span>
              <span className="studio-escenario-desc">{e.descripcion}</span>
            </button>
          ))}
        </div>
        <button type="button" className="studio-chip" onClick={p.onReplay}>
          ↻ Reproducir de nuevo
        </button>
      </section>

      <section aria-label="Vista">
        <h2 className="studio-label">Vista</h2>
        <div className="studio-vista">
          {p.meta.soportaHorizontal && (
            <div className="studio-seg" role="group" aria-label="Orientación">
              <button
                type="button"
                data-active={p.orientation === 'portrait' || undefined}
                onClick={() => p.onOrientation('portrait')}
              >
                Vertical
              </button>
              <button
                type="button"
                data-active={p.orientation === 'landscape' || undefined}
                onClick={() => p.onOrientation('landscape')}
              >
                Horizontal
              </button>
            </div>
          )}
          {p.meta.dispositivo === 'iphone' && (
            <div className="studio-seg" role="group" aria-label="Apariencia">
              <button
                type="button"
                data-active={p.appearance === 'dark' || undefined}
                onClick={() => p.onAppearance('dark')}
              >
                Oscuro
              </button>
              <button
                type="button"
                data-active={p.appearance === 'light' || undefined}
                onClick={() => p.onAppearance('light')}
              >
                Claro
              </button>
            </div>
          )}
          <button type="button" className="studio-chip" onClick={p.onFullscreen}>
            ⤢ Pantalla completa
          </button>
        </div>
        <p className="studio-hint">
          En el móvil, entra en pantalla completa y gira el teléfono: el doble gira contigo.
        </p>
      </section>

      <section aria-label="Cronología" className="studio-cronologia-wrap">
        <h2 className="studio-label">Cronología</h2>
        {p.logs.length === 0 ? (
          <p className="studio-hint">Los eventos del escenario aparecerán aquí.</p>
        ) : (
          <ol className="studio-cronologia">
            {p.logs.map((l, i) => (
              <li key={i}>
                <span>{fmt(l.t)}</span> {l.linea}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Fuente">
        <h2 className="studio-label">{p.meta.estado === 'espejo' ? 'Espeja' : 'Estado'}</h2>
        {p.meta.estado === 'espejo' ? (
          <ul className="studio-fuentes">
            {p.meta.fuentes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="studio-propuesta-aviso">
            Propuesta — esta pantalla aún no existe en la app. Cuando se construya en Swift, su
            doble pasa a «espejo».
          </p>
        )}
      </section>
    </aside>
  );
}
