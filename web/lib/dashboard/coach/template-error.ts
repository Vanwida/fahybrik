/** Un fallo de la biblioteca de entrenos que la ruta devuelve con su código y estado. */
export class TemplateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}
