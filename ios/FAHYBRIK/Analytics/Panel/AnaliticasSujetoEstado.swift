import SwiftUI

// EL SUJETO DE LA PORTADA — qué dice el bloque grande de arriba (el Estado) en
// cada uno de sus cuatro estados. La pantalla PINTA esto y no decide nada:
// iOS pinta, no calcula (A1). Puro y sin vista, para que se pruebe (espejo de
// `kit-analiticas/sujeto.ts`; sus casos están en `AnaliticasSujetoEstadoTests`).
//
// El Estado responde «¿cómo estoy hoy?» y lleva dentro su veredicto («¿voy a más o
// me paso?»): la palabra de hoy en grande, una línea que la explica, las tres cifras
// de carga y la disposición. Lo que no se sabe no se pinta (§7): la cifra que falta no
// existe, y lo que falta se dice con su plazo o su salida (`AnaliticasEstados`, el
// único sitio donde vive esa prosa).
//
// LAS PALABRAS SON DEL SERVIDOR. La palabra de hoy, su frase y la de la disposición las
// dice el servidor con las bandas y los nombres del coach (HARD RULE Nº0: son método, no
// código). Lo que aquí es mecanismo es la CLAVE cerrada de la frescura (cinco estados) y
// qué tinte lleva cada una.

/// El color de la marca del estado. Va en la marca (el punto de la cabecera) y en el arco de la
/// disposición, NUNCA en una cifra: un 38 en rojo grande se lee como alarma y un 91 en verde como
/// aplauso, y la pieza dice el estado del cuerpo, no un veredicto.
enum MarcaEstado: Equatable {
    case ok, aviso, peligro, info, neutra

    var color: Color {
        switch self {
        case .ok: return Theme.Color.ok
        case .aviso: return Theme.Color.warning
        case .peligro: return Theme.Color.danger
        case .info: return Theme.Color.info
        case .neutra: return Theme.Color.muted
        }
    }
}

/// Las cinco claves CERRADAS de la frescura que el servidor sirve en `veredicto.code`
/// (`ESTADOS_FRESCURA`, `shared/domain/analytics/forma.ts`). Una clave que este binario no
/// conozca cae a neutro: se pinta la palabra sin tinte, jamás se rompe.
enum EstadoDeFrescura: String, CaseIterable {
    case sobrecarga, optimo, mantener, fresco, recargando

    /// Qué tinte lleva el sujeto. Aquí nada es «haz esto ahora», así que ninguno es el acento sólido:
    /// el tinte suave dice cómo estás y la palabra lo dice sin color. `mantener` y `recargando` son
    /// neutros (ni aplauso ni alarma); pasarse de carga es el único con tinte de riesgo.
    var tinte: (tono: TonoDia, marca: MarcaEstado) {
        switch self {
        case .sobrecarga: return (.peligro, .peligro)
        case .optimo: return (.ok, .ok)
        case .mantener: return (.neutro, .neutra)
        case .fresco: return (.info, .info)
        case .recargando: return (.neutro, .aviso)
        }
    }
}

/// Cuánto de bien está la disposición de hoy. Lo dice el servidor con las bandas de SU coach
/// (`veredicto.tono` de la lectura); iOS no compara la cifra con ningún corte (los del Swift de Hoy son
/// otros y son método cableado: ver el informe de la segunda tanda).
enum NivelDeDisposicion: Equatable {
    case bajo, medio, alto
    /// Sin palabra del servidor (el dato no es de hoy): el arco va en gris.
    case sinPalabra

    init(tono: VeredictoDeLectura.Tono?) {
        switch tono {
        case .bien?: self = .alto
        case .atencion?: self = .medio
        case .aviso?: self = .bajo
        case .neutro?, .desconocido?, nil: self = .sinPalabra
        }
    }

    /// El color del arco: por tercio del espectro, no por número (los cortes son del coach).
    var color: Color {
        switch self {
        case .bajo: return Theme.Color.danger
        case .medio: return Theme.Color.warning
        case .alto: return Theme.Color.ok
        case .sinPalabra: return Theme.Color.muted
        }
    }
}

struct SujetoEstado: Equatable {

    struct Celda: Equatable, Identifiable {
        enum Clave: String { case forma, fatiga, frescura }
        let clave: Clave
        let etiqueta: String
        /// Ya escrita: «51», «−4», «+22».
        let texto: String
        var id: String { clave.rawValue }
    }

    struct Disposicion: Equatable {
        let valor: Int
        /// La palabra del coach («Bien», «Con cautela»), o de cuándo es el dato si ya no es de hoy.
        let palabra: String?
        let nivel: NivelDeDisposicion
        let esDeHoy: Bool

        var rotulo: String { esDeHoy ? "Disposición de hoy" : "Última disposición" }
    }

    /// El estado del bloque: de él cuelga qué hueco se dice.
    let bloque: EstadoBloque
    let tono: TonoDia
    let marca: MarcaEstado
    let titulo: String
    /// Una línea bajo el título: el veredicto, el hueco o la razón por la que no hay palabra.
    let apoyo: String?
    /// Solo las que existen: lo que no se sabe no se pinta ni con guiones.
    let celdas: [Celda]
    let disposicion: Disposicion?
    /// Cuánto falta para que forma y frescura sean fiables.
    let plazo: PlazoHueco?
    let salida: SalidaHueco?

