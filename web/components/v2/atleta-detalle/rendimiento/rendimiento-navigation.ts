export const RENDIMIENTO_VISTAS = [
  { id: 'resumen', label: 'Resumen', description: 'Forma y recuperación para decidir el siguiente paso.' },
  { id: 'carga', label: 'Carga', description: 'Semanas, cumplimiento y reparto de intensidad.' },
  { id: 'progreso', label: 'Progreso', description: 'Evolución, marcas y fuerza medida.' },
  { id: 'sesiones', label: 'Sesiones', description: 'Prescrito y realizado, tramo a tramo.' },
  { id: 'carreras', label: 'Carreras', description: 'Preparación, carrera en detalle y objetivos.' },
  { id: 'fisiologia', label: 'Salud', description: 'Historial de check-ins y VO₂ del reloj.' },
  { id: 'zonas', label: 'Zonas y tests', description: 'Calibrar los umbrales y las zonas del atleta.' },
] as const;
export type RendimientoVista = (typeof RENDIMIENTO_VISTAS)[number]['id'];

/** Todo enlace anterior abre la capa que contiene su evidencia. */
export function rendimientoVista(section: string | null): RendimientoVista {
  if (RENDIMIENTO_VISTAS.some((v) => v.id === section)) return section as RendimientoVista;
  const aliases: Record<string, RendimientoVista> = {
    forma: 'resumen', recuperacion: 'resumen', semanas: 'carga', intensidad: 'carga',
    'tiempo-en-zonas': 'carga', records: 'progreso', 'un-rm-medido': 'progreso',
    tramos: 'sesiones', carrera: 'carreras', correr: 'carreras', umbrales: 'zonas',
  };
  return aliases[section ?? ''] ?? 'resumen';
}
