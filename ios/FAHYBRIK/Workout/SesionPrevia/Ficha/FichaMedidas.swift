import SwiftUI

// LAS MEDIDAS DE LA FICHA QUE NO SON UN TOKEN DEL TEMA.
//
// Salen del doble (`kit-ficha/piezas.tsx` y `screens/ficha-ruta/`, el mock aceptado) y se escriben UNA vez,
// aquí, con su porqué. El color, el radio, el toque, el margen de la pantalla y la tipografía son del tema:
// no se repiten. Si el doble cambia una de éstas, cambia aquí en el mismo lote.

enum FichaMedidas {

    // MARK: Ritmo vertical

    /// El aire entre las piezas grandes de la pantalla: cabecera, nota, ruta y panel.
    static let entrePiezas: CGFloat = 18
    /// El aire dentro de un panel (su explicación, su nota, su contenido, su aviso) y entre dos tarjetas.
    static let dentroDelPanel: CGFloat = 14
    /// El aire entre los datos de la línea de meta de la cabecera, y entre sus líneas cuando bajan.
    static let entreDatosDeLaCabecera: CGFloat = 14
    static let entreLineasDeLaCabecera: CGFloat = 6

    // MARK: Tarjetas y filas

    /// El relleno de la tarjeta de un ejercicio; las de una carrera, que llevan menos cosas, respiran más.
    static let rellenoDeTarjeta: CGFloat = 14
    static let rellenoDeTarjetaGrande: CGFloat = 18
    /// El alto mínimo de una fila con miniatura (cabe la miniatura más su aire) y el de una de pareja, que lleva
    /// además la ficha del orden.
    static let altoDeFila: CGFloat = 64
    static let altoDeFilaDeLaPareja: CGFloat = 72

    // MARK: Miniaturas

    /// Las dos miniaturas, 16:9: la de una tarjeta de ejercicio y la de una fila.
    static let anchoDeMiniaturaEnTarjeta: CGFloat = 84
    static let anchoDeMiniaturaEnFila: CGFloat = 64

    // MARK: La dosis grande de una carrera

    /// La dosis de unas series («6 × 800 m»), que comparte tarjeta con el perfil y los datos.
    static let tamanoDeLaDosisDeSeries: CGFloat = 40
    /// La dosis de un rodaje («45:00»), que es lo único grande de su tarjeta.
    static let tamanoDeLaDosisContinua: CGFloat = 52
    /// El alto del dibujo del perfil de tramos.
    static let altoDelPerfil: CGFloat = 84
}
