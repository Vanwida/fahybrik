import SwiftUI

// Las piezas propias de la lectura de una carrera. Todo lo demás sale del kit de
// lo vivo (`Numeral`, `EtiquetaSujeto`, `ApoyoVivo`, `FranjaAccion`, `Ambiente`) y
// del registro que ya está shipeado. Esta pantalla no reinventa el lenguaje: lo
// sigue.
//
// Port de `web/components/design-twin/screens/lectura-carrera/piezas.tsx`.

// MARK: - Cabecera de sección — el único cromo que separa un bloque del siguiente

struct SeccionDeLectura<Contenido: View>: View {
    let titulo: String
    var nota: String?
    @ViewBuilder var contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text(titulo)
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.54)
                    .foregroundStyle(Theme.Color.muted)
                if let nota {
                    Text(nota)
                        .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
            contenido
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - EL TROCEADO POR REPETICIÓN — una fila por serie, con su veredicto

/// LA RECUPERACIÓN TIENE DATOS, y hay que poder leerlos.
///
/// Para un «2′ parado» una línea gris sin cifras era correcta: de pie no hay
/// ritmo que enseñar. Pero en carrera **el parado rara vez se hace**: lo normal es
/// un trote a otra intensidad, y ese trote tiene ritmo, pulso y a menudo su propio
/// objetivo. Irse rápido en él es exactamente lo que explica que la quinta serie
/// se caiga.
///
/// Sigue sin pesar como el trabajo —el sujeto de la sesión es el trabajo, y eso no
/// cambia—: la fila del trote va sin superficie, con la cifra un escalón por
/// debajo y sangrada bajo la serie que cierra. Se lee; no compite.
struct TablaDeRepeticiones: View {
    let repeticiones: [Repeticion]
    let lectura: Lectura
    let certeza: CertezaDeTramos?

    var body: some View {
        VStack(spacing: 2) {
            // Los veredictos llegan en listas paralelas —trabajo y recuperación—,
            // así que hay que saber qué posición ocupa cada fila dentro de la suya
            // antes de pintar. Se resuelve una vez, no fila a fila.
            ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                switch fila.repeticion.papel {
                case .trabajo:
                    FilaDeSerie(r: fila.repeticion,
                                veredicto: en(lectura.veredictos, fila.indice),
                                duracion: en(lectura.veredictosDuracion, fila.indice),
                                eje: lectura.eje)
                case .recuperacion:
                    FilaDeRecuperacion(
                        r: fila.repeticion,
                        veredicto: en(lectura.veredictosRecuperacion, fila.indice),
                        duracion: en(lectura.veredictosDuracionRecuperacion, fila.indice)
                    )
                }
            }
            if let certeza {
                Text(NotaDeCertezaDeTramos.texto(certeza))
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
            }
        }
    }

    private struct Fila { let repeticion: Repeticion; let indice: Int }

    private var filas: [Fila] {
        var trabajo = 0
        var recuperacion = 0
        return repeticiones.map { r in
            if r.papel == .trabajo {
                defer { trabajo += 1 }
                return Fila(repeticion: r, indice: trabajo)
            }
            defer { recuperacion += 1 }
            return Fila(repeticion: r, indice: recuperacion)
        }
    }

    private func en<T>(_ lista: [T], _ i: Int) -> T? {
        lista.indices.contains(i) ? lista[i] : nil
    }
}

