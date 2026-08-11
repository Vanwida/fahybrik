import 'server-only';

// LA FOTO DE PERFIL — quién la sube, dónde vive y cuándo se guarda.
//
// QUIÉN. Hay exactamente DOS clases de persona con foto en el sistema: el entrenador
// (`coaches.avatar_url`) y el atleta (`athletes.avatar_url`). Cada uno sube LA SUYA y
// sólo la suya: el entrenador desde el panel con su sesión, el atleta desde su móvil
// con su bearer. **Un entrenador no sube la foto de un atleta.** No es una restricción
// de permisos que se pueda relajar luego: es que la foto la elige quien sale en ella.
// Por eso el principal no viaja en el cuerpo de ninguna petición — se resuelve de la
// credencial y punto.
//
// DÓNDE. Cloudflare Images, no un fichero nuestro, y el motivo no es el disco: son las
// VARIANTES. La misma foto se pinta en un círculo de 28 px de un listado y en el
// retrato de una ficha; sirviendo el original, cien atletas en pantalla son cien
// ficheros de varios MB por carga. Images entrega el tamaño que se le pide en el
// formato que soporte ese navegador, desde su red y sin pasar por nuestro cómputo.
//
// CUÁNDO SE GUARDA, que es lo único delicado del baile: **nunca antes de que el fichero
// exista**. Se reserva un sitio, el navegador (o el móvil) sube los bytes DIRECTO a
// Cloudflare, y sólo cuando se confirma —preguntándole a Cloudflare si esa imagen está
// de verdad ahí— se escribe la columna. Guardar la URL al reservar dejaría filas
// apuntando a imágenes que nadie llegó a subir, y eso no se distingue después de una
// foto que se rompió.
//
// A DIFERENCIA DEL VÍDEO, no hay que esperar a ningún procesado: una imagen subida a
// Images se entrega ya. Por eso son dos pasos y no tres, y por eso no hay ruta de
// «estado».
//
// QUIÉN ES QUIEN PIDE se resuelve en `photo-principal.ts` y llega aquí ya decidido: este
// módulo sabe de fotos y de columnas, no de cómo se autentica nadie.

import { sql } from '@/lib/db';
import { fileExtension } from '@/lib/chat/schema';
import {
  CloudflareMediaError,
  cloudflareAccountFetch,
  cloudflareAccountFetchRequired,
} from '@/lib/cloudflare/api';
import {
  PROFILE_PHOTO_EXTENSIONS,
  profilePhotoBaseFrom,
  profilePhotoImageId,
} from '@/lib/profile/photo-source';
import type { PhotoPrincipal } from '@/lib/profile/photo-principal';

/**
 * Cuánto vive la dirección de subida. Lo dimensiona el peor caso legítimo: la foto en
 * el tope saliendo de un móvil por datos lentos. Sigue siendo un enlace que muere solo.
 * Cloudflare admite entre 2 minutos y 6 horas.
 */
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

/**
 * `requireSignedURLs: false`, y dicho a propósito: una foto de perfil se pinta en el
 * panel del entrenador y en el móvil del atleta, o sea en dos sitios que tendrían que
 * ir a firmar cada círculo de cada fila de un listado. Lo que la protege es que el
 * identificador es un UUID que no se adivina. Es un interruptor POR IMAGEN que
 * Cloudflare deja voltear por API el día que haga falta, sin migrar nada.
 */
const REQUIRE_SIGNED_URLS = false;

/** De quién es la imagen, anotado EN Cloudflare: `coach:<id>` | `athlete:<id>`. */
function ownerTag(principal: PhotoPrincipal): string {
  return `${principal.kind}:${principal.id}`;
}

/** El sitio reservado en Cloudflare Images para UNA foto. */
export interface ProfilePhotoUploadTarget {
  /** Dirección de un solo uso contra la que el cliente hace `POST` con el fichero. */
  upload_url: string;
  /** El identificador de la imagen. Con él se confirma después. */
  image_id: string;
  expires_at: string;
}

interface ImagesDirectUpload {
  id: string;
  uploadURL: string;
}

interface ImagesDetail {
  id: string;
  meta?: Record<string, string> | null;
  /** Las URL de entrega, una por variante. Todas comparten la misma base. */
  variants?: string[] | null;
}

/**
 * Reserva sitio para UNA foto y devuelve dónde subirla.
 *
 * QUIÉN COMPRUEBA QUÉ, para que no haya dos reglas del mismo eje:
 *   · el FORMATO se comprueba aquí, ANTES de dar dirección de subida, para que un PDF
 *     reciba la negativa en el acto y no después de subir nada;
 *   · el CONTENIDO real lo comprueba Cloudflare al recibir el fichero, que es el único
 *     que ve los bytes;
 *   · el TAMAÑO lo mira el cliente por cortesía (el tope es el de Cloudflare, ver
 *     `photo-source.ts`): los bytes no pasan por nosotros, así que «validarlos» aquí
 *     sería teatro.
 *
 * El dueño queda anotado en la propia imagen (`meta.owner`), que es lo que permite
 * confirmar después que quien la reclama es quien la subió — sin inventar una tabla
 * para un dato que vive dos segundos.
 */
