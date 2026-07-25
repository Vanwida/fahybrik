//
// Tokens visuales. Mismos valores que la web (web/app/globals.css): negro casi
// puro + UN solo acento naranja. Ningún hex suelto en las vistas.
//
using Toybox.Graphics;
using Toybox.Lang;

module Theme {
    const BG = 0x000000;          // el reloj apaga el píxel en AMOLED → menos batería
    const FG = 0xFFFFFF;
    const MUTED = 0xAAAAAA;
    const ACCENT = 0xF06A2A;      // naranja de marca (--accent)
    const ACCENT_ON = 0x000000;   // texto sobre relleno naranja
    const WARN = 0xFF5544;

    // Márgenes en % del ancho: los relojes van de 208 px (fr255s) a 454 px
    // (fenix 8 51 mm) y una pantalla redonda recorta las esquinas. Todo se
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
