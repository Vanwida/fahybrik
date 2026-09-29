import Foundation

// LAS FRASES QUE DICE EL PÓSTER, puras y probadas. Espejo de `kit-carreras/textos.ts`.
//
// La vista no escribe copy con condiciones: pregunta aquí qué toca decir para cada estado del
// predicho, y así el mismo texto sirve a la pantalla y a VoiceOver (que dice lo mismo que se ve, ni
// más ni menos). Una cifra NUNCA se inventa: cada hueco declara su porqué.

struct TextoPredicho: Equatable {
    /// La marca que acompaña a la frase: por delante (ok) o por detrás (aviso) del objetivo.
    enum Marca: Equatable { case ok, aviso }

    struct Regleta: Equatable {
        let n: Int
        let de: Int
    }

    var etiqueta = "Predicho hoy"
    /// La cifra o la frase corta que ocupa el sitio de la cifra. nil = solo hay frase.
    var valor: String?
    var valorEsCifra = false
    /// Lo que se dice debajo. nil = nada más que decir.
    var frase: String?
    var marca: Marca?
    /// Tramos medidos de los que hay, para la regleta.
    var regleta: Regleta?
    /// Hay un «Reintentar» dentro del panel.
    var reintentar = false
    /// Se pinta el esqueleto de este panel.
    var esqueleto = false
}

/// Lo que el texto del predicho necesita saber de la carrera de la que habla.
struct ContextoPredicho: Equatable {
    let principal: Bool
    let tipoEvento: TipoEventoCarrera
    let formato: FormatoCarrera
}

enum TextosCarreras {

    /// El hueco entre el predicho y el objetivo, dicho como se habla («por delante», «te faltan»).
    /// El signo NO va en la cifra (una diferencia de parciales se lee sin él); lo dice la frase.
    static func fraseHueco(_ huecoS: Int) -> (frase: String, marca: TextoPredicho.Marca?) {
        if huecoS < 0 { return ("Vas \(Formato.clock(-huecoS)) por delante de tu objetivo", .ok) }
        if huecoS > 0 { return ("Te faltan \(Formato.clock(huecoS)) para tu objetivo", .aviso) }
        return ("Justo en tu objetivo", nil)
    }

    static func textoPredicho(_ p: PrediccionCarrera, contexto ctx: ContextoPredicho) -> TextoPredicho {
        let equipo = ctx.formato != .individual
        func con(_ pareja: String?) -> String {
            if let pareja { return "Predicho hoy · con \(pareja)" }
            return equipo ? "Predicho hoy · pareja" : "Predicho hoy"
        }
        switch p {
        case .cargando:
            return TextoPredicho(esqueleto: true)
        case .error:
            return TextoPredicho(valor: "No disponible", frase: "No pudimos calcularlo. Inténtalo de nuevo.", reintentar: true)
        case .noAplica:
            if !ctx.principal {
                return TextoPredicho(frase: "Se calcula para tu objetivo principal. Hazla principal y lo verás aquí.")
            }
            return TextoPredicho(
                etiqueta: "Tu objetivo",
                frase: "El desglose por estaciones es solo de HYROX: para esta carrera el plan se ancla a la fecha."
            )
        case .sinMeta:
            return TextoPredicho(
                etiqueta: "Tu objetivo",
                valor: "Sin tiempo fijado",
                frase: "Fija a qué tiempo vas y verás tu predicho de hoy, estación a estación."
            )
        case .sinPareja:
            return TextoPredicho(
                etiqueta: "Predicho hoy · pareja",
                valor: "Sin pareja conectada",
                frase: "Con tu pareja conectada verás aquí el predicho conjunto, tramo a tramo."
            )
        case .sinDatos(let pareja):
            return TextoPredicho(
                etiqueta: con(pareja),
                valor: "Aún sin datos",
                frase: "Entrena estaciones o importa una carrera y el predicho aparece solo."
            )
        case .parcial(let medidos, let de, let faltan, let pareja):
            return TextoPredicho(
                etiqueta: con(pareja),
                valor: "Aún sin cifra",
                frase: "\(medidos) de \(de) tramos medidos. Te \(faltan.count == 1 ? "falta" : "faltan") \(DecideCarreras.listaCorta(faltan)).",
                regleta: .init(n: medidos, de: de)
            )
        case .cifra(let totalS, let huecoS, let pareja):
            let hueco = huecoS.map(fraseHueco)
            return TextoPredicho(
                etiqueta: con(pareja),
                valor: Formato.clock(totalS, enHoras: false),
                valorEsCifra: true,
                frase: hueco?.frase,
                marca: hueco?.marca
            )
        }
    }

    /// El texto que lee VoiceOver de un panel de predicho: lo mismo que se ve.
    static func vozPredicho(_ t: TextoPredicho) -> String {
        if t.esqueleto { return "Calculando tu predicho" }
        return [t.etiqueta, t.valor, t.frase].compactMap { $0 }.joined(separator: ". ")
    }
}
