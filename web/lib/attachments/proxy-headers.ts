// LAS CABECERAS DE UN PROXY DE FICHEROS PRIVADOS.
//
// Los blobs se guardan con `access: 'private'`, así que su URL cruda no se puede
// pedir desde fuera y nunca se le entrega a nadie: los bytes pasan por una ruta
// nuestra que comprueba antes quién mira. Estas dos funciones son lo que hace
// que ese paso no rompa nada por el camino —adelantar un vídeo, no repetir bytes
// que el navegador ya tiene— y lo que impide que un fichero privado acabe en una
// caché compartida.
//
// Viven aquí y no dentro de una ruta porque hay DOS proxies con exactamente las
// mismas reglas: los adjuntos del chat y la nota de voz de un comunicado. Con
// una copia en cada uno, el día que se arregle una cabecera en uno de los dos el
// otro se queda con el fallo.

/** Cabeceras que se reenvían HACIA el almacén. `Range` es la que permite
 *  adelantar un audio o un vídeo sin bajárselo entero, y `if-none-match` la que
 *  evita repetir bytes que el cliente ya tiene. */
export function buildUpstreamHeaders(req: Request, token: string): Headers {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of ['range', 'if-none-match', 'if-modified-since'] as const) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/** Cabeceras que se devuelven al cliente. Se copian las que describen el
 *  contenido y las que hacen posible el salto dentro de una pista. El caché es
 *  PRIVADO: el fichero es de una conversación entre dos personas y no puede
 *  quedarse en ninguna caché compartida por el camino. */
export function buildDownstreamHeaders(upstream: Response): Headers {
  const headers = new Headers({
    'cache-control': 'private, max-age=300',
    // El navegador respeta el content-type que declaramos y no se pone a
    // adivinarlo por el contenido. Sin esto, un fichero subido como .txt pero
    // con HTML dentro podría ejecutarse en nuestro propio dominio.
    'x-content-type-options': 'nosniff',
  });
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
  return headers;
}
