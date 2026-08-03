'use client';

// Índice del doble: LO ÚLTIMO primero. A este índice se viene casi siempre a
// buscar «el mockup que hice ayer», así que la primera sección contesta eso —
// los últimos días con sus pantallas, cards para lo más fresco y pastillas
// para los lotes. Debajo, el inventario por zonas (ordenado por recencia, con
// la tanda del entreno colapsada en su colección: tiene dirección propia).
// Las pendientes se pintan apagadas: el hueco es información, no vergüenza.

import Link from 'next/link';
import { ARCHIVO, ESTADO_LABEL, PENDIENTES, SCREENS, TANDA_ENTRENO } from './registry';
import type { TwinMeta, TwinZona } from './types';

const ZONAS: TwinZona[] = [
  'Entreno en vivo',
  'Conexiones y relojes',
  'Marcas y tests',
  'Plan y hoy',
  'Perfil y ajustes',
];

/** Cuántas fechas distintas enseña «Lo último». */
const ULTIMAS_FECHAS = 3;
/** A partir de aquí un día es un lote: pastillas en vez de cards. */
const MAX_CARDS_POR_DIA = 4;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function fechaRelativa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const dias = Math.round((hoy - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 14) return `hace ${dias} días`;
  return fechaCorta(iso);
}

/** «hoy» y «ayer» se pintan en acento: es lo que se viene a buscar. */
function esReciente(iso: string): boolean {
  const rel = fechaRelativa(iso);
  return rel === 'hoy' || rel === 'ayer';
}

function Card({ meta, localePrefix }: { meta: TwinMeta; localePrefix: string }) {
  return (
    <Link href={`${localePrefix}/design/${meta.id}`} className="studio-card">
      <div className="studio-card-top">
        <span className="studio-stamp" data-estado={meta.estado}>
          {ESTADO_LABEL[meta.estado]}
        </span>
        <span className="studio-card-top-right">
          <span className="studio-device">{meta.dispositivo === 'watch' ? 'Watch' : 'iPhone'}</span>
          <span className="studio-fecha" data-reciente={esReciente(meta.actualizado)}>
            {fechaRelativa(meta.actualizado)}
          </span>
        </span>
      </div>
      <h3>{meta.titulo}</h3>
      <p>{meta.descripcion}</p>
      {meta.enApp && (
        <p className="studio-enapp">
          <strong>En la app:</strong> {meta.enApp}
        </p>
      )}
      <span className="studio-tags">
        {meta.composicion && (
          <span className="studio-tag studio-tag-estrategia">{meta.composicion.estrategia}</span>
        )}
        {meta.soportaHorizontal && <span className="studio-tag">gira ⟳</span>}
      </span>
    </Link>
  );
}

