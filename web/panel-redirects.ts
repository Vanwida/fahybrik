// Las URLs viejas del panel del coach siguen funcionando: cada una redirige a su
// sitio en el mapa nuevo (PLAN-CONSTRUCCION §5, DECISIONS 2026-09-23). Las lee
// next.config.ts; viven aparte para poder probarlas sin cargar la config.
//
// Van con el locale delante (/:locale/…), limitado a los del producto, y son
// temporales (307): el mapa aún puede moverse y un 308 se queda en la caché del
// navegador. La consulta (?tab=…) pasa sola al destino.
//
// El ORDEN importa: Next aplica la primera que casa, así que lo específico va
// antes que lo general (/biblioteca/sesion/nueva antes que /biblioteca/sesion/:id,
// /biblioteca?tab=microciclos antes que /biblioteca).

export interface PanelRedirect {
  source: string;
  destination: string;
  permanent: false;
  has?: { type: 'query'; key: string; value?: string }[];
}

const L = '/:locale(es|en)';

function r(from: string, to: string, has?: PanelRedirect['has']): PanelRedirect {
  return { source: `${L}${from}`, destination: `/:locale${to}`, permanent: false, ...(has ? { has } : {}) };
}

export const PANEL_REDIRECTS: PanelRedirect[] = [
  // Altas → una vista de Hoy.
  r('/altas', '/hoy?vista=altas'),

  // Biblioteca → Programar. Las pestañas viejas que ahora son otra sección, primero.
  r('/biblioteca', '/programar/programas', [{ type: 'query', key: 'tab', value: 'microciclos' }]),
  r('/biblioteca/sesion/nueva', '/programar/biblioteca/entreno/nuevo'),
  r('/biblioteca/sesion/:id', '/programar/biblioteca/entreno/:id'),
  r('/biblioteca/:path*', '/programar/biblioteca/:path*'),

  // Microciclos → Programas (el día suelto ya no es una página: se edita en el programa).
  r('/microciclos/:id/dia/:idx', '/programar/programas/:id'),
  r('/microciclos/:id', '/programar/programas/:id'),
  r('/microciclos', '/programar/programas'),

  // Programar sin sección → Programas.
  r('/programar', '/programar/programas'),

  r('/periodizacion', '/programar/grupos'),
  r('/tests', '/programar/tests'),

  // Negocio.
  r('/leads/:path*', '/negocio/leads/:path*'),
  r('/pagos', '/negocio/cobros'),
  r('/metricas', '/negocio/embudo'),

  // Lo que se configura una vez → Ajustes.
  r('/disponibilidad', '/ajustes/agenda'),
  r('/club', '/ajustes/club'),
  r('/como-entrenas', '/ajustes/metodo'),
  // Oculto hasta que algo lea el cuestionario (DECISIONS 2026-09-23).
  r('/cuestionarios', '/ajustes/perfil'),
];
