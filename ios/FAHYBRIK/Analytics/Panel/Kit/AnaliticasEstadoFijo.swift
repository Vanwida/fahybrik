import SwiftUI

// EL ESTADO FIJO (pregunta 1: ¿cómo estoy hoy?) — la cabecera que no se va.
// Fila 1: «Hoy» y la palabra del coach. Fila 2: las celdas que EXISTEN — Forma,
// Fatiga, Frescura y la Disposición de hoy — y solo esas: lo que no se sabe no
// se pinta ni con guiones (§7). Lo que falta se dice en una línea (`nota`), con
// su plazo, no con un hueco. Tocar una celda abre la glosa (A5).

private typealias TA = AnaliticasTokens.TA
private typealias C = AnaliticasColor

struct CeldaDeEstado: Identifiable, Equatable {
    let etiqueta: String
    let valor: Double
    /// Con signo delante cuando es positivo (la frescura).
    var signo = false
    /// La palabra o la edad al lado de la cifra («Regular», «del 10 sep»).
    var palabra: String? = nil
    var id: String { etiqueta }

    var texto: String {
        let v = Int(valor.rounded())
        return signo && v > 0 ? "+\(v)" : "\(v)"
    }
}

struct AnaliticasEstadoFijo: View {
    /// La palabra del coach, o nula cuando no la hay.
    let palabra: String?
    /// Qué se escribe en su sitio cuando no hay palabra.
    var sinPalabra: String = "Sin carga todavía"
    let celdas: [CeldaDeEstado]
    /// Qué falta y desde cuándo.
    var nota: String? = nil
    var onGlosa: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: celdas.isEmpty ? 4 : 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                AnaliticasEtiqueta(texto: "Hoy")
                Text(palabra ?? sinPalabra)
                    .font(.system(size: TA.palabra.cuerpo, weight: TA.palabra.peso))
                    .tracking(-0.4)
                    .foregroundStyle(palabra != nil ? C.tinta : C.tinta2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !celdas.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(celdas) { c in
                        Button(action: { onGlosa?() }) {
                            VStack(alignment: .leading, spacing: 2) {
                                AnaliticasEtiqueta(texto: c.etiqueta)
                                AnaliticasFlujo(espacioH: 6, espacioV: 0) {
                                    AnaliticasNumeral(texto: c.texto, cuerpo: TA.dato)
                                    if let palabra = c.palabra { AnaliticasEtiqueta(texto: palabra) }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(c.etiqueta): \(c.texto)\(c.palabra.map { " \($0)" } ?? "")")
                        .accessibilityHint(onGlosa == nil ? "" : "Qué es")
                    }
                }
            }
            if let nota { AnaliticasEtiqueta(texto: nota) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
