'use client';

// LOS GRÁFICOS — el doble los importa del producto: el dibujo canónico vive en
// `web/components/v2/analiticas/graficos/` (subió allí el 29-09 con la pestaña
// Rendimiento del coach). Aquí solo se reexporta para que las propuestas del
// iPhone no cambien de import; pintan lo mismo con su `PIEL_IPHONE`.

export {
  BarraReparto,
  BarrasHueco,
  Chispa,
  Columnas,
  CurvaMejores,
  Divergente,
  Leyenda,
  Lineas,
  PuntosCumplimiento,
  useAncho,
  type Cubo,
  type MarcaVertical,
  type Muestra,
  type SerieLinea,
} from '@/components/v2/analiticas/graficos';
