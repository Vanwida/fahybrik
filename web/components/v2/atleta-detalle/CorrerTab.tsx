'use client';

// CÓMO CORRE — las analíticas de carrera, dentro de Rendimiento › Running.
//
// POR QUÉ UNA PESTAÑA PROPIA Y NO UN PANEL DENTRO DE «RENDIMIENTO». Dos razones:
//
// 1 · Responden otra pregunta. «Rendimiento» es el despliegue FISIOLÓGICO —
//     economía, umbral, capacidad anaeróbica, predicción: lecturas sobre el
//     motor del atleta. Estas cinco son lecturas sobre cómo está ATERRIZANDO lo
//     que el entrenador manda (¿le pongo bien los ritmos?, ¿cuánto le cuesta
//     correr cansado?, ¿cuánto volumen lleva?, ¿va apretado?). Mismo atleta,
//     otra pregunta.
// 2 · Se construyeron y no las veía nadie. Colgarlas al final de una pestaña que
//     ya son 3.700 líneas de paneles sería repetir el mismo final por otra vía.
//
// Carga perezosa, como `Rendimiento` y `Carreras`: el cálculo recorre todas las
// sesiones de la ventana y carga el detalle de cada asignación, así que se paga
// al abrir ESTA pestaña y no al abrir la ficha.

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/v2/ui';
import type { RunningAnalyticsPayload } from '@/lib/coach/running-analytics';
import { PanelCalibracion, PanelComprometida, PanelHuella, PanelVolumen } from './correr/paneles';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

const GENERADO_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

export function CorrerTab({ athleteId }: { athleteId: string }) {
  const GENERADO = zonedFormat(useCoachTimeZone(), 'es-ES', GENERADO_OPTS);
  const [analytics, setAnalytics] = useState<RunningAnalyticsPayload | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  // SIN GUARDA DE «SIGO MONTADO», y no es un descuido: es el patrón de las
  // pestañas hermanas (`Rendimiento`, `Carreras`) y la razón es concreta. En
  // desarrollo, StrictMode monta, desmonta y vuelve a montar; el navegador funde
  // las dos peticiones idénticas en UNA respuesta, y esa respuesta la recibe el
  // cierre de la PRIMERA pasada — al que la limpieza ya le puso la bandera a
  // falso. Resultado: la pestaña se quedaba en «Calculando» para siempre con la
  // respuesta ya en la mano. Poner estado sobre un componente desmontado no
  // rompe nada en React 18+, así que la guarda sólo aportaba el fallo.
  // Sin `setEstado('cargando')` al entrar: el estado YA nace en «cargando», y
  // ponerlo aquí sería un setState síncrono dentro del efecto (cascada de
  // renders, y lo canta el lint). No hace falta reiniciarlo por atleta porque
  // `athleteId` es un parámetro de ruta: cambiarlo remonta la ficha entera.
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/running-analytics`, { credentials: 'include' });
      const body = (await res.json().catch(() => null)) as { analytics?: RunningAnalyticsPayload } | null;
      if (!res.ok || !body?.analytics) {
        setEstado('error');
        return;
      }
      setAnalytics(body.analytics);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [athleteId]);

  useEffect(() => {
    // Carga inicial real desde red (no hay forma de saberla en el primer
    // render): no cabe evitar el efecto, así que se silencia la regla aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  if (estado === 'cargando') {
    return (
      <div role="status" aria-label="Calculando cómo corre" className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (estado === 'error' || !analytics) {
    return (
      <ErrorState
        title="No se han podido calcular sus analíticas de carrera"
        onRetry={() => {
          setEstado('cargando');
          void cargar();
        }}
      />
    );
  }

  // Sin nada que leer en ninguna de las cuatro: UNA línea, no cuatro tarjetas vacías (RD1).
  const vacio =
    analytics.calibration.positions.length === 0 &&
    analytics.compromised.points.length === 0 &&
    analytics.pacing_shape.total === 0 &&
    analytics.volume.weeks.every((w) => w.km === 0);
  if (vacio) {
    return (
      <EmptyState
        title={`Sin carreras con datos en ${analytics.window_weeks} semanas`}
        description="llegan al registrar sus carreras con el reloj o con la app"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta text-v2-faint">
        Cómo aterriza lo que le mandas · últimas {analytics.window_weeks} semanas · calculado el{' '}
        {GENERADO.format(new Date(analytics.generated_at_iso))}
      </p>
      <PanelCalibracion analytics={analytics} />
      <PanelComprometida analytics={analytics} />
      <PanelHuella analytics={analytics} />
      <PanelVolumen analytics={analytics} />
    </div>
  );
}
