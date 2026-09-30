// Globales web-estándar que el códec compacto usa (texto UTF-8 y base64). Están
// en Node, en el navegador y en el runtime de Vercel; este paquete compila solo
// con `lib: ES2022`, así que se declaran aquí lo mínimo. Es un fichero de tipos
// que solo entra en el `tsc` de shared: web e infra ya traen sus `lib.dom`.

declare class TextEncoder {
  encode(entrada?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(etiqueta?: string, opciones?: { fatal?: boolean });
  decode(entrada?: Uint8Array): string;
}
declare function btoa(binario: string): string;
declare function atob(base64: string): string;
