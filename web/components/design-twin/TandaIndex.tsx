'use client';

// La portada de una COLECCIÓN del doble — una tanda con dirección propia,
// agrupada por su propia lógica y sin mezclarse con el resto del índice.
// Nació para «El entreno, en vivo» (29-jul) y desde el 29-sep sirve también
// a «Analíticas, rehechas»: una sola portada, varias colecciones
// (`COLECCIONES` en registry.ts).

import Link from 'next/link';
import { ESTADO_LABEL, getScreen, type Coleccion } from './registry';

export const DISPOSITIVO_LABEL = { watch: 'Watch', iphone: 'iPhone', escritorio: 'Escritorio', garmin: 'Garmin' } as const;

export function TandaIndex({ coleccion, localePrefix }: { coleccion: Coleccion; localePrefix: string }) {
  return (
    <div className="studio-index">
      <header className="studio-index-head">
        <p className="studio-label">El doble · colección</p>
        <h1>{coleccion.titulo}</h1>
        {coleccion.intro.map((parrafo, i) => (
          <p key={i} className="studio-desc">
            {parrafo}
          </p>
        ))}
      </header>

      {coleccion.grupos.map(({ grupo, ids }) => (
        <section key={grupo} className="studio-zona">
          <h2 className="studio-label">{grupo}</h2>
          <div className="studio-grid">
            {ids.map((id) => {
              const s = getScreen(id);
              if (!s) return null;
              const { meta } = s;
              return (
                <Link key={meta.id} href={`${localePrefix}/design/${meta.id}`} className="studio-card">
                  <div className="studio-card-top">
                    <span className="studio-stamp" data-estado={meta.estado}>
                      {ESTADO_LABEL[meta.estado]}
                    </span>
                    <span className="studio-device">{DISPOSITIVO_LABEL[meta.dispositivo]}</span>
                  </div>
                  <h3>{meta.titulo}</h3>
                  <p>{meta.descripcion}</p>
                  {meta.enApp && (
                    <p className="studio-enapp">
                      <strong>En la app:</strong> {meta.enApp}
                    </p>
                  )}
                  <span className="studio-tags">
                    {meta.soportaHorizontal && <span className="studio-tag">gira ⟳</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <p className="studio-desc">
        <Link href={`${localePrefix}/design`}>← El índice general del doble</Link> (todo lo demás:
        espejos de la app de hoy, otras propuestas y los huecos reconocidos).
      </p>
    </div>
  );
}
