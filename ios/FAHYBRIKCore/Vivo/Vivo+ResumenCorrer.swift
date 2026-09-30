import Foundation

// EL RESUMEN DE CORREDOR (P13) — primero lo que un corredor mira: si las series salieron («5 de 6 dentro»),
// cuánto y cuánto tiempo, y el ritmo de lo FUERTE (no la media, que mezcla trote y calentamiento). Luego cada
// serie contra SU objetivo, cada km y el pulso con las zonas del coach. Espejo de `resumen-correr.tsx`.
//
// Puro: del motor ya terminado a lo que el reloj pinta. Lo que el motor no mide no se inventa: un km sin
// barómetro no lleva desnivel, un pulso que nadie tomó es «—».

extension Vivo {

    /// Un dato de una línea del resumen: «11,62 km», «3:48 /km en las series».
    struct DatoResumen: Equatable {
        var valor: String
        var unidad: String?
    }

    /// El pulso de la sesión y el tiempo que pasó en cada zona del coach.
    struct PulsoResumen: Equatable {
        var medio: Int?
        var maximo: Int?
        /// Segundos en cada zona, de Z1 a ZN. Vacío si el coach no tiene zonas.
        var zonasS: [Double]
    }

    struct ResumenCorrer: Equatable {
        /// «6 × 1000 m · completa», «Correr libre».
        var contexto: [String]
        var completitud: Completitud
        var heroe: DatoResumen
        /// Las dos líneas bajo el héroe.
        var lineas: [DatoResumen]
        /// Las series contra su objetivo, en páginas que caben en la muñeca; vacío si no hubo.
        var series: [PaginaVueltasMuneca]
        /// Los km (o vueltas) automáticos, en páginas; vacío si no hubo.
        var km: [PaginaVueltasMuneca]
        var pulso: PulsoResumen
    }

    /// Cuántas filas caben en una página de vueltas del resumen (a 46 mm: 30 pt cada una bajo el título).
    static let filasPorPaginaResumen = 5

    /// ¿Es una sesión de corredor? Todo el trabajo principal que mide es de correr (calle o cinta): la fuerza, el
    /// ergo y los circuitos siguen con su propio resumen.
    static func esSesionDeCorrer(_ pasos: [Paso]) -> Bool {
        let trabajo = pasos.filter { $0.rol == .trabajo && $0.fase == .principal }
        guard !trabajo.isEmpty else { return false }
        return trabajo.allSatisfy { p in
            let f = familiaDe(p)
            return f == .correr || f == .cinta
        }
    }

    private static func paginasDeVueltas(_ vueltas: [Vuelta], objetivo: String?) -> [PaginaVueltasMuneca] {
        guard !vueltas.isEmpty else { return [] }
        // Las filas de `filasDeVueltas` van la última primero: se le dan al revés para que el resumen lea 1, 2, 3…
        let (titulo, filas) = filasDeVueltas(Array(vueltas.reversed()), objetivo: objetivo, visibles: vueltas.count)
        let ordenadas = Array(filas.reversed())
        return stride(from: 0, to: ordenadas.count, by: filasPorPaginaResumen).map { desde in
            PaginaVueltasMuneca(titulo: titulo, enCurso: nil, filas: Array(ordenadas[desde..<Swift.min(desde + filasPorPaginaResumen, ordenadas.count)]), vacia: nil)
        }
    }

    /// El resumen de la sesión que acaba de terminar. `kmAuto`: las vueltas automáticas que llevó el vivo
    /// (`RegistroVueltas`, que vive en la pantalla y no en el motor). Nil si no es una sesión de corredor.
    static func resumenDeCorrer(_ sesion: WorkoutSession, kmAuto: [Vuelta]) -> ResumenCorrer? {
        let plan = planDe(sesion)
        guard esSesionDeCorrer(plan.pasos) else { return nil }
        let e = estadoDe(sesion, plan: plan)
        let completitud = sesion.completitudFinal ?? Completitud(estado: .libre, cuenta: nil, motivo: nil)
        let juzgadas = e.vueltas.filter { $0.veredicto != nil }
        let dentro = juzgadas.filter { $0.veredicto == .dentro }.count
        let distancia = e.sesion.metros.map(fmtDistancia)
        let libre = completitud.estado == .libre
        let titulo = libre ? "Correr libre" : (hoyDe(plan.pasos)?.titulo ?? nombreClase(.rodaje))

        let conMetros = e.vueltas.filter { ($0.metros ?? 0) > 0 }
        let metrosFuertes = conMetros.reduce(0) { $0 + ($1.metros ?? 0) }
        let ritmoFuerte: Double? = metrosFuertes > 50 ? conMetros.reduce(0) { $0 + $1.segundos } / (metrosFuertes / 1000) : nil

        let heroe = juzgadas.isEmpty
            ? DatoResumen(valor: distancia?.valor ?? "—", unidad: distancia?.unidad ?? "km")
            : DatoResumen(valor: "\(dentro) de \(juzgadas.count)", unidad: "dentro")
        let lineas: [DatoResumen]
        if juzgadas.isEmpty {
            lineas = [DatoResumen(valor: "\(fmtReloj(e.sesion.t)) · \(fmtRitmo(e.sesion.ritmoMedio))", unidad: "/km"),
                      DatoResumen(valor: pulsoMedio(sesion).map(String.init) ?? "—", unidad: "ppm medio")]
        } else {
            lineas = [DatoResumen(valor: "\(distancia?.valor ?? "—") · \(fmtReloj(e.sesion.t))", unidad: distancia?.unidad),
                      DatoResumen(valor: fmtRitmo(ritmoFuerte), unidad: "/km en las series")]
        }
        let grupo = grupoPrincipal(filasDePasos(plan.pasos))
        let objetivo = grupo.flatMap { principal($0.paso) }.map { fmtObjetivo($0) }
        return ResumenCorrer(
            contexto: libre ? [titulo] : [titulo, completitud.estado.rawValue],
            completitud: completitud,
            heroe: heroe,
            lineas: lineas,
            series: paginasDeVueltas(e.vueltas, objetivo: objetivo),
            km: paginasDeVueltas(kmAuto.filter { $0.clase == .auto }, objetivo: nil),
            pulso: pulsoDe(sesion, zonas: plan.zonas)
        )
    }

    // MARK: - El pulso

    /// El pulso medio de los tramos que lo tomaron, ponderado por lo que duró cada uno.
    private static func pulsoMedio(_ sesion: WorkoutSession) -> Int? {
        let con = sesion.laps.filter { $0.avgHRBpm != nil && $0.durationSeconds > 0 }
        let t = con.reduce(0) { $0 + $1.durationSeconds }
        guard t > 0 else { return nil }
        return Int((con.reduce(0) { $0 + Double($1.avgHRBpm ?? 0) * $1.durationSeconds } / t).rounded())
    }

    private static func pulsoDe(_ sesion: WorkoutSession, zonas: ZonasCoach?) -> PulsoResumen {
        let n = zonas?.techos.count ?? 0
        let porZona = (1...Swift.max(1, n)).map { z in sesion.laps.reduce(0.0) { $0 + ($1.zoneSecondsByZone[z] ?? 0) } }
        return PulsoResumen(medio: pulsoMedio(sesion), maximo: sesion.laps.compactMap(\.maxHRBpm).max(), zonasS: n > 0 ? porZona : [])
    }
}
