import Foundation

// QUÉ ES EL SUJETO DE «CARRERAS» AHORA, y las pocas derivaciones que la pestaña necesita.
//
// Puras sobre la `LecturaCarreras`: la pantalla pinta lo que decida esto, no decide nada por su
// cuenta. Es la traducción, función a función, de `kit-carreras/decide.ts` + las cuentas de
// `formato.ts`, y los tests (`DecideCarrerasTests`) son los del doble sobre los mismos veinte casos.
//
// La tesis (la misma que «Hoy · El día»): la pestaña de carreras no enseña el mismo panel siempre,
// enseña LA CARRERA QUE IMPORTA AHORA, y eso cambia a lo largo de la temporada. Precedencia
// OBJETIVA (cada paso tapa a los de debajo porque sin él los de debajo no se pueden leer o hacer):
//   1. cargando       → esqueleto (aún no sabemos cuál de los demás toca)
//   2. error de carga → «No pudimos cargar tus carreras» con «Reintentar»
//   3. postcarrera    → corriste hace poco y falta tu resultado: es lo único que puedes hacer
//                        ahora con esa carrera (importarlo)
//   4. objetivo       → el principal; si no hay, la más próxima que haya
//   5. última         → sin nada por delante, la última carrera con resultado
//   6. vacío          → ni carreras por delante ni por detrás: la invitación
//
// El «postcarrera» va por delante del objetivo porque es lo más perecedero: el objetivo sigue
// dentro de 39 días, pedirle el resultado de ayer no.

enum SujetoCarreras: Equatable {
    case cargando
    case error
    case postcarrera(carrera: CarreraPasada, dias: Int)
    /// `principal` falso = no hay principal y se enseña la más próxima (con su salida: hacerla principal).
    case objetivo(carrera: ProximaCarrera, principal: Bool)
    case ultima(carrera: CarreraPasada)
    case vacio

    /// El tipo sin su carga, para comparar y para los tests.
    enum Tipo: String, Equatable, CaseIterable {
        case cargando, error, postcarrera, objetivo, ultima, vacio
    }

    var tipo: Tipo {
        switch self {
        case .cargando: return .cargando
        case .error: return .error
        case .postcarrera: return .postcarrera
        case .objetivo: return .objetivo
        case .ultima: return .ultima
        case .vacio: return .vacio
        }
    }
}

/// UNA acción por momento (§10.5): la salida del hueco más importante que tenga el póster.
enum AccionObjetivoCarrera: Equatable {
    /// Abre el detalle: predicho hoy + camino al objetivo.
    case verCamino
    /// Abre la hoja del tiempo objetivo (el hueco que el atleta llena con un acto).
    case fijarMeta(cambia: Bool)
    case hacerPrincipal
    case conectarPareja

    var etiqueta: String {
        switch self {
        case .verCamino: return "Ver mi camino"
        case .fijarMeta(let cambia): return cambia ? "Cambiar tiempo objetivo" : "Fijar tiempo objetivo"
        case .hacerPrincipal: return "Hacer objetivo principal"
        case .conectarPareja: return "Conecta a tu pareja"
        }
    }
}

/// Las cuentas de una carrera pasada que la pantalla pinta y NO calcula.
struct ResumenCarrera: Equatable {
    let totalS: Int?
    let correrS: Int?
    /// Solo si están las ocho estaciones: una suma de siete no es «tus estaciones».
    let estacionesS: Int?
    let roxzoneS: Int?
    let puesto: String?
    /// Esta carrera − la individual anterior con resultado (negativo = más rápido). Solo en individual.
    let deltaAnteriorS: Int?
}

struct PuntoEvolucion: Equatable {
    let raceId: Int
    let fecha: String
    let totalS: Int
    /// Respecto a la más lenta de la ventana (más alta = más lenta).
    let fraccion: Double
    let ultimo: Bool
}

enum DecideCarreras {

