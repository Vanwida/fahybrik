// Apple Sign-In Screen — first launch.
// Mirrors ios/FAHYBRIK/Auth/AppleSignInView.swift.
function AppleSignInScreen({ onContinue }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: FA_TOKENS.bg, color: FA_TOKENS.fg,
      padding: '0 24px',
    }}>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Wordmark size={56} />
        <span style={{
          fontFamily: FA_TOKENS.fontSans, fontSize: 16, color: FA_TOKENS.muted,
        }}>Entrenar al detalle.</span>
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onContinue} style={{
        height: 54, width: '100%', borderRadius: 14, border: 0, cursor: 'pointer',
        background: '#fff', color: '#000',
        fontFamily: FA_TOKENS.fontSans, fontWeight: 600, fontSize: 17,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <svg width="18" height="22" viewBox="0 0 14 17" fill="currentColor"><path d="M11.7 13.4c-.5 1.2-.8 1.7-1.5 2.7-1 1.5-2.4 3.3-4.1 3.3-1.5 0-1.9-1-4-1-2 0-2.4 1-4 1-1.7 0-3-1.7-4-3.2C-7 13.6-7.3 8.4-5 5.7c1.6-1.9 4.2-3 6.6-3 .7 0 .8.4 2.1.4s1.6-.4 2.4-.4c1.6 0 3.3.9 4.5 2.4-3.9 2.1-3.3 7.6 1.1 8.3z" transform="translate(7 -2)"/></svg>
        Continuar con Apple
      </button>
      <div style={{ height: 32 }} />
    </div>
  );
}

window.AppleSignInScreen = AppleSignInScreen;
