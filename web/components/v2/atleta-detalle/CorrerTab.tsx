'use client';

// CÓMO CORRE — la pestaña donde las analíticas de carrera se VEN.
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
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import type { RunningAnalyticsPayload } from '@/lib/coach/running-analytics';
import { PanelCalibracion, PanelCarga, PanelComprometida, PanelHuella, PanelVolumen } from './correr/paneles';
import type { AthleteWeekChipKind } from '@fahybrid/shared/domain/coach/athlete-week-chip';

const GENERADO = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

export function CorrerTab({
  athleteId,
  weekChipKind,
}: {
  athleteId: string;
  weekChipKind: AthleteWeekChipKind;
}) {
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
    void cargar();
  }, [cargar]);

  if (estado === 'cargando') {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[color:var(--v2-muted)]">
        <MIcon name="progress_activity" size={18} className="animate-spin" />
        <span className="text-sm">Calculando cómo corre…</span>
      </div>
    );
  }

  if (estado === 'error' || !analytics) {
    return (
      <EmptyState
        icon="error_outline"
        title="No se pudieron calcular las analíticas de carrera"
        description="Vuelve a abrir la pestaña. Si sigue fallando, es un fallo del servidor y no del atleta."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="max-w-[70ch] text-sm leading-relaxed text-[color:var(--v2-muted)]">
          Cómo está aterrizando lo que le mandas, y cómo corre él. Las tres primeras miran las últimas{' '}
          {analytics.window_weeks} semanas.
        </p>
        <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
          {GENERADO.format(new Date(analytics.generated_at_iso))}
        </span>
      </div>

      <PanelCalibracion analytics={analytics} />
      <PanelComprometida analytics={analytics} />
      <PanelHuella analytics={analytics} />

      <div className="mt-1 flex flex-col gap-5">
        <h3 className="v2-micro">Volumen y carga</h3>
        <PanelVolumen analytics={analytics} />
        <PanelCarga analytics={analytics} weekChipKind={weekChipKind} />
      </div>
    </div>
  );
}
