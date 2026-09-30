//
// El LIENZO del vivo: la geometría del círculo y las piezas de dibujo, todo en
// FRACCIONES DEL DIÁMETRO D (port de kit-garmin/geometria.ts y tokens.ts). Nada de
// píxeles fijos ni de colores sueltos: los píxeles salen aquí, de `px` y `cuerpo`.
//
// En un reloj redondo el ancho útil de una fila depende de su ALTURA (la cuerda del
// círculo, menos el aro y su aire). Por eso el pulso es siempre la fila de abajo y
// ningún texto se coloca sin preguntar cuánto ancho tiene a esa altura.
//
// La rejilla del vivo, de arriba abajo:
//   aro       en el borde, radio 0,485 D, grosor 0,035 D
//   contexto  8–22 %     dónde estás
//   héroe     24–60 %    la nota (si la hay) y el número que manda
//   banda     62–70 %    el objetivo con su marca ▲▼ (o la instrucción)
//   secund.   72–84 %    lo que falta / la otra métrica
//   pie       86–94 %    el pulso
//
// Sin trabajo pesado: solo dibuja lo que la lámina ya trae escrito.
//
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.Math;

module Lienzo {

    // El aro de la sesión y el aire entre su borde interior y el texto.
    const ARO_RADIO = 0.485;
    const ARO_GROSOR = 0.035;
    const AIRE_ARO = 0.015;

    // Las filas (fracción de D desde arriba).
    const CONTEXTO_HASTA = 0.22;
    const HEROE_DESDE = 0.24;
    const HEROE_HASTA = 0.60;
    const BANDA_Y = 0.611;
    const SEGUNDA_Y = 0.78;      // centro de la fila secundaria
    const PIE_Y = 0.90;          // centro del pie
    const FILA_NOTA_Y = 0.065;   // lo que se come una nota o etiqueta sobre el héroe

    // Tipo: fracción de D. El suelo (6,2 %) es EL SUELO: ningún texto por debajo.
    const T_HEROE = 0.26;
    const T_SEGUNDO = 0.11;
    const T_TERCERO = 0.085;
    const T_CONTEXTO = 0.07;
    const T_NOTA = 0.062;
    const T_SUELO = 0.062;
    const T_UNIDAD = 0.3;        // fracción del cuerpo del número
    const CAJA_CIFRAS = 0.84;    // alto de la caja de una cifra, en cuerpos
    const CAJA_TEXTO = 1.2;
    const AIRE_UNIDAD = 0.012;
    const AIRE_PIEZAS = 0.022;

    // La pista de la banda.
    const PISTA_ALTO = 0.018;
    const PISTA_HUECO = 0.006;
    const PISTA_MARCA = 0.038;
    const MARCA_ANCHO = 0.012;
    const FLECHA = 0.032;

    const MILESIMAS = 1000;
    const GRADOS_VUELTA = 360;
    const ARCO_INICIO_GRADOS = 90;    // las 12 en punto

    // ── medidas ──────────────────────────────────────────────────────────────

    // Una fracción de D en píxeles.
    function px(frac as Lang.Float, D as Lang.Number) as Lang.Number {
        return (frac * D + 0.5).toNumber();
    }

    // El cuerpo de un texto en píxeles: redondeado y NUNCA por debajo del suelo (se redondea hacia arriba).
    function cuerpo(frac as Lang.Float, D as Lang.Number) as Lang.Number {
        var suelo = (T_SUELO * D).toNumber() + 1;
        var v = px(frac, D);
        return v < suelo ? suelo : v;
    }

    function radioUtil() as Lang.Float {
        return ARO_RADIO - ARO_GROSOR / 2 - AIRE_ARO;
    }

    // Ancho útil de una fila que ocupa de `y` a `y + alto` (fracciones de D), en píxeles: la
    // cuerda del círculo del texto en el borde de la fila MÁS LEJANO al centro.
    function anchoFila(D as Lang.Number, y as Lang.Float, alto as Lang.Float) as Lang.Number {
        var d1 = y - 0.5;
        var d2 = y + alto - 0.5;
        d1 = d1 < 0 ? -d1 : d1;
        d2 = d2 < 0 ? -d2 : d2;
        var d = d1 > d2 ? d1 : d2;
        var r = radioUtil();
        if (d >= r) {
            return 0;
        }
        return (2 * Math.sqrt(r * r - d * d) * D).toNumber();
    }

    // ── texto ────────────────────────────────────────────────────────────────

    function ancho(dc as Graphics.Dc, s as Lang.String, px as Lang.Number, negrita as Lang.Boolean) as Lang.Number {
        return dc.getTextWidthInPixels(s, Fuentes.de(dc, px, negrita));
    }

    // El mayor cuerpo (<= `maxPx`) con el que `s` cabe en `anchoPx`, sin bajar del suelo.
    function cabe(dc as Graphics.Dc, s as Lang.String, negrita as Lang.Boolean, maxPx as Lang.Number, anchoPx as Lang.Number, D as Lang.Number) as Lang.Number {
        var suelo = (T_SUELO * D).toNumber() + 1;
        var w = ancho(dc, s, maxPx, negrita);
        if (w <= anchoPx || w == 0) {
            return maxPx;
        }
        var p = maxPx * anchoPx / w;
        p = p < suelo ? suelo : p;
        w = ancho(dc, s, p, negrita);
        if (w > anchoPx && p > suelo) {
            p = p * anchoPx / w;
            p = p < suelo ? suelo : p;
        }
        return p;
    }

