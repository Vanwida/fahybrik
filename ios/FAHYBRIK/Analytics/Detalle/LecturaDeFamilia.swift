import Foundation

// LO COMÚN DE LOS CUATRO DETALLES — el estado de una familia, su sujeto (la marca clave) y lo que se dice
// cuando no hay nada. La decisión vive AQUÍ, en tipos puros y con test, y la vista PINTA lo que sale
// (iOS pinta, no calcula: A1).
//
// EL SUJETO DE UN DETALLE ES SU MARCA CLAVE, y es la MISMA lectura que la fila de la familia en el Progreso
// de la portada (`progreso.<familia>`, la primera del detalle): la que abrió la pantalla. Así el número que
// tocas es el número que ves, con el delta, el ancla y la frase que ya dice el servidor.
//
// LOS CUATRO ESTADOS (A10) SE DERIVAN de esa fila y de lo que el servidor declara en ella:
//   vacío   sin número (la familia no tiene NINGUNA observación · quien aún no ha entrenado nada)
//   viejo   hay número pero es el último que hubo, fuera de la ventana (falta `viejo`)
//   poco    hay número y no con qué compararlo todavía (falta `historia`): se queda el número, sin palabra
//   lleno   número, comparación y palabra
// Ni un umbral ni un día contado aquí: el corte de «viejo» y de «poco» los decide el servidor al emitir la falta.

enum EstadoDeFamilia: Equatable {
    case vacio, poco, lleno, viejo

    init(fila: LecturaAnalitica?) {
        guard let fila, fila.estado == .medida, fila.dato != nil else { self = .vacio; return }
        switch fila.cobertura.falta {
        case .viejo?: self = .viejo
        case .historia?: self = .poco
        default: self = .lleno
        }
    }
}

/// Lo que dice el sujeto de una familia sin nada todavía: el sujeto ES el vacío (CONTRATO-UI §6.2: un vacío se
/// centra y lleva su salida). La salida es siempre una acción: lo único que llena una familia es entrenarla.
struct TextoDeFamiliaVacia: Equatable {
    let titulo: String
    let cuerpo: String
    let accion: String
}

/// El día de una marca: exacto cuando el servidor lo sabe, y la semana cuando solo sabe eso.
enum DiaDeMarca: Equatable {
    /// Un día concreto (ISO).
    case dia(String)
    /// El lunes de la semana en que cayó (las series semanales no guardan el día).
    case semana(String)
    case ninguno

    /// «12 sep» · «sem. 22 sep». Vacío si no se sabe: una fecha inventada es peor que ninguna.
    func texto(hoy: String) -> String? {
        switch self {
        case .dia(let iso): return AnaliticasFormato.fechaLegible(iso, hoy: hoy)
        case .semana(let lunes): return "sem. \(AnaliticasFormato.fechaLegible(lunes, hoy: hoy))"
        case .ninguno: return nil
        }
    }
}

extension LecturaAnalitica {

    /// El número es el último que hubo, fuera de la ventana (el servidor lo marca con la falta `viejo`).
    var esViejo: Bool { AnaliticasEstados.esViejo(self) }

    /// La marca se ha conseguido en la ventana: contra su récord de siempre no le falta nada. La palabra «Nuevo»
    /// del servidor (`records`) sale de lo mismo: `referencia.de == record` con delta cero.
    var esRecordDeLaVentana: Bool {
        guard let r = dato?.referencia, r.de == IdsDelPanel.referenciaRecord else { return false }
        return abs(r.delta) < 1e-9
    }

    /// El día de la marca del periodo. Un dato viejo trae su día (`viejo.ultimo`); una serie diaria (estaciones,
    /// WOD) sabe el día exacto del mejor; una semanal, solo su semana.
    func diaDelMejor(ventana: VentanaDelPanel) -> DiaDeMarca {
        if case .viejo(let ultimo)? = cobertura.falta { return .dia(ultimo) }
        guard let valor = dato?.valor, let serie else { return .ninguno }
        let dentro = serie.puntos.filter { p in
            guard let v = p.v else { return false }
            let enVentana = serie.paso == .semana ? p.t >= (AnaliticasFechas.lunes(ventana.desde) ?? ventana.desde) : p.t >= ventana.desde
            return enVentana && p.t <= ventana.hasta && abs(v - valor) < Self.tolerancia(valor)
        }
        guard let ultimo = dentro.last else { return .ninguno }
        switch serie.paso {
        case .dia: return .dia(ultimo.t)
        case .semana: return .semana(ultimo.t)
        case .desconocido: return .ninguno
        }
    }

    /// Los puntos de la serie se redondean al escribirse (`Math.round`): el número del periodo es el de su punto.
    private static func tolerancia(_ valor: Double) -> Double { max(0.06, abs(valor) * 1e-6) }
}

// MARK: - El sujeto

struct SujetoDeFamilia: Equatable {

    struct Marca: Equatable {
        /// «Motor», «Mejor 5 km», «Sentadilla · 1RM estimado»: el título del servidor sin el nombre de la familia.
        let etiqueta: String
        let valor: Double
        let unidad: UnidadLectura
        let delta: DeltaVista?
        let ancla: AnclaDeLectura?
        /// La frase del servidor sobre de dónde sale, o desde cuándo es el dato si ya no es de esta ventana.
        let nota: String?
    }

