//
// Tokens visuales. Un solo acento naranja de marca; negro y grises. Ningún color
// ni proporción suelta por las vistas: todo pasa por aquí.
//
// Los colores son MÚLTIPLOS DE 0x55: los relojes MIP (fr255, fr955, fenix 7) pintan
// 4 niveles por canal (64 colores) y cualquier otro hex se cuantiza a otro color;
// un gris que en MIP se vuelve azul o negro no es un gris (docs/garmin-reloj/kit.md).
//
using Toybox.Graphics;
using Toybox.Lang;

module Theme {
    const BG = 0x000000;          // el reloj apaga el píxel en AMOLED → menos batería
    const FG = 0xFFFFFF;          // tinta
    const MUTED = 0xAAAAAA;       // tinta secundaria
    const ACCENT = 0xFF5500;      // naranja de marca: SOLO acción y trabajo en el aro
    const ACCENT_ON = 0x000000;   // texto sobre relleno naranja
    const WARN = 0xFF5555;
    const CARRIL = 0x555555;      // el carril apagado (banda, aro)
    const BANDA = 0xAAAAAA;       // el tramo del objetivo sobre el carril

    // Márgenes en % del ancho: los relojes van de 218 px (fr255s) a 454 px
    // (fenix 8 47 mm) y una pantalla redonda recorta las esquinas. Todo se
    // calcula relativo, nunca en píxeles fijos.
    const SIDE_MARGIN_PCT = 0.14;
    const LINE_SPACING_PCT = 0.02;

    function sideMargin(width as Lang.Number) as Lang.Number {
        return (width * SIDE_MARGIN_PCT).toNumber();
    }

    function contentWidth(width as Lang.Number) as Lang.Number {
        return width - 2 * sideMargin(width);
    }

    function lineGap(height as Lang.Number) as Lang.Number {
        return (height * LINE_SPACING_PCT).toNumber();
    }
}
