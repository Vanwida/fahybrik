// cloudflare-image-variants.ts — declara en Cloudflare Images las variantes con las
// que la app pide las fotos de perfil.
//
// POR QUÉ EXISTE. Una variante es un nombre («avatar160») que Cloudflare traduce a un
// recorte y un tamaño. El nombre vive en el código y el recorte vive en la cuenta de
// Cloudflare: si se crean a mano por el panel, esos dos sitios se separan el primer día
// que alguien toca uno sin acordarse del otro, y el síntoma es una foto que sale
// deformada o directamente un 404 que nadie sabe de dónde viene.
//
// Este script lee LAS MISMAS constantes que usa la app
// (`web/lib/profile/photo-source.ts`, sin dependencias justo para poder leerse desde
// aquí), así que no hay dos verdades: el que pinta y el que crea salen del mismo sitio.
//
// Es IDEMPOTENTE, y hay que apañarlo a mano porque Cloudflare no tiene un verbo que
// «cree o actualice»: se intenta crear y, si ya existe (5409), se actualiza. Correr
// después de tocar `PROFILE_PHOTO_VARIANT_SPECS`, y una vez al aprovisionar una cuenta
// nueva.
//
// Corre con `node` a secas y no con tsx, y eso es deliberado: las constantes viven en
// `web/`, que es un paquete CommonJS, y tsx transpila ese fichero a CJS — desde donde
// un importador ESM no ve sus exportaciones con nombre. Node quita los tipos de forma
// nativa y lee el módulo tal cual, que es justo lo que hace falta para leer una
// constante de otro paquete del workspace.
//
// Uso:
//   set -a; source ~/.openclaw/credentials/vanwida-tokens.env; set +a
//   cd infra && pnpm cloudflare:variants
//   cd infra && pnpm cloudflare:variants --dry-run

import { PROFILE_PHOTO_VARIANT_SPECS } from '../../web/lib/profile/photo-source.ts';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/** Cada variante conserva la política de firma de SU imagen: no se abre una puerta
 *  lateral por la que una imagen firmada se sirviera sin firmar. */
const NEVER_REQUIRE_SIGNED_URLS = false;

const dryRun = process.argv.includes('--dry-run');

function credenciales(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      'Faltan CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN en el entorno. ' +
        'Cárgalos con: set -a; source ~/.openclaw/credentials/vanwida-tokens.env; set +a',
    );
  }
  return { accountId, token };
}

/** El código con el que Cloudflare dice «ese nombre ya está cogido». */
const ALREADY_EXISTS = 5409;

interface VariantsResponse {
  success: boolean;
  errors?: { code: number; message: string }[];
}

async function llamar(
  url: string,
  method: 'POST' | 'PATCH',
  token: string,
  body: unknown,
): Promise<VariantsResponse> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as VariantsResponse;
  return parsed.success ? parsed : { ...parsed, errors: parsed.errors ?? [{ code: res.status, message: `respuesta ${res.status}` }] };
}

async function main(): Promise<void> {
  const { accountId, token } = credenciales();
  const base = `${CLOUDFLARE_API_BASE}/accounts/${accountId}/images/v1/variants`;

  for (const spec of PROFILE_PHOTO_VARIANT_SPECS) {
    const { width, height, fit } = spec.options;
    const resumen = `${spec.id} — ${width}×${height} ${fit}`;
    if (dryRun) {
      process.stdout.write(`[variants] dry-run · ${resumen}\n`);
      continue;
    }

    const payload = {
      id: spec.id,
      options: spec.options,
      neverRequireSignedURLs: NEVER_REQUIRE_SIGNED_URLS,
    };

    let resultado = await llamar(base, 'POST', token, payload);
    let verbo = 'creada';
    if (!resultado.success && resultado.errors?.some((e) => e.code === ALREADY_EXISTS)) {
      resultado = await llamar(`${base}/${spec.id}`, 'PATCH', token, payload);
      verbo = 'al día';
    }
    if (!resultado.success) {
      throw new Error(
        `No se pudo declarar la variante ${spec.id}: ${
          resultado.errors?.[0]?.message ?? 'error desconocido'
        }`,
      );
    }
    process.stdout.write(`[variants] ✓ ${resumen} (${verbo})\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
