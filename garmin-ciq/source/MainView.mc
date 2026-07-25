//
// La única pantalla. Pinta lo que diga el Controller y no decide nada.
//
// Se dibuja a mano con el Dc en vez de con layouts por dispositivo: son ~45
// relojes entre redondos y rectangulares, de 208 a 454 px. Un bloque centrado y
// calculado en proporciones cabe en todos; 45 ficheros de layout, no.
//
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.WatchUi;

class MainView extends WatchUi.View {

    // Topes de líneas por bloque. Más que esto ya no cabe en un fr255s.
    const MAX_TITLE_LINES = 2;
    const MAX_BODY_LINES = 4;
    const MAX_NOTE_LINES = 2;

    // La píldora de acción, en proporción a la pantalla.
    const PILL_HEIGHT_PCT = 0.16;
    const PILL_BOTTOM_PCT = 0.06;
    const PILL_RADIUS_PCT = 0.08;

    var controller as Controller;

    function initialize(ctrl as Controller) {
        View.initialize();
        controller = ctrl;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight();

        dc.setColor(Theme.FG, Theme.BG);
        dc.clear();

        var contentWidth = Theme.contentWidth(width);
        var gap = Theme.lineGap(height);

        var titleFont = Graphics.FONT_MEDIUM;
        var bodyFont = Graphics.FONT_SMALL;
        var noteFont = Graphics.FONT_XTINY;

        var titleLines = TextUtil.wrap(dc, controller.title, titleFont, contentWidth, MAX_TITLE_LINES);
        var bodyLines = TextUtil.wrap(dc, controller.body, bodyFont, contentWidth, MAX_BODY_LINES);
        var noteLines = TextUtil.wrap(dc, controller.note, noteFont, contentWidth, MAX_NOTE_LINES);

        var hasAction = !controller.action.equals("");
        var pillHeight = (height * PILL_HEIGHT_PCT).toNumber();
        var reservedBottom = hasAction ? pillHeight + (height * PILL_BOTTOM_PCT).toNumber() : 0;

        var block = blockHeight(dc, titleLines, titleFont, bodyLines, bodyFont, noteLines, noteFont, gap);
        var y = ((height - reservedBottom) - block) / 2;
        if (y < gap) {
            y = gap;
        }

        // El nombre del entreno va en naranja; los títulos de estado, en blanco.
        // Un solo acento en pantalla — el mismo criterio que la app y la web.
        var titleColor = (controller.state == AppState.STATE_READY ||
                          controller.state == AppState.STATE_NEEDS_DOWNLOAD)
            ? Theme.ACCENT : Theme.FG;

        y = drawLines(dc, titleLines, titleFont, titleColor, width, y, gap);
        if (titleLines.size() > 0 && bodyLines.size() > 0) {
            y += gap;
        }
        y = drawLines(dc, bodyLines, bodyFont, Theme.FG, width, y, gap);
        if (noteLines.size() > 0) {
            y += gap;
            y = drawLines(dc, noteLines, noteFont, Theme.MUTED, width, y, gap);
        }

        if (hasAction) {
            drawActionPill(dc, width, height, pillHeight);
        }
    }

    function blockHeight(dc as Graphics.Dc, titleLines, titleFont, bodyLines, bodyFont, noteLines, noteFont, gap as Lang.Number) as Lang.Number {
        var total = 0;
        total += titleLines.size() * (dc.getFontHeight(titleFont) + gap);
        total += bodyLines.size() * (dc.getFontHeight(bodyFont) + gap);
        total += noteLines.size() * (dc.getFontHeight(noteFont) + gap);
        return total;
    }

    function drawLines(dc as Graphics.Dc, lines, font, color as Lang.Number, width as Lang.Number, startY as Lang.Number, gap as Lang.Number) as Lang.Number {
        var y = startY;
        var lineHeight = dc.getFontHeight(font);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(width / 2, y, font, lines[i], Graphics.TEXT_JUSTIFY_CENTER);
            y += lineHeight + gap;
        }
        return y;
    }

    function drawActionPill(dc as Graphics.Dc, width as Lang.Number, height as Lang.Number, pillHeight as Lang.Number) as Void {
        var pillWidth = Theme.contentWidth(width);
        var x = (width - pillWidth) / 2;
        var y = height - pillHeight - (height * PILL_BOTTOM_PCT).toNumber();
        var radius = (height * PILL_RADIUS_PCT).toNumber();

        dc.setColor(Theme.ACCENT, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, pillWidth, pillHeight, radius);

        var font = Graphics.FONT_TINY;
        var label = TextUtil.truncate(dc, controller.action, font, pillWidth - radius);
        dc.setColor(Theme.ACCENT_ON, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            width / 2,
            y + (pillHeight - dc.getFontHeight(font)) / 2,
            font,
            label,
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }
}
