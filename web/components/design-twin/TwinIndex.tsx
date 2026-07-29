'use client';

// Índice del doble: el inventario visual. Zonas → cards con sello de estado.
// Las pendientes se pintan apagadas: el hueco es información, no vergüenza.

import Link from 'next/link';
import { ARCHIVO, ESTADO_LABEL, PENDIENTES, SCREENS } from './registry';
import type { TwinZona } from './types';

const ZONAS: TwinZona[] = [
  'Entreno en vivo',
  'Conexiones y relojes',
  'Marcas y tests',
  'Plan y hoy',
  'Perfil y ajustes',
];

export function TwinIndex({ localePrefix }: { localePrefix: string }) {
  return (
    <div className="studio-index">
      <header className="studio-index-head">
        <p className="studio-label">El doble</p>
        <h1>La app, en la web</h1>
        <p className="studio-desc">
          Réplica viva de la app del atleta: cada pantalla se toca, gira y simula sus conexiones.
          «Espejo» = así está la app hoy (con su fichero Swift al lado). «Propuesta» = mockup de lo
          próximo. «Pendiente» = hueco reconocido. Los mockups nuevos nacen aquí, no en ficheros
          sueltos.
        </p>
        <p className="studio-desc">
          <Link href={`${localePrefix}/design/entreno`}>→ El entreno, en vivo</Link> — la tanda
          inmersiva del 29-jul en su propia dirección, sin mezclar con lo demás.
        </p>
      </header>

      {ZONAS.map((zona) => {
        const activos = SCREENS.filter((s) => s.meta.zona === zona);
        const huecos = PENDIENTES.filter((p) => p.zona === zona);
        if (activos.length === 0 && huecos.length === 0) return null;
        return (
          <section key={zona} className="studio-zona">
            <h2 className="studio-label">{zona}</h2>
            <div className="studio-grid">
              {activos.map(({ meta }) => (
                <Link key={meta.id} href={`${localePrefix}/design/${meta.id}`} className="studio-card">
                  <div className="studio-card-top">
                    <span className="studio-stamp" data-estado={meta.estado}>
                      {ESTADO_LABEL[meta.estado]}
                    </span>
                    <span className="studio-device">{meta.dispositivo === 'watch' ? 'Watch' : 'iPhone'}</span>
                  </div>
                  <h3>{meta.titulo}</h3>
                  <p>{meta.descripcion}</p>
                  <span className="studio-tags">
                    {meta.composicion && (
                      <span className="studio-tag studio-tag-estrategia">{meta.composicion.estrategia}</span>
                    )}
                    {meta.soportaHorizontal && <span className="studio-tag">gira ⟳</span>}
                  </span>
                </Link>
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