private struct FilaDeSerie: View {
    let r: Repeticion
    let veredicto: RunComplianceVerdict?
    let duracion: WorkDurationVerdict?
    let eje: EjeDeLectura

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text("\(r.n)")
                .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 16, alignment: .leading)
            Text(medida)
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let cifra {
                MonoText(text: cifra, size: 17, weight: .bold, color: Theme.Color.foreground)
            }
            // El pulso de la repetición solo si se midió. Nunca un hueco con unidad.
            if let ppm = r.fcMediaPpm {
                Text("\(Int(ppm.rounded()))")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
                    .frame(width: 42, alignment: .trailing)
            }
            if let veredicto, veredicto != .sinDato {
                PastillaDeVeredicto(veredicto: veredicto)
            }
            // LA DURACIÓN ES LA SEGUNDA PREGUNTA, no un reemplazo: un tramo puede
            // estar en banda de ritmo y haberse quedado corto de tiempo, y se
            // enseñan las dos cosas. Solo se marca el fallo — «completa» es lo que
            // se esperaba y ponerle sello sería felicitar por lo normal.
            if duracion == .incompleta {
                Text("corta")
                    .scaledFont(10.5, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.warning)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(Theme.Color.surface.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    /// En cuesta el ritmo bruto no se compara: lo que se lee es el TIEMPO. No es
    /// una excepción de esta fila, es el eje que decidió la lectura entera.
    private var cifra: String? {
        if eje == .tiempo { return Formato.clock(r.duracionS) }
        guard let skm = r.ritmoSkm else { return nil }
        return Formato.ritmo(skm, .porKm)
    }

    private var medida: String {
        if let metros = r.distanciaM, metros > 0 {
            return Formato.distanciaCubierta(metros) ?? Formato.clock(r.duracionS)
        }
        return Formato.clock(r.duracionS)
    }
}

private let modoDeRecuperacion: [ModoRecuperacion: String] = [
    .trote: "trotando", .andando: "andando", .parado: "parado",
]

/// LA ASIMETRÍA, y es de dominio: **irse RÁPIDO en una recuperación es el fallo
/// que importa; irse lento es casi siempre irrelevante.** Un trote más suave de lo
/// pedido no rompe nada; uno más fuerte se come la serie siguiente. Así que solo
/// se marca el que va rápido — pintar los dos igual sería decirle al atleta que
/// trotar despacio es un error, que es mentira.
private struct FilaDeRecuperacion: View {
    let r: Repeticion
    let veredicto: RecoveryComplianceVerdict?
    let duracion: RecoveryDurationVerdict?

    private var seFue: Bool { veredicto == .demasiadoRapida }

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(detalle)
                .scaledFont(11, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            // Parado no tiene ritmo, y no se le inventa uno. Trotando sí, y es
            // dato: es la diferencia entre respetar la recuperación y correrla.
            if let skm = r.ritmoSkm {
                Text(Formato.ritmo(skm, .porKm))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(seFue ? Theme.Color.warning : Theme.Color.muted)
            }
            if let ppm = r.fcMediaPpm {
                Text("\(Int(ppm.rounded()))")
                    .font(.system(size: 11, weight: .medium, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
                    .frame(width: 42, alignment: .trailing)
            }
            if seFue {
                Text("Te fuiste")
                    .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.warning)
            }
            // Aquí el fallo de tiempo es PASARSE, al revés que en el trabajo:
            // tres minutos de trote donde se pidió uno ya no es la misma sesión.
            if duracion == .excedida {
                Text("de más")
                    .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.warning)
            }
        }
        .padding(.leading, 34)
        .padding(.trailing, 10)
        .padding(.vertical, 4)
    }

    private var detalle: String {
        [Formato.clock(r.duracionS), r.modo.flatMap { modoDeRecuperacion[$0] }]
            .compactMap { $0 }
            .joined(separator: " ")
    }
}

/// El veredicto del atleta, con SU boca. El panel del coach dice «En banda» y
/// «Más rápido»; el atleta habla de SUS repeticiones, que son femeninas y no
/// llevan la palabra «banda» en la cabeza. Mismo veredicto, otra boca.
struct PastillaDeVeredicto: View {
    let veredicto: RunComplianceVerdict

    static func voz(_ v: RunComplianceVerdict) -> String {
        switch v {
        case .dentro: return "Dentro"
        case .fueraRapido: return "Más rápida"
        case .fueraLento: return "Más lenta"
        case .sinDato: return "Sin medir"
        }
    }

    static func tono(_ v: RunComplianceVerdict) -> Color {
        switch v {
        case .dentro: return Theme.Color.ok
        case .fueraRapido, .fueraLento: return Theme.Color.warning
        case .sinDato: return Theme.Color.muted
        }
    }

    var body: some View {
        Text(Self.voz(veredicto))
            .scaledFont(10.5, weight: .semibold, relativeTo: .caption2)
            .foregroundStyle(Self.tono(veredicto))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Self.tono(veredicto).opacity(0.16))
            .clipShape(Capsule())
            .lineLimit(1)
    }
}

