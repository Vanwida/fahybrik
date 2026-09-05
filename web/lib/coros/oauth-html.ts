// Human HTML result pages for the COROS OAuth callback (Safari, top-level).
// Same contract as Polar: dark + brand orange, inline, Spanish, no JSON.

const BRAND = {
  bg: '#0A0A0A',
  fg: '#F5F5F5',
  muted: '#A1A1A1',
  accent: '#F06A2A',
  danger: '#F23F3F',
} as const;

export function corosSuccessPage(setCookie: string): Response {
  return corosResultPage({
    status: 200,
    ok: true,
    title: 'Cuenta COROS conectada',
    message: 'Ya puedes volver a la app.',
    setCookie,
  });
}

export function corosErrorPage(status: number, message: string): Response {
  return corosResultPage({ status, ok: false, title: 'No se pudo conectar COROS', message });
}

function corosResultPage(params: {
  status: number;
  ok: boolean;
  title: string;
  message: string;
  setCookie?: string;
}): Response {
  const iconColor = params.ok ? BRAND.accent : BRAND.danger;
  const iconTint = params.ok ? 'rgba(240,106,42,0.12)' : 'rgba(242,63,63,0.12)';
  const icon = params.ok ? '&#10003;' : '&#10005;';
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:${BRAND.bg};color:${BRAND.fg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<main style="max-width:340px;width:100%;text-align:center;">
<div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;background:${iconTint};border:1px solid ${iconColor};color:${iconColor};font-size:28px;line-height:1;">${icon}</div>
<h1 style="margin:0 0 10px;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(params.title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(params.message)}</p>
</main>
</body>
</html>`;
  const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
  if (params.setCookie) headers['set-cookie'] = params.setCookie;
  return new Response(html, { status: params.status, headers });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
