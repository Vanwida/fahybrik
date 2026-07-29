'use client';

// HOY — transcripción fiel de ProfileView.swift (líneas 121-180 y 1459-1670).
// Se copian los tamaños y el copy literales; suavizarlo escondería el problema.
//
// Aquí el alto NO es el problema (el contenido real pasa de 1800 pt y scrollea
// de verdad). Lo que falla es el §4: la sección que existe para enseñar las
// cifras del atleta no enseña ni una, y las filas que sí llevan valor lo pintan
// al mismo tamaño que su etiqueta.

import { Anotacion } from '../../kit-composicion/estados';
import { Card, Hairline, Chevron, Pantalla, Seccion, TabBar } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { AJUSTES_HOY, FILAS_HOY, type EstadoAtleta } from './data';

export function PerfilHoy({ atleta }: { atleta: EstadoAtleta }) {
  return (
    <Pantalla estrategia="llena" tabBar={<TabBar activa="Perfil" />}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.xl}px ${S.xxl}px`,
        }}
      >
        {/* identityCard */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.m }}>
            <span
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'var(--twin-surface-elevated)',
                display: 'grid',
                placeItems: 'center',
                font: 'italic 800 24px/1 var(--twin-font-sans)',
                color: 'var(--twin-accent-text)',
              }}
            >
              {atleta.inicial}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="t-headline-s" style={{ color: 'var(--twin-fg)' }}>
                {atleta.nombre}
              </span>
              <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                {atleta.coach ? `Coach · ${atleta.coach}` : 'Sin coach'}
              </span>
            </div>
          </div>
        </Card>

        {/* settingsCard — SettingValueRow: etiqueta 13 y valor 13. */}
        <div>
          <Card padding={0}>
            {AJUSTES_HOY.map((a, i) => (
              <div key={a.label}>
                {i > 0 ? <Hairline /> : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: '14px' }}>
                  <span style={{ flex: 1, font: '400 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                    {a.label}
                  </span>
                  <span style={{ font: '600 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{a.valor}</span>
                  <Chevron />
                </div>
              </div>
            ))}
          </Card>
          <Anotacion>etiqueta 13 · dato 13 — §4 dice que el dato pesa más</Anotacion>
        </div>

        <Seccion>Rendimiento</Seccion>

        {/* Las cinco puertas. Cada una es su propio CardSurface con 16 pt de
            separación, así que además de no llevar cifra, ocupan mucho. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
          {FILAS_HOY.map((f) => (
            <Card key={f.titulo} padding={0}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: '14px' }}>
                <span
                  aria-hidden
                  style={{
                    width: 26,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--twin-accent-text)',
                    font: '600 16px/1 var(--twin-font-sans)',
                  }}
                >
                  ◷
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{f.titulo}</span>
                  <span style={{ font: '400 11px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                    {f.subtitulo}
                  </span>
                </span>
                <Chevron />
              </div>
            </Card>
          ))}
        </div>
        <Anotacion>
          5 puertas · 0 cifras — y {atleta.fuerza.length + (atleta.vo2 ? 1 : 0)} de ellas tienen el dato cargado
        </Anotacion>

        <Seccion>Entreno</Seccion>
        <Card>
          <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Días de entreno, lesiones, coach de audio…
          </span>
        </Card>
        <Seccion>Dispositivos</Seccion>
        <Card>
          <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Relojes, cinturones, monitores…
          </span>
        </Card>
      </div>
    </Pantalla>
  );
}
