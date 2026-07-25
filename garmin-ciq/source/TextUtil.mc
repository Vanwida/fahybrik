//
// Partido de texto en líneas.
//
// Monkey C no trae ni split() ni un dibujado multilínea con ancho máximo, y las
// pantallas van de 208 px redondos a 454 px: cualquier texto escrito a mano se
// saldría en algún reloj. Todo lo que se pinta pasa por aquí.
//
using Toybox.Graphics;
using Toybox.Lang;

module TextUtil {

    const ELLIPSIS = "…";

    function splitWords(text as Lang.String) as Lang.Array {
        var words = [];
        var chars = text.toCharArray();
        var current = "";
        for (var i = 0; i < chars.size(); i++) {
            var c = chars[i];
            if (c == ' ' || c == '\n' || c == '\t') {
                if (!current.equals("")) {
                    words.add(current);
                    current = "";
                }
            } else {
                current += c.toString();
            }
        }
        if (!current.equals("")) {
            words.add(current);
        }
        return words;
    }

    // Recorta una palabra sola que no cabe ni entera (un nombre de entreno largo
    // sin espacios, por ejemplo) en vez de dejar que se salga de la pantalla.
    function truncate(dc as Graphics.Dc, word as Lang.String, font, maxWidth as Lang.Number) as Lang.String {
        if (dc.getTextWidthInPixels(word, font) <= maxWidth) {
            return word;
        }
        var chars = word.toCharArray();
        var out = "";
        for (var i = 0; i < chars.size(); i++) {
            var candidate = out + chars[i].toString();
            if (dc.getTextWidthInPixels(candidate + ELLIPSIS, font) > maxWidth) {
                break;
            }
            out = candidate;
        }
        return out + ELLIPSIS;
    }

    function wrap(dc as Graphics.Dc, text as Lang.String, font, maxWidth as Lang.Number, maxLines as Lang.Number) as Lang.Array {
        var lines = [];
        if (text == null || text.equals("") || maxLines <= 0) {
            return lines;
        }
        var words = splitWords(text);
        var current = "";
        for (var i = 0; i < words.size(); i++) {
            var word = words[i];
            var candidate = current.equals("") ? word : current + " " + word;
            if (dc.getTextWidthInPixels(candidate, font) <= maxWidth) {
                current = candidate;
                continue;
            }
            if (current.equals("")) {
                lines.add(truncate(dc, word, font, maxWidth));
                current = "";
            } else {
                lines.add(current);
                current = word;
            }
            if (lines.size() >= maxLines) {
                return lines;
            }
        }
        if (!current.equals("") && lines.size() < maxLines) {
            lines.add(truncate(dc, current, font, maxWidth));
        }
        return lines;
    }
}