    /// Cuántos días después de correr una carrera SIN resultado sigue siendo lo primero que se le
    /// pide al atleta. Pasado ese plazo la carrera baja al historial con su «resultado pendiente» y
    /// su salida, y el objetivo vuelve a mandar. No es método de un entrenador (nadie decide cuándo
    /// se importa un resultado): es una decisión de producto, con nombre para que no viva como un 14
    /// suelto.
    static let diasPostcarrera = 14

    /// Cuántas carreras entran en la gráfica de evolución.
    static let puntosEvolucion = 4

    // MARK: Ordenar y elegir

    /// La más próxima primero; sin fecha, al final; a igual día manda el principal y después el
    /// nombre (un orden total: dos carreras el mismo día no se intercambian entre pintadas). No se
    /// fía del orden del cable.
    static func ordenarProximas(_ lista: [ProximaCarrera]) -> [ProximaCarrera] {
        lista.sorted { a, b in
            let fa = a.fecha ?? "9999-12-31"
            let fb = b.fecha ?? "9999-12-31"
            if fa != fb { return fa < fb }
            if esPrincipal(a) != esPrincipal(b) { return esPrincipal(a) }
            let porNombre = a.nombre.compare(b.nombre, options: [], range: nil, locale: Self.es)
            if porNombre != .orderedSame { return porNombre == .orderedAscending }
            return a.raceId < b.raceId
        }
    }

    private static let es = Locale(identifier: "es")

    static func esPrincipal(_ c: ProximaCarrera) -> Bool { c.prioridad == .principal }

    /// El objetivo principal: el primero (el más próximo) cuya prioridad es principal.
    static func principalDe(_ lista: [ProximaCarrera]) -> ProximaCarrera? {
        ordenarProximas(lista).first(where: esPrincipal)
    }

    /// Pasadas, la más reciente primero (sin fecha, al fondo).
    static func ordenarPasadas(_ lista: [CarreraPasada]) -> [CarreraPasada] {
        lista.sorted { a, b in
            let fa = a.fecha ?? "0000-01-01"
            let fb = b.fecha ?? "0000-01-01"
            return fa == fb ? a.raceId > b.raceId : fa > fb
        }
    }

    /// La carrera más reciente con resultado, sea del formato que sea.
    static func ultimaConResultado(_ pasadas: [CarreraPasada]) -> CarreraPasada? {
        ordenarPasadas(pasadas).first { $0.resultadoS != nil }
    }

    /// Días de calendario de `desde` a `hasta` (ISOs). Nil si alguno no se lee.
    static func diasEntre(_ desde: String, _ hasta: String) -> Int? {
        guard let inicio = FechaES.fecha(desde) else { return nil }
        return FechaES.diasHasta(hasta, desde: inicio)
    }

    /// La carrera corrida hace poco cuyo resultado aún no está importado, si la hay.
    static func pendienteReciente(
        pasadas: [CarreraPasada],
        hoy: String,
        plazo: Int = diasPostcarrera
    ) -> (carrera: CarreraPasada, dias: Int)? {
        var mejor: (carrera: CarreraPasada, dias: Int)?
        for p in pasadas {
            guard p.resultadoS == nil, let fecha = p.fecha, let dias = diasEntre(fecha, hoy) else { continue }
            if dias < 0 || dias > plazo { continue }
            if mejor == nil || dias < mejor!.dias { mejor = (p, dias) }
        }
        return mejor
    }

    // MARK: El sujeto

    static func sujeto(_ l: LecturaCarreras, plazo: Int = diasPostcarrera) -> SujetoCarreras {
        if l.cargaHub == .fria { return .cargando }
        if l.cargaHub == .error { return .error }

        if let pendiente = pendienteReciente(pasadas: l.pasadas, hoy: l.hoy, plazo: plazo) {
            return .postcarrera(carrera: pendiente.carrera, dias: pendiente.dias)
        }

        let proximas = ordenarProximas(l.proximas)
        if let principal = proximas.first(where: esPrincipal) { return .objetivo(carrera: principal, principal: true) }
        if let primera = proximas.first { return .objetivo(carrera: primera, principal: false) }

        if let ultima = ultimaConResultado(l.pasadas) { return .ultima(carrera: ultima) }
        return .vacio
    }

