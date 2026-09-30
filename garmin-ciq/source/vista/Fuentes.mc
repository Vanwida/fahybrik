//
// Las fuentes del vivo: fuentes VECTORIALES del sistema al tamaño exacto en
// píxeles que pide la geometría (fracción del diámetro), con caché para no
// reservar una fuente por fotograma. Si el reloj no trae ninguna cara vectorial
// se cae a la fuente de sistema más cercana por altura.
//
// La bitmap de marca para los números (G11) llega después; en esta fase, sistema.
//
using Toybox.Graphics;
using Toybox.Lang;

module Fuentes {

    // Las caras vectoriales por orden de preferencia. En los números, condensada y negrita.
    const CARAS_NEGRITA = ["RobotoCondensedBold", "BionicBold", "RobotoBold"];
    const CARAS_TEXTO = ["RobotoRegular", "BionicRegular", "RobotoCondensedRegular"];
    // Las fuentes de sistema de la más pequeña a la mayor (respaldo sin cara vectorial).
    const SISTEMA = [Graphics.FONT_XTINY, Graphics.FONT_TINY, Graphics.FONT_SMALL, Graphics.FONT_MEDIUM, Graphics.FONT_LARGE, Graphics.FONT_NUMBER_MILD, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_HOT];

    var cache as Lang.Dictionary = {};

    // Una fuente de `px` píxeles de cuerpo; `negrita` para cifras y palabras clave.
    function de(dc as Graphics.Dc, px as Lang.Number, negrita as Lang.Boolean) as Graphics.FontType {
        var clave = px * 2 + (negrita ? 1 : 0);
        var f = cache.get(clave);
        if (f != null) {
            return f as Graphics.FontType;
        }
        var v = null;
        if (Graphics has :getVectorFont) {
            v = Graphics.getVectorFont({ :face => negrita ? CARAS_NEGRITA : CARAS_TEXTO, :size => px });
        }
        if (v == null) {
            v = sistema(dc, px);
        }
        cache.put(clave, v);
        return v as Graphics.FontType;
    }

    // La fuente de sistema cuyo alto de línea más se acerca a 1,2 × el cuerpo pedido.
    function sistema(dc as Graphics.Dc, px as Lang.Number) as Graphics.FontType {
        var meta = px * 12 / 10;
        var mejor = SISTEMA[0];
        for (var i = 0; i < SISTEMA.size(); i++) {
            mejor = SISTEMA[i];
            if (dc.getFontHeight(SISTEMA[i]) >= meta) {
                break;
            }
        }
        return mejor;
    }
}
