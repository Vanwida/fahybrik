import SwiftUI

// «¿CÓMO LLEGO HOY?» — el primero de los dos bloques TRANSVERSALES.
//
// POR QUÉ NO LLEVA RAIL DE MODALIDAD. No duermes distinto para correr que para
// levantar: el cuerpo es uno. Repetir esta lectura dentro de cada sección sería
// enseñar cinco veces el mismo dato — por eso los dos bloques del cuerpo van
// arriba, sin modalidad, y el rail empieza por debajo (firmado 12-ago).
//
// QUÉ ENSEÑA, Y EN QUÉ SE DIFERENCIA DE INICIO. En Inicio vive el ESTADO: el aro,
// su zona y la guía del día — es el bucle diario y ahí se queda. Aquí vive la
// PROFUNDIDAD: qué lo está moviendo, con su valor y contra qué se compara. Hoy
// eso está enterrado en una hoja que hay que abrir a propósito, y es de lo mejor
// que tenemos: **cien por cien pasivo, sin un solo test**.
//
// EL FILTRO DE ESTA PANTALLA: cada lectura o sostiene el veredicto o pide una
// acción. Esta pide una — ajustar el entreno de hoy — y por eso entra.
//
// UN CERO NO SUSTITUYE A UN HUECO: cada contribuyente que no llegó sencillamente
// no se pinta. Sin ninguno, el bloque no existe.

struct ComoLlegoHoyBloque: View {
    let readiness: DailyReadinessPayload
    /// Abrir el check-in, que es la única palanca que el atleta tiene aquí: el
    /// resto de señales las mide el reloj y no se corrigen a mano.
    var onCheckin: (() -> Void)?

    private var b: ReadinessBreakdown? { readiness.breakdown }

    var body: some View {
        if contribuyentes.isEmpty {
            EmptyView()
        } else {
            BloqueDeLectura(etiqueta: "Cómo llegas hoy") {
                CifraDeBloque(valor: "\(readiness.score)", unidad: zona, tam: 44, tono: tono) {
                    if let d = readiness.delta7d, d != 0 {
                        DeltaDeBloque(mejor: d > 0, valor: "\(abs(d))", ventana: "7 días")
                    }
                }
                // Los contribuyentes A LA VISTA: valor y contra qué. Sin esto, un
                // 62 es una nota que hay que creerse.
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(contribuyentes, id: \.nombre) { c in
                        FilaDeContribuyente(c)
                    }
                }
                if !tendencia.isEmpty {
                    LineaDeProgreso(
                        puntos: tendencia,
                        alto: 96,
                        formato: { Formato.esDecimal($0, decimals: 0) }
                    )
                }
                if let onCheckin, b?.subScore == nil {
                    // La ÚNICA acción de este bloque, y solo cuando falta: pedir el
                    // check-in cuando ya está contestado sería ruido.
                    BotonDeSalida(titulo: "Contestar cómo te sientes", accion: onCheckin)
                }
            }
        }
    }

    /// La zona en palabras del atleta. Los cortes los decide el servidor: aquí solo
    /// se nombran para poder teñir.
    private var zona: String {
        switch readiness.score {
        case 67...: return "vas fino"
        case 45..<67: return "con cuidado"
        default: return "tocado"
        }
    }

    private var tono: Color {
        switch readiness.score {
        case 67...: return Theme.Color.ok
        case 45..<67: return Theme.Color.warning
        default: return Theme.Color.danger
        }
    }

    /// La serie de los últimos días, para ver si esto viene de lejos o es de hoy.
    private var tendencia: [PuntoSemana] {
        (readiness.trend ?? []).map { PuntoSemana(semana: $0.recordedFor, valor: Double($0.score)) }
    }

    /// LO QUE MUEVE EL NÚMERO, cada uno con su referencia cuando la hay.
    ///
    /// El pulso en reposo llega SIN baseline personal a propósito (el modelo no lo
    /// tiene), así que se enseña el valor y no se inventa un «vs tu media». El
    /// sueño se compara con el objetivo, que es lo que existe.
    private var contribuyentes: [Contribuyente] {
        guard let b else { return [] }
        var salida: [Contribuyente] = []
        if let horas = b.sleepHours {
            salida.append(.init(nombre: "Sueño",
                                valor: "\(Formato.esDecimal(horas)) h",
                                referencia: nil))
        }
        if let hrv = b.hrvMs {
            salida.append(.init(
                nombre: "Variabilidad",
                valor: "\(Int(hrv.rounded())) ms",
                referencia: b.hrvBaselineMs.map { "tu media \(Int($0.rounded()))" }
            ))
        }
        if let rhr = b.rhrBpm {
            salida.append(.init(nombre: "Pulso en reposo",
                                valor: "\(Int(rhr.rounded())) \(Vocab.ppm)",
                                referencia: nil))
        }
        if b.subScore != nil {
            salida.append(.init(nombre: "Lo que contaste", valor: "contestado", referencia: nil))
        }
        return salida
    }

    struct Contribuyente {
        let nombre: String
        let valor: String
        /// Contra qué se compara. Nula cuando el modelo no tiene referencia — y
        /// entonces se calla en vez de fabricar una.
        let referencia: String?
    }
}

/// Una señal: su nombre, su valor y contra qué. Tres pesos distintos para que se
/// lea de un vistazo cuál es el dato.
private struct FilaDeContribuyente: View {
    let c: ComoLlegoHoyBloque.Contribuyente
    init(_ c: ComoLlegoHoyBloque.Contribuyente) { self.c = c }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(c.nombre)
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: Theme.Spacing.s)
            Text(c.valor)
                .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            if let referencia = c.referencia {
                Text(referencia)
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
    }
}

/// La acción de un bloque transversal. Mismo tratamiento que la salida del
/// veredicto —el único naranja de la pantalla— para que el atleta reconozca que
/// esto es lo que puede hacer, no otro dato.
struct BotonDeSalida: View {
    let titulo: String
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(titulo)
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.accentOn)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, 11)
                .background(Theme.Color.accent)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }
}
