// QCWTriad — el artículo en tres líneas: qué es, dónde/cómo se hace y por qué
// importa. Una sola tarjeta con tres filas (etiqueta a la izquierda), no tres
// tarjetas: se lee de un vistazo y en el móvil no ocupa tres pantallas.

import type { ReactNode } from 'react';

export function QCWTriad({ que, como, porque }: { que: ReactNode; como: ReactNode; porque: ReactNode }) {
  return (
    <dl className="triad">
      <div className="qc">
        <dt>Qué es</dt>
        <dd>{que}</dd>
      </div>
      <div className="qc">
        <dt>Cómo</dt>
        <dd>{como}</dd>
      </div>
      <div className="qc">
        <dt>Para qué</dt>
        <dd>{porque}</dd>
      </div>
    </dl>
  );
}
