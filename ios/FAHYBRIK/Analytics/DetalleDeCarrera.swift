import SwiftUI

// EL DETALLE DE CARRERA — las cuatro lecturas que el servidor mandaba y nadie
// dibujaba.
//
// QUÉ SON Y DE DÓNDE SALEN
// ------------------------
// `history.umbral`, `history.zonas_ritmo`, `history.cadencia` y `history.por_tipo`
// viajan en `/analytics/running/progress` desde el primer día. El cliente decidía
// no decodificarlas, y no fue un olvido: con un contrato de raíz fijada, sumar una
// lectura cuesta tocar el tipo, el ensamblador y el modelo Codable a la vez, así
// que el coste se pagaba entero aunque nadie la pintara. Con el rediseño de la
// pestaña anterior —que servía quince lecturas donde ésta enseñaba siete— estas
// cuatro se quedaron fuera.
//
// EL VEREDICTO ES LA PUERTA A LOS DATOS, NO SU SUSTITUTO. Ninguna de las cuatro
// alimenta el veredicto: son la DENSIDAD que crece según se baja por la pantalla,
// y por eso van al final, después de la evidencia que sí lo sostiene.
//
// CADA UNA PASA EL FILTRO DE LA PANTALLA:
//   · El umbral SOSTIENE: es el ancla de la que cuelgan las zonas y el plan, y
//     cuando está sin revisar PIDE confirmarlo.
//   · Las zonas SOSTIENEN: son lo que hace legible cualquier otro ritmo de aquí.
//   · La cadencia SOSTIENE: es la única lectura de técnica que tenemos.
//   · Las medias por tipo SOSTIENEN el tercer peldaño del veredicto, que hasta hoy
//     se apoyaba en un número que la pantalla no podía enseñar.
//
// LO QUE NO SE PINTA, NO EXISTE. Sin perfil de ritmo no hay bloque de umbral ni de
// zonas; sin una sola semana con cadencia no hay bloque de cadencia. No se dibuja
// un hueco: el contrato de carrera declara sus faltas en `coverage`, y ninguna de
// estas cuatro tiene casilla allí — así que aquí la app se calla, que es la regla.

struct DetalleDeCarrera: View {
    let history: RunningHistory

    /// El mismo reparto que el resto de la pantalla: 24 dentro de un grupo. Se
    /// agrupa con aire, nunca con una raya.
    private static let dentro: CGFloat = 24