    enum Cuerpo: Equatable {
        case marca(Marca)
        case vacio(TextoDeFamiliaVacia)
    }

    let familia: FamiliaLectura
    let estado: EstadoDeFamilia
    let cuerpo: Cuerpo

    /// El sujeto de un detalle. La familia de la pantalla manda en el vacío (el atleta abrió «Remo» y se le dice
    /// «Sin remo todavía», aunque la lectura no lo nombre).
    static func desde(_ detalle: DetalleAnaliticas, _ familia: FamiliaDeDetalle) -> SujetoDeFamilia {
        let fila = detalle.fila
        let estado = EstadoDeFamilia(fila: fila)
        guard estado != .vacio, let fila, let dato = fila.dato else {
            return SujetoDeFamilia(familia: familia.lectura, estado: .vacio, cuerpo: .vacio(TextosDeFamilia.vacio(familia)))
        }
        return SujetoDeFamilia(
            familia: familia.lectura,
            estado: estado,
            cuerpo: .marca(Marca(
                etiqueta: AnaliticasDerivados.metricaDeProgreso(fila),
                valor: dato.valor,
                unidad: dato.unidad,
                delta: estado == .viejo ? nil : AnaliticasDerivados.delta(de: fila),
                ancla: fila.procedencia.ancla,
                nota: nota(fila, estado: estado, familia: familia, hoy: detalle.hoy)
            ))
        )
    }

    /// Una marca vieja dice desde cuándo y que no ha vuelto a haber: la frase del servidor no habla de eso.
    private static func nota(_ fila: LecturaAnalitica, estado: EstadoDeFamilia, familia: FamiliaDeDetalle, hoy: String) -> String? {
        if estado == .viejo, case .viejo(let ultimo)? = fila.cobertura.falta {
            return "\(TextosDeFamilia.ultimo(familia)) \(AnaliticasFormato.fechaLegible(ultimo, hoy: hoy)) · nada desde entonces"
        }
        return fila.procedencia.explicaEs
    }
}

// MARK: - Las palabras de las familias

/// El nombre de cada detalle y lo que dice cuando no hay nada: las frases que el doble firmó, escritas UNA vez.
enum TextosDeFamilia {

    /// El título de la pantalla.
    static func titulo(_ f: FamiliaDeDetalle) -> String {
        switch f {
        case .correr: return "Correr"
        case .remo, .ski, .bici: return "Ergo"
        case .fuerza: return "Fuerza"
        case .estaciones: return "Estaciones y WOD"
        case .desconocida: return ""
        }
    }

    /// La etiqueta del sujeto vacío: la familia, o la máquina.
    static func etiquetaDelVacio(_ f: FamiliaDeDetalle) -> String {
        f == .estaciones ? "Estaciones y WOD" : f.lectura.nombre
    }

    /// «Última sesión 14 jul · nada desde entonces»: el nombre de lo último que hubo.
    static func ultimo(_ f: FamiliaDeDetalle) -> String {
        switch f {
        case .correr: return "Última sesión"
        case .remo, .ski, .bici: return "Última pieza"
        case .fuerza: return "Última serie"
        case .estaciones, .desconocida: return "Última marca"
        }
    }

    static func vacio(_ f: FamiliaDeDetalle) -> TextoDeFamiliaVacia {
        switch f {
        case .correr:
            return TextoDeFamiliaVacia(
                titulo: "Sin correr todavía",
                cuerpo: "Con tu primera carrera aparecen aquí tu ritmo, tus mejores esfuerzos y tu motor. Correr es la mitad del HYROX: es la familia que más cuenta.",
                accion: "Empezar a correr")
        case .remo, .ski, .bici:
            let maquina = f.lectura.nombre
            let nombre = f == .remo ? "remo" : maquina
            let contexto: String
            switch f {
            case .remo: contexto = "El remo de 1000 m es una de las ocho estaciones."
            case .ski: contexto = "El SkiErg abre el HYROX."
            default: contexto = "La bici no está en el HYROX, pero suma base sin impacto."
            }
            return TextoDeFamiliaVacia(
                titulo: "Sin \(nombre) todavía",
                cuerpo: "Con la primera pieza aparecen aquí tu umbral, tus mejores por distancia y tus vatios. \(contexto)",
                accion: "Hacer una pieza de \(nombre)")
        case .fuerza:
            return TextoDeFamiliaVacia(
                titulo: "Sin fuerza todavía",
                cuerpo: "Con la primera sesión de fuerza aparecen aquí tu 1RM estimado por ejercicio, tu tonelaje por semana y si clavas el RIR que te piden. Anota kg y RIR en cada descanso: es lo que lo alimenta.",
                accion: "Empezar una sesión de fuerza")
        case .estaciones, .desconocida:
            return TextoDeFamiliaVacia(
                titulo: "Sin estaciones todavía",
                cuerpo: "Con el primer circuito aparecen aquí tu mejor por estación (con la carga que llevabas), tus simulaciones y, con una carrera objetivo, cuánto te falta en cada tramo.",
                accion: "Hacer un circuito de estaciones")
        }
    }
}