export function TwinIndex({ localePrefix }: { localePrefix: string }) {
  const tandaIds = new Set(TANDA_ENTRENO.flatMap((g) => g.ids));
  const tanda = SCREENS.filter((s) => tandaIds.has(s.meta.id));
  const tandaFecha = tanda.reduce((max, s) => (s.meta.actualizado > max ? s.meta.actualizado : max), '');

  // Lo último: las N fechas más recientes con sus pantallas (empates en orden
  // de registro). El día más fresco sale en cards; los lotes, en pastillas.
  const ordenados = [...SCREENS].sort((a, b) => b.meta.actualizado.localeCompare(a.meta.actualizado));
  const porFecha = new Map<string, TwinMeta[]>();
  for (const s of ordenados) {
    const lista = porFecha.get(s.meta.actualizado) ?? [];
    lista.push(s.meta);
    porFecha.set(s.meta.actualizado, lista);
  }
  const ultimos = [...porFecha.entries()].slice(0, ULTIMAS_FECHAS);

  return (
    <div className="studio-index">
      <header className="studio-index-head">
        <p className="studio-label">El doble</p>
        <h1>La app, en la web</h1>
        <p className="studio-desc">
          Réplica viva de la app del atleta: cada pantalla se toca, gira y simula sus conexiones.
          «Espejo» = réplica del Swift <em>a la fecha que marca la card</em> — si el Swift cambió
          después, el espejo está desfasado y la fecha lo delata. «Propuesta» = mockup de lo aún no
          construido (si algo de ello ya existe, la card lo dice en «En la app»). «Construida» = la
          propuesta ya se shipeó en Swift, falta re-verificarla como espejo. «Pendiente» = pantalla
          de la app sin doble. Los mockups nuevos nacen aquí, no en ficheros sueltos.
        </p>
      </header>

      <section className="studio-ultimo">
        <h2 className="studio-label">Lo último</h2>
        {ultimos.map(([fecha, metas], idx) => {
          const enCards = idx === 0 ? metas.slice(0, MAX_CARDS_POR_DIA) : [];
          const enPills = idx === 0 ? metas.slice(MAX_CARDS_POR_DIA) : metas;
          return (
            <div key={fecha} className="studio-dia">
              <span className="studio-dia-fecha" data-reciente={esReciente(fecha)}>
                {fechaRelativa(fecha)} · {fechaCorta(fecha)}
              </span>
              {enCards.length > 0 && (
                <div className="studio-grid">
                  {enCards.map((meta) => (
                    <Card key={meta.id} meta={meta} localePrefix={localePrefix} />
                  ))}
                </div>
              )}
              {enPills.length > 0 && (
                <div className="studio-dia-pills">
                  {enPills.slice(0, 8).map((meta) => (
                    <Link key={meta.id} href={`${localePrefix}/design/${meta.id}`} className="studio-pill">
                      {meta.titulo}
                    </Link>
                  ))}
                  {enPills.length > 8 && (
                    <span className="studio-pill studio-pill-resto">+{enPills.length - 8} más abajo</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {ZONAS.map((zona) => {
        const activos = SCREENS.filter((s) => s.meta.zona === zona && !tandaIds.has(s.meta.id)).sort(
          (a, b) => b.meta.actualizado.localeCompare(a.meta.actualizado)
        );
        const huecos = PENDIENTES.filter((p) => p.zona === zona);
        const conTanda = zona === 'Entreno en vivo';
        if (activos.length === 0 && huecos.length === 0 && !conTanda) return null;
        return (
          <section key={zona} className="studio-zona">
            <h2 className="studio-label">
              {zona}
              <span className="studio-zona-n"> · {activos.length + (conTanda ? tanda.length : 0)}</span>
            </h2>
            <div className="studio-grid">
              {conTanda && (
                <Link href={`${localePrefix}/design/entreno`} className="studio-card studio-card-coleccion">
                  <div className="studio-card-top">
                    <span className="studio-stamp" data-estado="coleccion">
                      Colección
                    </span>
                    <span className="studio-card-top-right">
                      <span className="studio-device">{tanda.length} pantallas</span>
                      <span className="studio-fecha" data-reciente={esReciente(tandaFecha)}>
                        {fechaRelativa(tandaFecha)}
                      </span>
                    </span>
                  </div>
                  <h3>El entreno, en vivo →</h3>
                  <p>
                    La tanda inmersiva completa — antes / en vivo / al terminar / la muñeca — agrupada
                    por su propia lógica en su dirección canónica.
                  </p>
                </Link>
              )}
              {activos.map(({ meta }) => (
                <Card key={meta.id} meta={meta} localePrefix={localePrefix} />
              ))}
              {huecos.map((p) => (
                <div key={p.titulo} className="studio-card studio-card-pendiente" aria-disabled>
                  <div className="studio-card-top">
                    <span className="studio-stamp" data-estado="pendiente">
                      {ESTADO_LABEL.pendiente}
                    </span>
                  </div>
                  <h3>{p.titulo}</h3>
                  <p>{p.descripcion}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <details className="studio-archivo">
        <summary className="studio-label">De dónde venimos — mockups históricos ({ARCHIVO.length})</summary>
        <ul>
          {ARCHIVO.map((a) => (
            <li key={a.titulo}>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer">
                  {a.titulo}
                </a>
              ) : (
                <span>{a.titulo}</span>
              )}
              <span className="studio-archivo-meta">
                {a.fecha}
                {a.nota ? ` · ${a.nota}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