    /// ¿Hay algo? Lo pregunta la pantalla antes de reservar el aire de un grupo
    /// entero: un separador de 48 pt delante de nada es un hueco, no una sección.
    var hayAlgo: Bool {
        history.umbral != nil || !history.zonasRitmo.isEmpty
            || !history.cadencia.isEmpty || !history.porTipo.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Self.dentro) {
            if let umbral = history.umbral {
                BloqueDeLectura(etiqueta: "Tu umbral") {
                    UmbralDeRitmo(umbral: umbral)
                }
            }
            if !history.zonasRitmo.isEmpty {
                BloqueDeLectura(etiqueta: "Tus zonas de ritmo") {
                    EscaleraDeZonas(zonas: history.zonasRitmo)
                }
            }
            if !history.cadencia.isEmpty {
                BloqueDeLectura(etiqueta: "Cadencia") {
                    CadenciaSemanal(puntos: history.cadencia)
                }
            }
            if !history.porTipo.isEmpty {
                BloqueDeLectura(etiqueta: "Por tipo de sesión") {
                    MediasPorTipo(tipos: history.porTipo)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - El umbral, con su procedencia

/// EL ANCLA DE RITMO, y de dónde sale. Un umbral sin procedencia es un número que
/// el atleta no puede discutir y el coach no puede corregir: por eso la fuente no
/// es adorno, es la mitad de la lectura.
///
/// «SIN REVISAR» NO ES «FALSO». Un umbral derivado en el alta es real —sale de una
/// marca suya— pero nadie lo ha confirmado, y esas son dos afirmaciones distintas.
/// Se dice, y con eso el atleta sabe si fiarse del todo o ir a hacer el test.
struct UmbralDeRitmo: View {
    let umbral: UmbralRitmo

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            // EL VDOT ES DATO, NO PROSA. Metido en el pie se comía la mitad del
            // presupuesto de palabras; al lado del ritmo es lo que es —la otra
            // lectura del mismo motor— y el pie queda para la procedencia, que es
            // lo único que hace falta escribir. Es la misma pareja de cifras con la
            // que la maqueta pone los días y el tiempo previsto de una carrera.
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xl) {
                if let ritmo = umbral.ritmoSKm, ritmo > 0 {
                    CifraDeBloque(valor: Formato.ritmo(ritmo, .porKm), unidad: nil, tam: 44)
                }
                if let vdot = umbral.vdot, vdot > 0 {
                    // Sin ritmo, el VDOT sube a cifra grande: esconderlo porque
                    // falta la otra dejaría el bloque mudo teniendo dato.
                    CifraDeBloque(valor: Formato.esDecimal(vdot, decimals: 0),
                                  unidad: "VDOT", tam: umbral.ritmoSKm == nil ? 44 : 26)
                }
            }
            if let pie {
                Text(pie)
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// EL PIE, DE OCHO PALABRAS COMO TECHO: de dónde sale el ancla, y nada más.
    ///
    /// «Sin revisar» solo se dice cuando NO se deduce ya de la fuente: un umbral
    /// estimado en el alta es, por definición, uno que nadie ha confirmado, y
    /// escribir las dos cosas es decir lo mismo dos veces con el presupuesto de
    /// palabras contado. El rótulo de la marca lo escribe el servidor («de tu
    /// 10 km»), así que aquí no se inventa ninguna frase.
    private var pie: String? {
        var partes: [String] = []
        if umbral.vdot != nil, let desde = umbral.vdotDesde, !desde.isEmpty { partes.append(desde) }
        let derivado = umbral.origen == "onboarding_auto"
        if let fuente = Self.fuente(umbral.origen) { partes.append(fuente) }
        if umbral.sinRevisar, !derivado { partes.append("sin revisar") }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// De dónde salió el ancla, en palabras. `origen` es una clave estable del
    /// servidor y una clave no se le enseña a nadie: se traduce o no se escribe.
    static func fuente(_ origen: String?) -> String? {
        switch origen {
        case "coach_test":      return "test con tu coach"
        case "athlete_test":    return "tu test"
        case "onboarding_auto": return "estimado en el alta"
        default:                return nil
        }
    }
}

// MARK: - Las zonas de ritmo

/// LA ESCALERA DE BANDAS. Aquí el color SÍ es dato —lo que se mide ES la zona—, y
/// además es el del PERFIL DEL ATLETA: lo declara el servidor con su hexadecimal,
/// así que se respeta en vez de recolorearlo con nuestra paleta.
///
/// El color va solo en la muestra, nunca en el texto: un hexadecimal guardado por
/// un coach no tiene por qué mantener el contraste contra el lienzo, y una etiqueta
/// ilegible es peor que una sin color. El mismo criterio que la paleta de zonas de
/// pulso ya documenta.
struct EscaleraDeZonas: View {
    let zonas: [ZonaRitmo]

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(zonas.sorted { $0.sortOrder < $1.sortOrder }) { zona in
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Self.tinta(zona.color))
                        .frame(width: 10, height: 10)
                    Text(zona.label)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                    Spacer(minLength: Theme.Spacing.s)
                    if let banda = Self.banda(zona) {
                        Text(banda)
                            .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// LA BANDA, ESCRITA COMO SE LEE: del ritmo rápido al lento. Una banda abierta
    /// —la más suave no tiene techo por abajo— se dice abierta en vez de fingir un
    /// borde que no existe.
    static func banda(_ zona: ZonaRitmo) -> String? {
        let rapido = zona.fastS.flatMap { $0 > 0 ? Formato.ritmoCifras($0) : nil }
        let lento = zona.slowS.flatMap { $0 > 0 ? Formato.ritmoCifras($0) : nil }
        switch (rapido, lento) {
        case let (r?, l?): return "\(r) – \(l)"
        // El guion largo del rango es EN DASH (U+2013), no el menos ni el guion:
        // es el signo de un intervalo y es el que ya usa el resto de la app.
        case let (r?, nil): return "desde \(r)"
        case let (nil, l?): return "hasta \(l)"
        case (nil, nil): return nil
        }
    }

    /// El hexadecimal del perfil, leído. Ante cualquier cosa que no sea un color de
    /// seis o tres cifras se cae a la tinta apagada: una muestra gris dice «no sé
    /// de qué color es esta banda», y eso es cierto. Inventar un color no lo sería.
    ///
    /// Vive aquí, privado, porque este es el único sitio de la app donde un color
    /// llega por el cable — el resto salen de la paleta del tema.
    static func tinta(_ hex: String) -> Color {
        var limpio = hex.trimmingCharacters(in: .whitespaces)
        if limpio.hasPrefix("#") { limpio.removeFirst() }
        // «f2a» es la forma corta de «ff22aa»: cada cifra se duplica.
        if limpio.count == 3 { limpio = limpio.map { "\($0)\($0)" }.joined() }
        guard limpio.count == 6, let valor = UInt32(limpio, radix: 16) else {
            return Theme.Color.faint
        }
        return Color(
            red: Double((valor >> 16) & 0xFF) / 255,
            green: Double((valor >> 8) & 0xFF) / 255,
            blue: Double(valor & 0xFF) / 255
        )
    }
}

// MARK: - La cadencia

/// LA ÚNICA LECTURA DE TÉCNICA QUE TENEMOS, semana a semana.
///
/// SIN DELTA Y SIN COLOR, A PROPÓSITO. Los deltas de esta pantalla llegan SERVIDOS
/// porque recalcularlos aquí sería tener dos motores para el mismo número; la
/// cadencia no trae el suyo, así que no se fabrica. Y no se tiñe porque el
/// contrato no dice qué cadencia es buena para ESTE atleta — depende de su talla,
/// su terreno y su ritmo, y eso es del coach. Lo que sí se ve es de dónde salió: el
/// fantasma de la línea lo dibuja sin una palabra.
struct CadenciaSemanal: View {
    let puntos: [PuntoSemana]

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let ultima = puntos.last {
                CifraDeBloque(valor: Formato.esDecimal(ultima.valor, decimals: 0),
                              unidad: Vocab.cadencia, tam: 44)
            }
            // Una sola semana no es una tendencia: el gráfico se calla solo, y la
            // cifra de arriba se queda, que es el dato que sí existe.
            LineaDeProgreso(
                puntos: puntos,
                alto: 104,
                mejorEsMenor: false,
                formato: { Formato.esDecimal($0, decimals: 0) }
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Las medias por tipo de sesión

/// LA EVIDENCIA DEL TERCER PELDAÑO. El veredicto puede apoyarse en «el mismo tipo
/// de sesión contra sí mismo», y hasta hoy ese peldaño citaba un tipo que la
/// pantalla no enseñaba por ninguna parte.
///
/// Llegan ordenadas por kilómetros de más a menos: manda lo que más corre, no lo
/// que más rápido corre.
struct MediasPorTipo: View {
    let tipos: [TipoMedia]

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(tipos) { tipo in
                if let nombre = Self.nombre(tipo.tipo) {
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        Text(nombre)
                            .scaledFont(12, weight: .medium, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                        Spacer(minLength: Theme.Spacing.s)
                        // SOBRE CUÁNTO SE DICE LA MEDIA. Una media de ritmo sin su
                        // volumen ni sus sesiones es un número que no se puede
                        // pesar: «4:01 de media» sale igual de un bloque de series
                        // que de una repetición suelta. Es la cobertura de esta
                        // lectura, y va declarada como en todas las demás.
                        if let cobertura = Self.cobertura(tipo) {
                            Text(cobertura)
                                .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                                .foregroundStyle(Theme.Color.faint)
                                .lineLimit(1)
                        }
                        Text(Formato.ritmo(tipo.ritmoSKm, .porKm))
                            .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// EL FORMATO DE LA SESIÓN, EN CASTELLANO. `tipo` es el vocabulario del cable
    /// (`steady`, `intervals`…) y una clave no se le enseña a nadie: si no se sabe
    /// nombrar, la fila no sale. Antes ninguna fila que una con jerga dentro.
    static func nombre(_ tipo: String) -> String? {
        PrescriptionScheme(canonicalizing: tipo)?.nombreEs
    }

    /// «84 km · 21 sesiones» — sobre cuánto se dice la media. En singular cuando es
    /// una: «1 sesiones» es el defecto plausible que esta app lleva retirando de
    /// todas partes. Nula si no hay ni distancia ni sesiones que declarar.
    static func cobertura(_ tipo: TipoMedia) -> String? {
        var partes: [String] = []
        if let km = Formato.distancia(Double(tipo.metros)) { partes.append(km) }
        if tipo.sesiones > 0 {
            partes.append("\(tipo.sesiones) \(tipo.sesiones == 1 ? "sesión" : "sesiones")")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}
