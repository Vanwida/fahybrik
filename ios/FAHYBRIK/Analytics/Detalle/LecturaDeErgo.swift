import Foundation

// EL ERGO, LEÍDO — remo, SkiErg y BikeErg son UNA pantalla con la máquina como variante (`screens/analiticas-familia-ergo`),
// y cada máquina lleva SU detalle (`progreso-ergo.ts`): el umbral es por máquina y un 2000 m de remo no dice
// nada de un 2000 m de ski. Puro y con test.
//
//   sujeto          `progreso.<máquina>`: la marca clave (los vatios al mismo pulso si se pueden comparar, o la pieza
//                   más larga comparable), la MISMA fila que la portada
//   umbral          `anclas.potencia[máquina]`: el umbral de potencia vigente y su ancla (medido, declarado)
//   mejores         `<máquina>.mejor.<pieza>`: las ocho piezas estándar de Concept2 (100 m, 500 m, 1000 m, 2000 m, 5000 m;
//                   1′, 4′, 30′) con su marca, su ritmo y las que faltan como invitación
//   vatios          `<máquina>.motor` (vatios al mismo pulso) y `<máquina>.cadencia`
//   metros          `<máquina>.volumen`: los metros de cada semana
//
// No se pinta lo que el servidor no sirve: la tendencia del umbral semana a semana (es el vigente, sin serie), el plan
// de los metros por semana (no hay carga planificada del ergo por metros) y el día exacto de cada mejor (series semanales).
// La bici se lee por 1000 m y con rpm, como su monitor: el servidor ya lo manda en `s_1000m` y `rpm`.

/// El umbral de potencia de una máquina tal como se resolvió, con el peldaño de donde sale.
struct UmbralDePotencia: Equatable {
    let vatios: Double
    let ancla: AnclaDeLectura
    /// Cómo lo explica el servidor: «2000 m de remo · 20 sep».
    let explicaEs: String
}

/// Una pieza estándar de Concept2, con la marca que tiene (o sin hacer: una invitación).
struct PiezaDeErgo: Equatable, Identifiable {
    enum Medida: Equatable { case distancia, tiempo }

    struct Marca: Equatable {
        /// Segundos de la pieza (las de distancia) o metros (las de tiempo).
        let valor: Double
        let anterior: Double?
        let cuando: DiaDeMarca
        let nuevo: Bool
        let viejo: Bool
    }

    /// `100 · 500 · 1000 · 2000 · 5000 · 60s · 240s · 1800s`: la clave estable del servidor.
    let clave: String
    /// «100 m», «1′»: el nombre de la pieza en el monitor.
    let nombre: String
    let medida: Medida
    /// Los metros (distancia) o los segundos (tiempo) de la pieza.
    let objetivo: Double
    /// Nula = sin hacer.
    let marca: Marca?

    var id: String { clave }
    var unidad: UnidadLectura { medida == .distancia ? .segundos : .metros }

    /// El ritmo de la marca por `por` metros (500 en remo y ski, 1000 en la bici): aritmética de unidades sobre lo que
    /// mandó el servidor, como el monitor. Nulo sin marca.
    func ritmo(por: Double) -> Double? {
        guard let marca, marca.valor > 0, objetivo > 0 else { return nil }
        return medida == .distancia ? marca.valor / objetivo * por : objetivo / marca.valor * por
    }
}

struct LecturaDeErgo: Equatable {
    let maquina: FamiliaDeDetalle
    let sujeto: SujetoDeFamilia
    let fila: LecturaAnalitica?
    let umbral: UmbralDePotencia?
    /// Los vatios al mismo pulso.
    let motor: LecturaAnalitica?
    /// Las ocho piezas, en el orden del monitor.
    let piezas: [PiezaDeErgo]
    let volumen: LecturaAnalitica?
    let cadencia: LecturaAnalitica?
    let hoy: String

    static let prefijoMejor = "mejor."

    var estado: EstadoDeFamilia { sujeto.estado }
    var filaEsMotor: Bool { fila != nil && fila?.procedencia.de == motor?.procedencia.de }
    /// Cada cuántos metros se dice el ritmo: la bici por 1000 m, como su monitor.
    var ritmoPor: Double { maquina == .bici ? 1000 : 500 }
    var unidadDelRitmo: UnidadLectura { maquina == .bici ? .s1000m : .s500m }
    var piezasHechas: Int { piezas.filter { $0.marca != nil }.count }
    var unidadDeCadencia: UnidadLectura { maquina == .bici ? .rpm : .spm }

    /// La clave de la máquina en `anclas` (`row`, `ski`, `bike`): el vocabulario del motor, que no es el de la app.
    static func claveDeAncla(_ m: FamiliaDeDetalle) -> String? {
        switch m {
        case .remo: return "row"
        case .ski: return "ski"
        case .bici: return "bike"
        default: return nil
        }
    }

    static func desde(_ d: DetalleAnaliticas, _ maquina: FamiliaDeDetalle) -> LecturaDeErgo {
        let raiz = "\(maquina.rawValue)."
        return LecturaDeErgo(
            maquina: maquina,
            sujeto: SujetoDeFamilia.desde(d, maquina),
            fila: d.fila,
            umbral: umbral(d, maquina),
            motor: d.lectura("\(raiz)motor"),
            piezas: piezas(d, raiz: raiz),
            volumen: d.lectura("\(raiz)volumen"),
            cadencia: d.lectura("\(raiz)cadencia"),
            hoy: d.hoy
        )
    }

    private static func umbral(_ d: DetalleAnaliticas, _ m: FamiliaDeDetalle) -> UmbralDePotencia? {
        guard let clave = claveDeAncla(m), let a = d.anclas.potencia[clave] ?? nil, a.ancla != .desconocida else { return nil }
        return UmbralDePotencia(vatios: a.valor, ancla: a.ancla, explicaEs: a.explicaEs)
    }

    private static func piezas(_ d: DetalleAnaliticas, raiz: String) -> [PiezaDeErgo] {
        let prefijo = raiz + prefijoMejor
        return d.lecturas(prefijo: prefijo).compactMap { l -> PiezaDeErgo? in
            let clave = String(l.id.dropFirst(prefijo.count))
            let porTiempo = clave.hasSuffix("s")
            guard let objetivo = Double(porTiempo ? String(clave.dropLast()) : clave), objetivo > 0 else { return nil }
            let nombre = l.tituloEs.hasPrefix("Mejor ") ? String(l.tituloEs.dropFirst("Mejor ".count)) : l.tituloEs
            var marca: PiezaDeErgo.Marca? = nil
            if l.estado == .medida, let dato = l.dato, dato.unidad == (porTiempo ? .metros : .segundos) {
                marca = PiezaDeErgo.Marca(
                    valor: dato.valor,
                    anterior: l.esViejo ? nil : l.comparacion?.anterior,
                    cuando: l.diaDelMejor(ventana: d.ventana),
                    nuevo: !l.esViejo && l.esRecordDeLaVentana,
                    viejo: l.esViejo
                )
            }
            return PiezaDeErgo(clave: clave, nombre: nombre, medida: porTiempo ? .tiempo : .distancia, objetivo: objetivo, marca: marca)
        }
    }
}
