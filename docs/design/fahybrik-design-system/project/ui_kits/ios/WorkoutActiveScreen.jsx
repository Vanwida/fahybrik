// Workout Active Screen — mirrors ios/FAHYBRIK/Workout/WorkoutActiveView.swift
function WorkoutActiveScreen({ onClose }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: FA_TOKENS.bg, color: FA_TOKENS.fg,
      padding: '8px 24px 24px',
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16 }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: FA_TOKENS.muted, fontFamily: FA_TOKENS.fontSans, fontSize: 14, cursor: 'pointer' }}>← Salir</button>
        <SectionLabel>SLED PUSH + WB CIRCUIT</SectionLabel>
        <span style={{ width: 50 }} />
      </div>

      {/* Big timer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0 24px' }}>
        <SectionLabel>RONDA 3 / 5</SectionLabel>
        <div style={{
          fontFamily: FA_TOKENS.fontMono, fontSize: 88, fontWeight: 600,
          letterSpacing: '-0.04em', lineHeight: 1,
          color: FA_TOKENS.fg, fontVariantNumeric: 'tabular-nums',
        }}>14:32</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ZoneBadge zone="Z4" />
          <span style={{ fontFamily: FA_TOKENS.fontMono, fontSize: 14, color: FA_TOKENS.muted, fontVariantNumeric: 'tabular-nums' }}>168 bpm</span>
        </div>
      </div>

      {/* Current exercise */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${FA_TOKENS.accent}66` }}>
          <SectionLabel style={{ color: FA_TOKENS.accent }}>EN CURSO</SectionLabel>
          <div style={{ fontFamily: FA_TOKENS.fontDisplay, fontStyle: 'italic', fontWeight: 900, fontSize: 26, lineHeight: 1.1 }}>
            Sled Push
          </div>
          <div style={{ fontFamily: FA_TOKENS.fontSans, fontSize: 14, color: FA_TOKENS.muted, fontVariantNumeric: 'tabular-nums' }}>
            50m · 100kg · 3/5
          </div>
        </Card>

        <Card padding={16}>
          <SectionLabel>SIGUIENTE</SectionLabel>
          <div style={{ marginTop: 6, fontFamily: FA_TOKENS.fontSans, fontSize: 16, color: FA_TOKENS.fg }}>
            Wall Balls × 50
          </div>
        </Card>

        <div style={{ flex: 1 }} />

        {/* Bottom actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{
            flex: 1, height: 54, borderRadius: 14, border: `1px solid ${FA_TOKENS.outline}`,
            background: 'transparent', color: FA_TOKENS.fg, cursor: 'pointer',
            fontFamily: FA_TOKENS.fontSans, fontWeight: 600, fontSize: 15,
          }}>⏸ Pausar</button>
          <button style={{
            flex: 2, height: 54, borderRadius: 14, border: 0,
            background: FA_TOKENS.accent, color: '#fff', cursor: 'pointer',
            fontFamily: FA_TOKENS.fontDisplay, fontWeight: 800, fontStyle: 'italic',
            fontSize: 16, letterSpacing: '0.06em',
          }}>✓ COMPLETAR SET</button>
        </div>
      </div>
    </div>
  );
}

window.WorkoutActiveScreen = WorkoutActiveScreen;
