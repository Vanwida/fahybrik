// LA FOTO DE PERFIL DE UNA PERSONA — una columna, una forma, y el TAMAÑO se pide al
// pintar.
//
// `coaches.avatar_url` y `athletes.avatar_url` guardan UN texto: la BASE de entrega de
// Cloudflare Images, `https://imagedelivery.net/<cuenta>/<imagen>`. **Sin variante.**
//
// POR QUÉ SIN VARIANTE, que es la decisión entera de este fichero: la misma foto se
// pinta en un círculo de 28 px del listado y en el retrato de una ficha. Si la columna
// guardara ya el tamaño, cada vista tendría que reescribir la URL de otro —o peor, se
// serviría el original de 4 MB dentro de un círculo de 28 px, que es exactamente lo que
// pasaba cuando la foto era un fichero nuestro y era el motivo de mudarse. Guardando la
// base, quien pinta pide SU tamaño y Cloudflare entrega ese tamaño, en el formato que
// soporte ese navegador, desde su red.
//
// EL TAMAÑO NO SE ESCRIBE EN NINGÚN COMPONENTE. Se pide por NOMBRE de variante, y los
// dos nombres que existen están aquí abajo. Un componente que quisiera «260 px» tendría
// que añadir una variante, no inventarse una URL: los números sueltos repartidos por
// las vistas son justo lo que hace imposible cambiar de idea después.
//
// ES ISOMÓRFICO: sin `node:*`, sin `server-only` y sin leer una sola variable de
// entorno. Lo aplica el servidor al guardar y el navegador al pintar. Un solo criterio
// para los dos, igual que `lib/exercises/video-source.ts` con el vídeo. Sin una sola
// dependencia, para que el script que crea las variantes en Cloudflare pueda leer de
// aquí los mismos nombres y las mismas medidas que usa la app.

/** El dominio por el que Cloudflare Images entrega las imágenes de cualquier cuenta. */
const DELIVERY_HOST = 'imagedelivery.net';

/**
 * Las variantes que existen, por lo que SON, no por lo que miden. El número va en el
 * nombre para que sea imposible pedir la equivocada sin darse cuenta, pero quien pinta
 * elige por el papel («esto es un listado»), no por el píxel.
 *
 * Se crean en Cloudflare con `infra/scripts/cloudflare-image-variants.ts`, que lee
 * ESTAS constantes: el nombre que usa el código y el que existe en Cloudflare no pueden
 * separarse porque salen del mismo sitio.
 */
export const PROFILE_PHOTO_VARIANTS = {
  /** El círculo de un listado o de una tarjeta: hasta 48 px en pantalla, ×3 de densidad. */
  lista: 'avatar160',
  /** El retrato de una ficha o del propio perfil: 64 px en pantalla y sitio para crecer. */
  ficha: 'avatar480',
} as const;

export type ProfilePhotoVariant =
  (typeof PROFILE_PHOTO_VARIANTS)[keyof typeof PROFILE_PHOTO_VARIANTS];

/**
 * Cómo se recorta cada variante, que es lo que se le manda a Cloudflare al crearlas.
 *
 * · `cover` porque un avatar es un CUADRADO recortado del centro: una foto apaisada
 *   metida en un círculo con `scale-down` deja dos medias lunas vacías.
 * · `metadata: 'none'` porque una foto de gimnasio salida de un móvil lleva EXIF con
 *   coordenadas. La foto es pública; su GPS no tiene por qué serlo.
 */
export const PROFILE_PHOTO_VARIANT_SPECS: readonly {
  id: ProfilePhotoVariant;
  options: { fit: 'cover'; width: number; height: number; metadata: 'none' };
}[] = [
  {
    id: PROFILE_PHOTO_VARIANTS.lista,
    options: { fit: 'cover', width: 160, height: 160, metadata: 'none' },
  },
  {
    id: PROFILE_PHOTO_VARIANTS.ficha,
    options: { fit: 'cover', width: 480, height: 480, metadata: 'none' },
  },
];

/**
 * Formatos admitidos: los que Cloudflare Images ingiere y que además tienen sentido
 * como retrato de una persona.
 *
 * Falta SVG, que Cloudflare sí acepta, y no por descuido: un SVG no es una foto, no se
 * puede recortar a un cuadrado de forma sensata y es el único formato de esta familia
 * que puede llevar dentro algo que no sea una imagen.
 */
export const PROFILE_PHOTO_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

/**
 * Tope de bytes. Es el de CLOUDFLARE, no uno nuestro: cortar antes sería rechazarle a
 * alguien una foto que el alojamiento aceptaría sin problema. Es además un corte amable
 * en el navegador —los bytes no pasan por nosotros—, así que lo único que hace es
 * ahorrarle la subida entera a quien iba a recibir una negativa.
 */
export const PROFILE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** El identificador que emite Cloudflare Images para una imagen: un UUID. */
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El identificador de la cuenta dentro de la URL de entrega (base64 url-safe). */
const ACCOUNT_HASH = /^[A-Za-z0-9_-]{8,64}$/;

/** Cuánto puede medir la base guardada. Holgado sobre su forma real (~80 caracteres). */
export const PROFILE_PHOTO_URL_MAX_LENGTH = 512;

/**
 * La BASE de entrega a partir de cualquier URL de Cloudflare Images —con variante o
 * sin ella—, o `null` si eso no es una foto de perfil nuestra.
 *
 * El host se compara ENTERO, nunca con «contiene»: `imagedelivery.net.ejemplo.com` no
 * es Cloudflare. Es la misma cautela que aplica el localizador del vídeo.
 */
export function profilePhotoBaseFrom(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text.length > PROFILE_PHOTO_URL_MAX_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== DELIVERY_HOST) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  // <cuenta>/<imagen> — y como mucho una variante detrás, que es lo que se descarta.
  if (segments.length < 2 || segments.length > 3) return null;

  const [accountHash, imageId] = segments;
  if (!ACCOUNT_HASH.test(accountHash) || !IMAGE_ID.test(imageId)) return null;

  return `https://${DELIVERY_HOST}/${accountHash}/${imageId.toLowerCase()}`;
}

/** La URL que se pinta: la base más la variante pedida. `null` si no hay foto. */
export function profilePhotoUrl(
  base: string | null | undefined,
  variant: ProfilePhotoVariant,
): string | null {
  const canonical = profilePhotoBaseFrom(base);
  return canonical ? `${canonical}/${variant}` : null;
}

/** El identificador de la imagen dentro de la base, que es lo que se borra en Cloudflare. */
export function profilePhotoImageId(base: string | null | undefined): string | null {
  const canonical = profilePhotoBaseFrom(base);
  if (!canonical) return null;
  return canonical.split('/').pop() ?? null;
}
