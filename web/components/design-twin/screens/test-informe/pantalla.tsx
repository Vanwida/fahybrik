'use client';

// El informe dentro del iPhone del doble. Misma jerarquía que JumpReportView
// y que CmjInforme: identidad → explosivo → carga → LRI → lectura → snapshot.

import { formatJumpHeightCm, formatLri } from '@fahybrid/shared/domain/jump/method';
import { pctPoints, type CmjReport, type ScaleBand } from '@fahybrid/shared/domain/test-report/cmj';

function Scale({ bands }: { bands: ScaleBand[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 10 }}>
      {bands.map((b) => (
        <div
          key={b.level}
          style={{
            borderRadius: 8,
            padding: '8px 2px',
            textAlign: 'center',
            background: b.active ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
            color: b.active ? 'var(--twin-bg)' : 'var(--twin-muted)',
          }}
        >
          <div style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.06em' }}>{b.level}</div>
          <div style={{ font: '500 9px/1.2 var(--twin-font-sans)', marginTop: 4 }}>{b.range_label}</div>
        </div>
      ))}
    </div>
  );
}

function fecha(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

export function InformePantalla({ report }: { report: CmjReport }) {
  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--twin-bg)',
        color: 'var(--twin-fg)',
        padding: '12px 16px 28px',
      }}
    >
      <p style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
        INFORME DEL TEST
      </p>
      <h1
        style={{
          margin: '8px 0 0',
          font: 'italic 800 26px/1 var(--twin-font-sans)',
          letterSpacing: '-0.03em',
        }}
      >
        {report.title}
      </h1>
      {report.date_label ? (
        <p style={{ margin: '6px 0 0', font: '500 12px/1 var(--twin-font-mono)', color: 'var(--twin-muted)' }}>
          {fecha(report.date_label)}
        </p>
      ) : null}

      <section
        style={{
          marginTop: 20,
          padding: 14,
          borderRadius: 14,
          background: 'var(--twin-surface)',
        }}
      >
        <p style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
          SIN CARGA
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
          <p style={{ margin: 0, font: 'italic 800 52px/0.9 var(--twin-font-sans)', color: 'var(--twin-accent)' }}>
            {Math.round(report.unloaded_cm)}
            <span style={{ marginLeft: 6, font: '500 14px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              cm
            </span>
          </p>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, font: 'italic 800 24px/1 var(--twin-font-sans)' }}>{report.height_level}/5</p>
            <p
              style={{
                margin: '4px 0 0',
                font: '600 11px/1 var(--twin-font-sans)',
                letterSpacing: '0.06em',
                color: 'var(--twin-muted)',
              }}
            >
              {report.height_label.toUpperCase()}
            </p>
          </div>
        </div>
        <Scale bands={report.height_scale} />
      </section>

      {report.loaded_cm != null ? (
        <section
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 14,
            background: 'var(--twin-surface)',
          }}
        >
          <p style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
            CON CARGA{report.load_kg != null ? ` · ${Math.round(report.load_kg)} KG` : ''}
          </p>
          <p style={{ margin: '4px 0 0', font: 'italic 800 40px/0.9 var(--twin-font-sans)' }}>
            {Math.round(report.loaded_cm)}
            <span style={{ marginLeft: 6, font: '500 13px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              cm
            </span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            <div>
              <p style={{ margin: 0, font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>Caída</p>
              <p style={{ margin: '4px 0 0', font: '600 14px/1 var(--twin-font-mono)' }}>
                {report.drop_abs_cm != null ? formatJumpHeightCm(report.drop_abs_cm) : '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>Relativa</p>
              <p style={{ margin: '4px 0 0', font: '600 14px/1 var(--twin-font-mono)' }}>
                {report.drop_rel != null ? `${pctPoints(report.drop_rel)} %` : '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Carga / peso
              </p>
              <p style={{ margin: '4px 0 0', font: '600 14px/1 var(--twin-font-mono)' }}>
                {report.load_rel != null ? `${pctPoints(report.load_rel)} %` : '—'}
              </p>
            </div>
          </div>
          {report.lri != null ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
                    LRI
                  </p>
                  <p style={{ margin: '4px 0 0', font: 'italic 800 36px/0.9 var(--twin-font-sans)', color: 'var(--twin-accent)' }}>
                    {formatLri(report.lri)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {report.lri_level != null ? (
                    <p style={{ margin: 0, font: 'italic 800 22px/1 var(--twin-font-sans)' }}>{report.lri_level}/5</p>
                  ) : null}
                  {report.lri_label ? (
                    <p style={{ margin: '4px 0 0', font: '600 11px/1 var(--twin-font-sans)', letterSpacing: '0.06em', color: 'var(--twin-muted)' }}>
                      {report.lri_label.toUpperCase()}
                    </p>
                  ) : null}
                </div>
              </div>
              <Scale bands={report.lri_scale} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          background: 'var(--twin-surface)',
        }}
      >
        <p style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.1em', color: 'var(--twin-muted)' }}>
          LECTURA
        </p>
        <p style={{ margin: '8px 0 0', font: '500 14px/1.35 var(--twin-font-sans)' }}>{report.lectura}</p>
      </section>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'space-between',
          font: '500 12px/1 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
        }}
      >
        {report.body_mass_kg != null ? <span>Peso {Math.round(report.body_mass_kg)} kg</span> : <span />}
        {report.attempts.length > 0 ? (
          <span>
            {report.attempts.length} intentos · se queda {formatJumpHeightCm(report.unloaded_cm)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
