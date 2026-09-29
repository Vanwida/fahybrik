'use client';

// Índice del doble: TODO, del más nuevo al más viejo.
//
// A este índice se viene a buscar «lo que hice ayer» o «dónde está el Hoy», y
// agrupar por zonas lo escondía (una pantalla nueva quedaba dentro de una
// colección, dentro de una zona). Ahora es una sola lista cronológica: arriba
// las colecciones (las direcciones canónicas de un trabajo), debajo TODAS las
// pantallas por día de última modificación. Dentro de un día manda el orden de
// registro al revés: lo último que se añadió sale primero.
// Las pendientes (pantallas de la app sin doble) se pintan apagadas al final:
// el hueco es información, no vergüenza.

import Link from 'next/link';
import { ARCHIVO, COLECCIONES, ESTADO_LABEL, PENDIENTES, SCREENS } from './registry';
import { DISPOSITIVO_LABEL } from './TandaIndex';
import type { TwinMeta } from './types';

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

export function TwinIndex({ localePrefix }: { localePrefix: string }) {
  type Coleccion = (typeof COLECCIONES)[number];
  const enColeccion = new Map<string, Coleccion>();
  for (const c of COLECCIONES) for (const g of c.grupos) for (const id of g.ids) enColeccion.set(id, c);
  const pantallasDe = (c: Coleccion) => SCREENS.filter((s) => enColeccion.get(s.meta.id) === c);
  const fechaDe = (c: Coleccion) => pantallasDe(c).reduce((max, s) => (s.meta.actualizado > max ? s.meta.actualizado : max), '');

  // Colecciones: la más reciente primero.
  const colecciones = [...COLECCIONES].sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)));

  // Todas las pantallas: por fecha desc; a igual fecha, la última registrada primero.
  const ordenadas = [...SCREENS].reverse().sort((a, b) => b.meta.actualizado.localeCompare(a.meta.actualizado));
  const porFecha = new Map<string, TwinMeta[]>();
  for (const s of ordenadas) {
    const lista = porFecha.get(s.meta.actualizado) ?? [];
    lista.push(s.meta);
    porFecha.set(s.meta.actualizado, lista);
  }

  return (
    <div className="studio-index">
      <header className="studio-index-head">
        <p className="studio-label">El doble</p>
        <h1>La app, en la web</h1>
        <p className="studio-desc">
          Réplica viva de la app del atleta: cada pantalla se toca, gira y simula sus conexiones.
          Todo va por fecha, del más nuevo al más viejo. «Espejo» = réplica del Swift a la fecha
          que marca la pantalla; «Propuesta» = mockup de lo aún no construido; «Construida» = ya
          está en Swift, falta re-verificarla; «Pendiente» = pantalla de la app sin doble.
        </p>
      </header>

      <section className="studio-zona">
        <h2 className="studio-label">Colecciones</h2>
        <div className="studio-grid">
          {colecciones.map((c) => (
            <Link key={c.id} href={`${localePrefix}/design/${c.id}`} className="studio-card studio-card-coleccion">
              <div className="studio-card-top">
                <span className="studio-stamp" data-estado="coleccion">
                  Colección
                </span>
                <span className="studio-card-top-right">
                  <span className="studio-device">{pantallasDe(c).length} pantallas</span>
                  <span className="studio-fecha" data-reciente={esReciente(fechaDe(c))}>
                    {fechaRelativa(fechaDe(c))}
                  </span>
                </span>
              </div>
              <h3>{c.titulo} →</h3>
              <p>{c.descripcion}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="studio-zona">
        <h2 className="studio-label">
          Todas las pantallas
          <span className="studio-zona-n"> · {SCREENS.length}</span>
        </h2>
        {[...porFecha.entries()].map(([fecha, metas]) => (
          <div key={fecha} className="studio-dia">
            <span className="studio-dia-fecha" data-reciente={esReciente(fecha)}>
              {fechaRelativa(fecha)} · {fechaCorta(fecha)} · {metas.length}
            </span>
            <div className="studio-lista">
              {metas.map((meta) => (
                <Link key={meta.id} href={`${localePrefix}/design/${meta.id}`} className="studio-fila">
                  <span className="studio-stamp" data-estado={meta.estado}>
                    {ESTADO_LABEL[meta.estado]}
                  </span>
                  <span className="studio-fila-cuerpo">
                    <span className="studio-fila-titulo">{meta.titulo}</span>
                    <span className="studio-fila-desc">{meta.descripcion}</span>
                  </span>
                  <span className="studio-fila-lado">
                    {enColeccion.get(meta.id) && <span className="studio-tag-estrategia">{enColeccion.get(meta.id)!.titulo}</span>}
                    <span className="studio-device">{DISPOSITIVO_LABEL[meta.dispositivo]}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {PENDIENTES.length > 0 && (
        <section className="studio-zona">
          <h2 className="studio-label">
            Sin doble todavía
            <span className="studio-zona-n"> · {PENDIENTES.length}</span>
          </h2>
          <div className="studio-lista studio-lista-apagada">
            {PENDIENTES.map((p) => (
              <div key={p.titulo} className="studio-fila" aria-disabled>
                <span className="studio-stamp" data-estado="pendiente">
                  {ESTADO_LABEL.pendiente}
                </span>
                <span className="studio-fila-cuerpo">
                  <span className="studio-fila-titulo">{p.titulo}</span>
                  <span className="studio-fila-desc">{p.descripcion}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