export async function reserveProfilePhotoUpload(args: {
  principal: PhotoPrincipal;
  filename: string;
}): Promise<ProfilePhotoUploadTarget> {
  const ext = fileExtension(args.filename);
  if (!PROFILE_PHOTO_EXTENSIONS.includes(ext)) {
    throw new CloudflareMediaError(
      'invalid_extension',
      `Ese formato no se puede subir. Admitidos: ${PROFILE_PHOTO_EXTENSIONS.join(', ')}.`,
      400,
    );
  }

  const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);

  // Images pide FORMULARIO en la reserva (a diferencia de Stream, que pide JSON), y
  // `metadata` viaja como un JSON dentro de un campo del formulario.
  const form = new FormData();
  form.append('requireSignedURLs', String(REQUIRE_SIGNED_URLS));
  form.append('expiry', expiresAt.toISOString());
  form.append('metadata', JSON.stringify({ owner: ownerTag(args.principal) }));

  const result = await cloudflareAccountFetchRequired<ImagesDirectUpload>(
    '/images/v2/direct_upload',
    { method: 'POST', body: form },
  );

  return {
    upload_url: result.uploadURL,
    image_id: result.id,
    expires_at: expiresAt.toISOString(),
  };
}

/** La imagen tal y como la conoce Cloudflare, o `null` si no existe. */
async function readImage(imageId: string): Promise<ImagesDetail | null> {
  return cloudflareAccountFetch<ImagesDetail>(`/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'GET',
    allowMissing: true,
  });
}

/** Borra una imagen. Que ya no esté no es un fallo: el objetivo era que no estuviera. */
async function deleteImage(imageId: string): Promise<void> {
  await cloudflareAccountFetch(`/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    allowMissing: true,
  });
}

/** Lo que hay hoy en la columna de quien pide. */
async function readStoredPhoto(principal: PhotoPrincipal): Promise<string | null> {
  const id = Number(principal.id);
  const rows =
    principal.kind === 'coach'
      ? await sql<{ avatar_url: string | null }[]>`
          select avatar_url from coaches where id = ${id} limit 1
        `
      : await sql<{ avatar_url: string | null }[]>`
          select avatar_url from athletes where id = ${id} limit 1
        `;
  return rows[0]?.avatar_url ?? null;
}

/**
 * Escribe la columna de quien pide. Dos consultas literales y no una con el nombre de
 * la tabla interpolado: el nombre de una tabla no se parametriza, y armarlo con texto
 * es exactamente la forma de que un día entre por ahí algo que no debía.
 */
async function writeStoredPhoto(principal: PhotoPrincipal, url: string | null): Promise<void> {
  const id = Number(principal.id);
  if (principal.kind === 'coach') {
    await sql`update coaches set avatar_url = ${url}, updated_at = now() where id = ${id}`;
    return;
  }
  await sql`update athletes set avatar_url = ${url}, updated_at = now() where id = ${id}`;
}

/**
 * Da por buena una foto recién subida y la guarda.
 *
 * EL ORDEN IMPORTA y es lo que hace honesto el resultado:
 *   1. se le PREGUNTA a Cloudflare si esa imagen existe. Si no existe, no se guarda
 *      nada: una columna apuntando a una imagen que nadie subió no se distingue
 *      después de una foto rota;
 *   2. se comprueba que la subió QUIEN la reclama (`meta.owner`), o cualquiera con un
 *      identificador ajeno podría colgarse la imagen de otro;
 *   3. la base de entrega se LEE de la respuesta de Cloudflare, nunca se construye
 *      aquí. Es la misma disciplina que con el manifiesto del vídeo: si Cloudflare
 *      devolviera algo con otra forma, se dice ahora y no se deja en la columna un
 *      texto que luego nadie sabe pintar;
 *   4. y sólo al final se retira la foto ANTERIOR. Si ese borrado fallara, lo peor que
 *      queda es una imagen huérfana en Cloudflare, no una fila sin foto.
 */
export async function confirmProfilePhoto(args: {
  principal: PhotoPrincipal;
  image_id: string;
}): Promise<{ avatar_url: string }> {
  const image = await readImage(args.image_id);
  if (!image) {
    throw new CloudflareMediaError('not_found', 'Esa foto no se ha subido.', 404);
  }
  if (image.meta?.owner !== ownerTag(args.principal)) {
    throw new CloudflareMediaError('not_found', 'Esa foto no se ha subido.', 404);
  }

  const base = profilePhotoBaseFrom(image.variants?.[0]);
  if (!base) {
    throw new CloudflareMediaError(
      'storage_unavailable',
      'La foto se subió pero no se pudo localizar.',
      502,
    );
  }

  const previous = profilePhotoImageId(await readStoredPhoto(args.principal));
  await writeStoredPhoto(args.principal, base);
  if (previous && previous !== image.id) await deleteImage(previous);

  return { avatar_url: base };
}

/**
 * Quita la foto: primero deja de referenciarla y después la borra. Si el borrado en
 * Cloudflare fallara, la persona ya se quedó sin foto —que es lo que pidió— y lo que
 * sobra es una imagen suelta, no una fila apuntando a algo que ya no existe.
 */
export async function removeProfilePhoto(principal: PhotoPrincipal): Promise<void> {
  const current = profilePhotoImageId(await readStoredPhoto(principal));
  await writeStoredPhoto(principal, null);
  if (current) await deleteImage(current);
}
