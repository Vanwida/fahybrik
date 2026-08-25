/**
 * Transacción propia o ajena.
 *
 * postgres.js no anida `begin`: el cliente que entrega `sql.begin` expone
 * `savepoint`, no otro `begin`. Un escritor que abre SIEMPRE su transacción
 * revienta si el llamador ya tiene una abierta (`client.begin is not a function`).
 *
 * Si `client` es el pool, abre transacción. Si ya es un `tx`, se mete dentro
 * de la que hay. Quien hoy llama sin tx no cambia de comportamiento.
 */
export async function withOwnOrAmbientTx<T, TClient extends object>(
  client: TClient,
  fn: (tx: TClient) => Promise<T>,
): Promise<T> {
  const maybeBegin = (client as { begin?: (cb: (tx: TClient) => Promise<T>) => Promise<T> }).begin;
  if (typeof maybeBegin === 'function') {
    return maybeBegin.call(client, fn);
  }
  return fn(client);
}