    // Un texto centrado en (x, yCentro), en su cuerpo.
    function texto(dc as Graphics.Dc, s as Lang.String, p as Lang.Number, negrita as Lang.Boolean, x as Lang.Number, y as Lang.Number, justificar as Lang.Number, color as Lang.Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, Fuentes.de(dc, p, negrita), s, justificar | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Una línea de texto centrada en la fila cuyo centro está a `yFrac`, ajustada al ancho útil de esa
    // altura; devuelve el cuerpo usado. Si ni al suelo cabe, se recorta con «…».
    function linea(dc as Graphics.Dc, s as Lang.String, frac as Lang.Float, negrita as Lang.Boolean, yFrac as Lang.Float, color as Lang.Number) as Lang.Number {
        var D = dc.getWidth();
        var maxPx = cuerpo(frac, D);
        var alto = maxPx * CAJA_TEXTO / D;
        var disp = anchoFila(D, yFrac - alto / 2, alto);
        var p = cabe(dc, s, negrita, maxPx, disp, D);
        var t = s;
        if (ancho(dc, s, p, negrita) > disp) {
            t = recortar(dc, s, p, negrita, disp);
        }
        texto(dc, t, p, negrita, D / 2, px(yFrac, D), Graphics.TEXT_JUSTIFY_CENTER, color);
        return p;
    }

    // Recorta por el final con «…» hasta que quepa.
    function recortar(dc as Graphics.Dc, s as Lang.String, p as Lang.Number, negrita as Lang.Boolean, anchoPx as Lang.Number) as Lang.String {
        var cs = s.toCharArray();
        var n = cs.size();
        while (n > 1) {
            n--;
            var t = s.substring(0, n) + "…";
            if (ancho(dc, t, p, negrita) <= anchoPx) {
                return t;
            }
        }
        return "…";
    }

    // La primera de las variantes (de la más larga a la más corta) que cabe en la fila del contexto.
    function elegirVariante(dc as Graphics.Dc, variantes as Lang.Array<Lang.String>, frac as Lang.Float, yFrac as Lang.Float) as Lang.String {
        var D = dc.getWidth();
        var p = cuerpo(frac, D);
        var alto = p * CAJA_TEXTO / D;
        var disp = anchoFila(D, yFrac - alto / 2, alto);
        var suelo = cuerpo(T_SUELO, D);
        for (var i = 0; i < variantes.size(); i++) {
            if (ancho(dc, variantes[i], suelo, false) <= disp) {
                return variantes[i];
            }
        }
        return variantes.size() > 0 ? variantes[variantes.size() - 1] : "";
    }

    // ── piezas ───────────────────────────────────────────────────────────────

    // El aro de la sesión: el carril entero y, encima, lo hecho (milésimas) desde las 12 en punto.
    function aro(dc as Graphics.Dc, milesimas as Lang.Number, color as Lang.Number) as Void {
        var D = dc.getWidth();
        var c = D / 2;
        var r = px(ARO_RADIO, D);
        dc.setPenWidth(px(ARO_GROSOR, D));
        dc.setColor(Theme.CARRIL, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(c, c, r);
        if (milesimas <= 0) {
            return;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        if (milesimas >= MILESIMAS) {
            dc.drawCircle(c, c, r);
        } else {
            dc.drawArc(c, c, r, Graphics.ARC_CLOCKWISE, ARCO_INICIO_GRADOS, ARCO_INICIO_GRADOS - milesimas * GRADOS_VUELTA / MILESIMAS);
        }
        dc.setPenWidth(1);
    }

    // Un triángulo ▲ (arriba) o ▼ centrado en (x, y).
    function flecha(dc as Graphics.Dc, x as Lang.Number, y as Lang.Number, lado as Lang.Number, arriba as Lang.Boolean, color as Lang.Number) as Void {
        var h = lado / 2;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        if (arriba) {
            dc.fillPolygon([[x - h, y + h], [x + h, y + h], [x, y - h]]);
        } else {
            dc.fillPolygon([[x - h, y - h], [x + h, y - h], [x, y + h]]);
        }
    }

    // El corazón del pulso, centrado en (x, y).
    function corazon(dc as Graphics.Dc, x as Lang.Number, y as Lang.Number, tam as Lang.Number, color as Lang.Number) as Void {
        var r = tam / 4;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x - r, y - r / 2, r);
        dc.fillCircle(x + r, y - r / 2, r);
        dc.fillPolygon([[x - tam / 2 + 1, y - r / 4], [x + tam / 2 - 1, y - r / 4], [x, y + tam / 2]]);
    }

    // La pista de la banda: carril, el tramo del objetivo y la marca de dónde estás (milésimas).
    function pista(dc as Graphics.Dc, yTop as Lang.Number, x0 as Lang.Number, largo as Lang.Number, desde as Lang.Number, hasta as Lang.Number, marca as Lang.Number, alto as Lang.Number, marcaAlto as Lang.Number, marcaAncho as Lang.Number) as Void {
        dc.setColor(Theme.CARRIL, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x0, yTop, largo, alto);
        var a = x0 + largo * desde / MILESIMAS;
        var b = x0 + largo * hasta / MILESIMAS;
        dc.setColor(Theme.BANDA, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(a, yTop, b > a ? b - a : 1, alto);
        if (marca >= 0) {
            var m = x0 + largo * marca / MILESIMAS;
            dc.setColor(Theme.FG, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(m - marcaAncho / 2, yTop - (marcaAlto - alto) / 2, marcaAncho, marcaAlto);
        }
    }
}