    /// Las próximas que NO son el sujeto, en orden. Si el sujeto es una carrera de ahí, sale de la
    /// lista (no se enseña dos veces); si es otra cosa (una carrera recién corrida, la última),
    /// entran todas, el principal el primero.
    static func proximasRestantes(_ l: LecturaCarreras, sujeto s: SujetoCarreras) -> [ProximaCarrera] {
        let todas = ordenarProximas(l.proximas)
        if case .objetivo(let carrera, _) = s { return todas.filter { $0.raceId != carrera.raceId } }
        return todas
    }

    // MARK: La acción del póster del objetivo

    static func accionObjetivo(principal: Bool, carrera: ProximaCarrera, prediccion: PrediccionCarrera) -> AccionObjetivoCarrera {
        if !principal { return .hacerPrincipal }
        if prediccion == .sinMeta || (prediccion == .noAplica && carrera.metaS == nil) { return .fijarMeta(cambia: false) }
        if prediccion == .noAplica { return .fijarMeta(cambia: true) }
        if prediccion == .sinPareja { return .conectarPareja }
        return .verCamino
    }

    // MARK: El resumen de una carrera pasada

    /// La individual con resultado inmediatamente anterior a `carrera`.
    private static func anteriorIndividual(_ carrera: CarreraPasada, _ pasadas: [CarreraPasada]) -> CarreraPasada? {
        guard let fecha = carrera.fecha else { return nil }
        return ordenarPasadas(pasadas).first {
            $0.raceId != carrera.raceId && $0.formato == .individual && $0.resultadoS != nil
                && $0.fecha != nil && $0.fecha! < fecha
        }
    }

    static func resumenDe(_ carrera: CarreraPasada, _ pasadas: [CarreraPasada]) -> ResumenCarrera {
        let previa = carrera.formato == .individual ? anteriorIndividual(carrera, pasadas) : nil
        let delta: Int? = {
            guard let total = carrera.resultadoS, let anterior = previa?.resultadoS else { return nil }
            return total - anterior
        }()
        return ResumenCarrera(
            totalS: carrera.resultadoS,
            correrS: carrera.correrS,
            estacionesS: estacionesTotalS(carrera),
            roxzoneS: carrera.roxzoneS,
            puesto: Formato.puesto(carrera.puesto, campo: carrera.campo),
            deltaAnteriorS: delta
        )
    }

    /// Los índices canónicos de las ocho estaciones de trabajo, en orden de carrera (los impares son
    /// los km). Salen de `HyroxStation`, que es donde vive el diseño de los 16 tramos.
    static let indicesEstacion: [Int] = HyroxStation.labels.keys
        .filter { !HyroxStation.runIndices.contains($0) }
        .sorted()

    /// Tiempo total en estaciones: solo si están LAS OCHO. Una suma de siete no es «tus estaciones».
    static func estacionesTotalS(_ c: CarreraPasada) -> Int? {
        let porIndice = Dictionary(c.estaciones.map { ($0.indice, $0.segundos) }, uniquingKeysWith: { a, _ in a })
        var total = 0
        for i in indicesEstacion {
            guard let s = porIndice[i] ?? nil, s > 0 else { return nil }
            total += s
        }
        return total
    }

    // MARK: Evolución