    /// Lo que lee VoiceOver de una pasada, para la etiqueta del bloque.
    var lecturaAccesible: String {
        [titulo, apoyo].compactMap { $0 }.joined(separator: ". ")
    }
}

extension SujetoEstado {

    /// El sujeto de un panel en el estado de su bloque `estado` (vacío · poco · lleno · viejo).
    static func desde(_ p: PanelAnaliticas, bloque: EstadoBloque) -> SujetoEstado {
        let ls = p.bloques.estado
        let forma = AnaliticasDerivados.lectura(ls, IdsDelPanel.estadoForma)
        let fatiga = AnaliticasDerivados.lectura(ls, IdsDelPanel.estadoFatiga)
        let frescura = AnaliticasDerivados.lectura(ls, IdsDelPanel.estadoFrescura)
        // El hueco del Estado habla de la CARGA: la disposición (que falta si no hay reloj) tiene su
        // propia salida en Recuperación, y no puede sustituir a «Empezar un entreno» como salida del sujeto.
        let carga = ls.filter { $0.id != IdsDelPanel.estadoDisposicion }
        let hueco = bloque == .lleno
            ? nil
            : AnaliticasEstados.textoHueco(bloque: .estado, estado: bloque, lecturas: carga, hoy: p.hoy, metodo: p.metodo)

        let palabra = frescura?.veredicto?.etiquetaEs
        let tinte = palabra != nil
            ? (frescura?.veredicto.flatMap { EstadoDeFrescura(rawValue: $0.code) }?.tinte ?? (.neutro, .neutra))
            : (TonoDia.neutro, MarcaEstado.neutra)

        // Arranque en frío: la forma y la frescura suben por pura aritmética, y solo la fatiga (la
        // ventana corta) dice algo. Lo demás se dice con el plazo dibujado.
        let enFrio = bloque == .poco && hueco?.plazo != nil
        var celdas: [Celda] = []
        if !enFrio, let l = forma, let v = l.dato?.valor { celdas.append(Celda(clave: .forma, etiqueta: l.tituloEs, texto: AnaliticasFormato.entero(v))) }
        if let l = fatiga, let v = l.dato?.valor { celdas.append(Celda(clave: .fatiga, etiqueta: l.tituloEs, texto: AnaliticasFormato.entero(v))) }
        if !enFrio, let l = frescura, let v = l.dato?.valor { celdas.append(Celda(clave: .frescura, etiqueta: l.tituloEs, texto: AnaliticasFormato.entero(v, conSigno: true))) }

        // El veredicto, cuando existe, es lo que explica la palabra. Con el dato viejo manda el hueco: a
        // quien lleva semanas parado lo primero que se le dice es desde cuándo.
        let veredicto = AnaliticasDerivados.veredictoDeForma(p)
        let apoyo: String?
        switch bloque {
        case .vacio, .poco where enFrio: apoyo = hueco?.cuerpo
        case .viejo: apoyo = hueco.map { "\($0.titulo). \($0.cuerpo)" }
        default: apoyo = veredicto?.frase ?? hueco?.cuerpo
        }

        let titulo: String
        if let palabra { titulo = palabra } else if bloque == .lleno { titulo = "Sin veredicto" } else { titulo = hueco?.titulo ?? "Sin carga todavía" }

        // La salida: la del hueco; y si la palabra se ha retirado, la de la falta que la retira.
        var salida = hueco?.salida
        if salida == nil, case .retirado? = veredicto, let falta = AnaliticasDerivados.lectura(p.bloques.forma, "carga.cobertura")?.cobertura.falta {
            salida = AnaliticasEstados.salida(de: falta)
        }

        return SujetoEstado(
            bloque: bloque,
            tono: tinte.0,
            marca: tinte.1,
            titulo: titulo,
            apoyo: apoyo,
            celdas: celdas,
            disposicion: disposicion(p),
            plazo: hueco?.plazo,
            salida: salida
        )
    }

    /// La disposición de hoy, cuando hay número. La palabra la pone el servidor; si el dato ya no es de
    /// hoy se dice de cuándo es y el arco va en gris (no describe cómo llegas hoy).
    private static func disposicion(_ p: PanelAnaliticas) -> Disposicion? {
        guard let r = AnaliticasDerivados.lectura(p.bloques.estado, IdsDelPanel.estadoDisposicion), let v = r.dato?.valor else { return nil }
        let esDeHoy = !AnaliticasEstados.esDatoAtrasado(r)
        var palabra = r.veredicto?.etiquetaEs
        if palabra == nil, r.cobertura.diasConDato == 0 {
            palabra = AnaliticasDerivados.ultimoDeLaSerie(AnaliticasDerivados.lectura(p.bloques.recuperacion, IdsDelPanel.readiness))
                .map { "del \(AnaliticasFechas.corta($0))" } ?? "no es de hoy"
        }
        return Disposicion(valor: Int(v.rounded()), palabra: palabra, nivel: NivelDeDisposicion(tono: r.veredicto?.tono), esDeHoy: esDeHoy)
    }
}