enum NotaDeCertezaDeTramos {
    static func texto(_ c: CertezaDeTramos) -> String {
        switch c {
        case .marcados: return "Los tramos los cerró el entreno: no se han inferido."
        case .detectados: return "Estos apretones no los marcaste tú: los separa el ritmo. Dato inferido."
        }
    }
}

// MARK: - EL TROCEADO POR KILÓMETRO — para lo continuo, y solo para lo continuo

/// Los kilómetros de un 6×800 no dicen nada (parten las series por la mitad) y las
/// repeticiones de un rodaje no existen. Por eso esta tabla y la de arriba NUNCA
/// se pintan a la vez: la lectura decide cuál toca.
///
/// La barra de cada fila es proporcional a la VELOCIDAD, no al ritmo: con el
/// ritmo, el kilómetro lento sería la barra más larga.
struct TablaDeKilometros: View {
    let kilometros: [Kilometro]

    var body: some View {
        VStack(spacing: 2) {
            ForEach(kilometros, id: \.n) { k in
                HStack(spacing: Theme.Spacing.s) {
                    Text(k.parcial
                         ? (Formato.esDecimal(k.distanciaM / 1000, decimals: 2, siempreDecimales: true))
                         : "km \(k.n)")
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                        .frame(width: 52, alignment: .leading)
                    if let skm = k.ritmoSkm {
                        GeometryReader { geo in
                            Capsule()
                                .fill(Theme.Color.foreground.opacity(0.34))
                                .frame(width: geo.size.width * fraccion(skm), height: 6)
                                .frame(maxHeight: .infinity, alignment: .center)
                        }
                        .frame(height: 12)
                        MonoText(text: Formato.ritmo(skm, .porKm), size: 16, weight: .bold,
                                 color: Theme.Color.foreground)
                        if let ppm = k.fcMediaPpm {
                            Text("\(Int(ppm.rounded()))")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced).monospacedDigit())
                                .foregroundStyle(Theme.Color.faint)
                                .frame(width: 42, alignment: .trailing)
                        }
                    } else {
                        // Ni una casilla vacía ni un guion: el kilómetro existió, y
                        // lo que falta se dice con palabras.
                        Text(k.sinCobertura ?? "Este kilómetro se quedó sin ritmo que enseñar")
                            .scaledFont(11.5, weight: .medium, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Theme.Color.surface.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            }
        }
    }

    /// 30 % de suelo para que el kilómetro más lento siga siendo una barra y no una
    /// raya: la comparación es entre ellos, no contra el cero.
    private func fraccion(_ skm: Double) -> Double {
        let velocidades = kilometros.compactMap(\.ritmoSkm).filter { $0 > 0 }.map { 1000 / $0 }
        guard let min = velocidades.min(), let max = velocidades.max(), max > min else { return 1 }
        return 0.3 + 0.7 * ((1000 / skm) - min) / (max - min)
    }
}

// MARK: - EL MAPA — solo en calle, y coloreado por zona de ritmo

/// El color del recorrido es TU ZONA DE RITMO, no una rampa inventada.
///
/// Colorear por ritmo con un degradado no significa nada fuera de esa carrera.
/// Aquí las cinco bandas ya existen y ya tienen color en toda la app, así que un
/// tramo ámbar significa lo mismo en el mapa que en el resto de la pantalla:
/// fuiste en Z4. El color es dato y no puede querer decir dos cosas distintas en
/// la misma vista.
struct MapaDeLaCarrera: View {
    let ruta: [PuntoRuta]