    /// Los totales de las últimas individuales con resultado y fecha, de la más antigua a la más
    /// reciente. Menos de dos no es una evolución: no se dibuja. Una de dobles no entra (el tiempo es
    /// del equipo).
    static func evolucion(_ pasadas: [CarreraPasada], n: Int = puntosEvolucion) -> [PuntoEvolucion]? {
        let ventana = pasadas
            .filter { $0.formato == .individual && $0.resultadoS != nil && $0.fecha != nil }
            .sorted { a, b in a.fecha! == b.fecha! ? a.raceId < b.raceId : a.fecha! < b.fecha! }
            .suffix(n)
        guard ventana.count >= 2 else { return nil }
        let maximo = Double(ventana.map { $0.resultadoS! }.max() ?? 1)
        return ventana.enumerated().map { i, p in
            PuntoEvolucion(
                raceId: p.raceId,
                fecha: p.fecha!,
                totalS: p.resultadoS!,
                fraccion: Double(p.resultadoS!) / maximo,
                ultimo: i == ventana.count - 1
            )
        }
    }

    /// ¿No hay NI UN puesto por estación? Entonces la sección lo dice: comparar sin campo es inventar.
    static func estacionesSinPuesto(_ estaciones: [EstacionVsReferencia]) -> Bool {
        !estaciones.isEmpty && estaciones.allSatisfy { $0.fraccion == nil }
    }

    /// ¿Hay carreras con resultado y NINGUNA es individual? El análisis no puede existir y se dice por qué.
    static func soloDeEquipo(_ pasadas: [CarreraPasada]) -> Bool {
        pasadas.contains { $0.resultadoS != nil } && !pasadas.contains { $0.resultadoS != nil && $0.formato == .individual }
    }

    /// Los que faltan por nombre, con un máximo visible («A, B y 2 más»).
    static func listaCorta(_ nombres: [String], max: Int = 3) -> String {
        if nombres.count <= max {
            if nombres.count <= 1 { return nombres.joined() }
            return "\(nombres.dropLast().joined(separator: ", ")) y \(nombres[nombres.count - 1])"
        }
        return "\(nombres.prefix(max - 1).joined(separator: ", ")) y \(nombres.count - (max - 1)) más"
    }

    // MARK: Etiquetas de una carrera

    /// «Dobles» o «Relevos». Nil en individual: el chip solo existe cuando el tiempo es del equipo.
    static func etiquetaEquipo(_ formato: FormatoCarrera) -> String? {
        formato.esDeEquipo ? formato.etiqueta : nil
    }

    /// «Individual · Open · Hombres». En una carrera que NO es HYROX ni DEKA el servidor rellena
    /// estos tres con sus defectos (nadie los eligió): pintarlos sería enseñar como dato del atleta lo
    /// que es un relleno (§7). Con el chip de equipo puesto, el formato no se repite.
    static func lineaCategoria(_ c: ProximaCarrera) -> String? {
        guard c.tipoEvento != .otro else { return nil }
        let partes = [
            c.formato.esDeEquipo ? nil : c.formato.etiqueta,
            c.division?.etiqueta,
            c.categoria?.etiqueta,
        ].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// «con Aina» / «con Aina y Joan» / «con Aina, Joan y Pau». Nil sin equipo.
    static func textoEquipo(_ companeros: [CompaneroDeEquipo]) -> String? {
        let nombres = companeros
            .sorted { $0.posicion < $1.posicion }
            .map { $0.nombre.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if nombres.isEmpty { return nil }
        if nombres.count == 1 { return "con \(nombres[0])" }
        return "con \(nombres.dropLast().joined(separator: ", ")) y \(nombres[nombres.count - 1])"
    }
}

// MARK: - La foto de una carrera

extension ProximaCarrera {
    /// Su foto del catálogo: la misma para la misma carrera en toda la app (`BrandImagery`).
    var foto: String { BrandImagery.raceCardBackground(raceId: raceId, nombre: nombre, fecha: fecha) }
}

extension CarreraPasada {
    var foto: String { BrandImagery.raceCardBackground(raceId: raceId, nombre: nombre, fecha: fecha) }
}
