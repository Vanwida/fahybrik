// EL LOCALIZADOR DE UNA FOTO DE PERFIL — lo que se guarda y lo que se pinta.
//
// Se prueba aquí y no contra la base porque es una función pura, y porque es la pieza
// donde un fallo no da error: guardar una URL de un dominio ajeno o dejarse la variante
// pegada no revienta nada, simplemente pinta mal o pinta el original de 4 MB dentro de
// un círculo de 28 px, que es justo lo que se vino a arreglar.

import { describe, expect, it } from 'vitest';
import {
  PROFILE_PHOTO_VARIANTS,
  PROFILE_PHOTO_VARIANT_SPECS,
  profilePhotoBaseFrom,
  profilePhotoImageId,
  profilePhotoUrl,
} from '@/lib/profile/photo-source';

const HASH = 'iNtYK9xKmEAC27y3I6q0dA';
const ID = '76b484a7-fa1a-45be-678c-d86c53e33600';
const BASE = `https://imagedelivery.net/${HASH}/${ID}`;

describe('profilePhotoBaseFrom', () => {
  it('acepta la base tal cual', () => {
    expect(profilePhotoBaseFrom(BASE)).toBe(BASE);
  });

  it('quita la variante — es lo que devuelve Cloudflare al confirmar', () => {
    expect(profilePhotoBaseFrom(`${BASE}/public`)).toBe(BASE);
    expect(profilePhotoBaseFrom(`${BASE}/${PROFILE_PHOTO_VARIANTS.ficha}`)).toBe(BASE);
  });

  it('rechaza un dominio que sólo SE PARECE (host entero, nunca «contiene»)', () => {
    expect(profilePhotoBaseFrom(`https://imagedelivery.net.ejemplo.com/${HASH}/${ID}`)).toBeNull();
    expect(profilePhotoBaseFrom(`https://malo-imagedelivery.net/${HASH}/${ID}`)).toBeNull();
    expect(profilePhotoBaseFrom(`https://ejemplo.com/imagedelivery.net/${HASH}/${ID}`)).toBeNull();
  });

  it('exige https', () => {
    expect(profilePhotoBaseFrom(`http://imagedelivery.net/${HASH}/${ID}`)).toBeNull();
  });

  it('rechaza lo que no es un identificador de imagen', () => {
    expect(profilePhotoBaseFrom(`https://imagedelivery.net/${HASH}/no-es-un-uuid`)).toBeNull();
    expect(profilePhotoBaseFrom(`https://imagedelivery.net/${HASH}`)).toBeNull();
    expect(profilePhotoBaseFrom(`https://imagedelivery.net/${HASH}/${ID}/variante/de/mas`)).toBeNull();
  });

  it('rechaza lo vacío, lo nulo y lo que no es una URL', () => {
    for (const raw of [null, undefined, '', '   ', 'no soy una url', '/api/foto/1']) {
      expect(profilePhotoBaseFrom(raw)).toBeNull();
    }
  });

  it('rechaza un texto absurdamente largo antes de intentar parsearlo', () => {
    expect(profilePhotoBaseFrom(`${BASE}/${'x'.repeat(600)}`)).toBeNull();
  });

  it('normaliza el identificador a minúsculas para que la columna no tenga dos formas', () => {
    expect(profilePhotoBaseFrom(`https://imagedelivery.net/${HASH}/${ID.toUpperCase()}`)).toBe(BASE);
  });
});

describe('profilePhotoUrl', () => {
  it('pega la variante pedida', () => {
    expect(profilePhotoUrl(BASE, PROFILE_PHOTO_VARIANTS.lista)).toBe(`${BASE}/avatar160`);
    expect(profilePhotoUrl(BASE, PROFILE_PHOTO_VARIANTS.ficha)).toBe(`${BASE}/avatar480`);
  });

  it('nunca devuelve el original: aunque llegue con variante, la sustituye por la pedida', () => {
    expect(profilePhotoUrl(`${BASE}/public`, PROFILE_PHOTO_VARIANTS.lista)).toBe(`${BASE}/avatar160`);
  });

  it('sin foto no hay URL — se pintan las iniciales', () => {
    expect(profilePhotoUrl(null, PROFILE_PHOTO_VARIANTS.lista)).toBeNull();
    expect(profilePhotoUrl('https://otro-sitio.com/foto.jpg', PROFILE_PHOTO_VARIANTS.lista)).toBeNull();
  });
});

describe('profilePhotoImageId', () => {
  it('saca el identificador que hay que borrar en Cloudflare', () => {
    expect(profilePhotoImageId(BASE)).toBe(ID);
    expect(profilePhotoImageId(`${BASE}/avatar160`)).toBe(ID);
  });

  it('no inventa un identificador a partir de una URL ajena', () => {
    expect(profilePhotoImageId('https://otro-sitio.com/foo/bar')).toBeNull();
    expect(profilePhotoImageId(null)).toBeNull();
  });
});

describe('las variantes declaradas', () => {
  it('son exactamente las que la app sabe pedir', () => {
    expect(PROFILE_PHOTO_VARIANT_SPECS.map((v) => v.id)).toEqual(
      Object.values(PROFILE_PHOTO_VARIANTS),
    );
  });

  it('recortan al cuadrado y tiran los metadatos de la foto', () => {
    for (const spec of PROFILE_PHOTO_VARIANT_SPECS) {
      expect(spec.options.fit).toBe('cover');
      expect(spec.options.width).toBe(spec.options.height);
      expect(spec.options.metadata).toBe('none');
    }
  });

  it('la de listado cubre el círculo más grande de un listado a densidad ×3', () => {
    const lista = PROFILE_PHOTO_VARIANT_SPECS.find((v) => v.id === PROFILE_PHOTO_VARIANTS.lista);
    // 48 px es el mayor tamaño que pide la variante de listado (AthleteAvatar 'lg').
    expect(lista?.options.width).toBeGreaterThanOrEqual(48 * 3);
  });
});