    private static let alto: CGFloat = 128

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Canvas(rendersAsynchronously: false) { ctx, size in
                for i in ruta.indices.dropFirst() {
                    let a = ruta[i - 1], b = ruta[i]
                    var p = Path()
                    p.move(to: CGPoint(x: a.x * size.width, y: a.y * size.height))
                    p.addLine(to: CGPoint(x: b.x * size.width, y: b.y * size.height))
                    let tono = b.zona.flatMap { HRZone(rawValue: $0)?.color } ?? Theme.Color.muted
                    ctx.stroke(p, with: .color(tono),
                               style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                }
            }
            .frame(height: Self.alto)
            .padding(Theme.Spacing.s)
            .background(Theme.Color.surface.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .accessibilityElement()
            .accessibilityLabel("Recorrido de la carrera, coloreado por tu zona de ritmo")

            if !zonasUsadas.isEmpty {
                HStack(spacing: 6) {
                    ForEach(zonasUsadas, id: \.self) { z in
                        Text("Z\(z)")
                            .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                            .foregroundStyle(HRZone(rawValue: z)?.color ?? Theme.Color.muted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background((HRZone(rawValue: z)?.color ?? Theme.Color.muted).opacity(0.15))
                            .clipShape(Capsule())
                    }
                    Text("por tu zona de ritmo")
                        .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
    }

    private var zonasUsadas: [Zona] { Array(Set(ruta.compactMap(\.zona))).sorted() }
}

// MARK: - LO DERIVADO — discreto, y SOLO si hay número

/// Los que solo se pueden calcular con el archivo delante. Ninguno se pinta en
/// gris «pendiente»: o hay número, o la fila no existe.
///
/// Y ninguno lleva su nombre de laboratorio: «mismo pulso, un 4 % más lento» lo
/// entiende cualquiera a la primera, que es la prueba que manda.
struct DerivadaDeCarrera: Equatable {
    let etiqueta: String
    let valor: String
    let pie: String

    static func todas(_ c: Carrera) -> [DerivadaDeCarrera] {
        var filas: [DerivadaDeCarrera] = []
        if let deriva = c.derivado.derivaPct {
            filas.append(.init(etiqueta: "Al mismo pulso",
                               valor: Formato.esDecimal(abs(deriva), decimals: 1),
                               pie: deriva >= 0 ? "% más lento al final" : "% más rápido al final"))
        }
        if let bajada = c.derivado.bajadaPulsoPpm {
            filas.append(.init(etiqueta: "Al parar",
                               valor: "\(Int(bajada.rounded()))",
                               pie: "\(Vocab.ppm) en 1 min"))
        }
        if let desnivel = c.desnivelM, desnivel > 0 {
            filas.append(.init(etiqueta: "Subida",
                               valor: "+\(Int(desnivel.rounded()))",
                               pie: "m acumulados"))
        }
        // Sin traza no hay curva que enseñe el pulso, pero la FC media y la máxima
        // SÍ se midieron: dejar el hueco teniendo esto sería quedarse corto, no ser
        // honesto.
        if c.traza == nil, let media = c.fcMediaPpm, let maxima = c.fcMaxPpm {
            filas.append(.init(etiqueta: Vocab.fcMedia,
                               valor: "\(Int(media.rounded()))", pie: Vocab.ppm))
            filas.append(.init(etiqueta: Vocab.fcMax,
                               valor: "\(Int(maxima.rounded()))", pie: Vocab.ppm))
        }
        return filas
    }
}

// MARK: - EL HUECO DECLARADO — cuando no hay archivo, se dice por qué

/// No es la versión rota de la pantalla buena: es la misma pantalla diciendo la
/// verdad. Sin archivo no hay curva, ni kilómetros, ni mapa — y en vez de tres
/// secciones vacías hay UNA frase que explica las tres.
///
/// Lo que NO hace: quitarle al atleta sus tramos. Los veredictos salen de lo que
/// el motor grabó lap a lap y existen desde mucho antes que el archivo, así que
/// una sesión sin traza puede tener perfectamente su «5 de 6 dentro» arriba y
/// esta nota debajo.
struct SinArchivoDeCarrera: View {
    /// Desde cuándo se archiva. Es dato de producto y se dice con fecha, porque lo
    /// que el atleta necesita saber es que las siguientes SÍ la tendrán.
    static let archivoDesde = "11 de agosto"
    let revision: Bool

    var body: some View {
        VStack(spacing: 6) {
            Text("Sin curva, sin kilómetros y sin mapa")
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text(revision
                 ? "Las carreras se archivan desde el \(Self.archivoDesde). De las anteriores solo quedan sus totales, que son los de arriba."
                 : "El reloj no llegó a emitir. Los totales sí se guardaron, y son los de arriba.")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.l)
        .padding(.horizontal, Theme.Spacing.m)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .strokeBorder(Theme.Color.hairlineStrong,
                              style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
        )
    }
}
