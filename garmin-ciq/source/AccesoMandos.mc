//
// Las dos entradas de texto del login: el teclado del reloj para el email y el
// Picker de 6 columnas para el código. Aquí solo se traducen los eventos del
// reloj a llamadas de Acceso; lo que se hace con ellos lo decide Acceso.
//
// TextPicker: cada dispositivo pone su propio teclado (táctil, o letras que se
// recorren con UP/DOWN en los de botones). Picker: UP/DOWN cambian el dígito,
// START confirma y pasa a la siguiente columna (en la última, acepta) y BACK
// vuelve a la anterior (en la primera, cancela). Es el comportamiento nativo.
//
using Toybox.Graphics;
using Toybox.Lang;
using Toybox.WatchUi;

class EmailDelegate extends WatchUi.TextPickerDelegate {

    var acceso as Acceso;

    function initialize(a as Acceso) {
        TextPickerDelegate.initialize();
        acceso = a;
    }

    // El TextPicker se cierra solo al devolver el control.
    function onTextEntered(text as Lang.String, changed as Lang.Boolean) as Lang.Boolean {
        acceso.alEmail(text);
        return true;
    }

    function onCancel() as Lang.Boolean {
        acceso.alCancelarEmail();
        return true;
    }
}

// Una columna por dígito: 0-9, con el cero visible (el código es texto, no número).
class DigitoFactory extends WatchUi.PickerFactory {

    const DIGITOS = 10;
    var fuente as Graphics.FontType;

    function initialize(font as Graphics.FontType) {
        PickerFactory.initialize();
        fuente = font;
    }

    function getSize() as Lang.Number {
        return DIGITOS;
    }

    function getValue(index as Lang.Number) as Lang.Object or Null {
        return index;
    }

    function getDrawable(index as Lang.Number, selected as Lang.Boolean) as WatchUi.Drawable or Null {
        return new WatchUi.Text({
            :text => index.toString(),
            :color => selected ? Theme.ACCENT : Theme.FG,
            :font => fuente,
            :locX => WatchUi.LAYOUT_HALIGN_CENTER,
            :locY => WatchUi.LAYOUT_VALIGN_CENTER
        });
    }
}

class CodigoPicker extends WatchUi.Picker {

    function initialize() {
        var fabricas = [] as Lang.Array<WatchUi.PickerFactory>;
        for (var i = 0; i < Config.LOGIN_CODE_LENGTH; i++) {
            fabricas.add(new DigitoFactory(Graphics.FONT_MEDIUM));
        }
        var titulo = new WatchUi.Text({
            :text => Rez.Strings.PickerCodigo,
            :color => Theme.MUTED,
            :font => Graphics.FONT_XTINY,
            :locX => WatchUi.LAYOUT_HALIGN_CENTER,
            :locY => WatchUi.LAYOUT_VALIGN_BOTTOM
        });
        Picker.initialize({ :title => titulo, :pattern => fabricas });
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Theme.FG, Theme.BG);
        dc.clear();
        Picker.onUpdate(dc);
    }
}

class CodigoDelegate extends WatchUi.PickerDelegate {

    var acceso as Acceso;

    function initialize(a as Acceso) {
        PickerDelegate.initialize();
        acceso = a;
    }

    function onCancel() as Lang.Boolean {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return true;
    }

    function onAccept(values as Lang.Array) as Lang.Boolean {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        acceso.alCodigo(CodigoDelegate.aTexto(values));
        return true;
    }

    // [0, 1, 2, 3, 4, 5] → "012345". Una columna sin valor cuenta como 0.
    static function aTexto(values as Lang.Array) as Lang.String {
        var texto = "";
        for (var i = 0; i < values.size(); i++) {
            var v = values[i];
            texto += (v instanceof Lang.Number ? v : 0).toString();
        }
        return texto;
    }
}
