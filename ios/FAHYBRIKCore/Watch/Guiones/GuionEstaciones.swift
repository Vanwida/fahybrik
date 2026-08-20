import SwiftUI

// GuionEstaciones — el guion puro (Estado → página) de una lista por ESTACIONES
// del motor NATIVO: For Time / Chipper / Ladder / Rounds / simulación HYROX
// recorridos como RUTA, no como rondas que se repiten
// (`WorkoutSegment.fixedListIsStations`). Lo usa `FixedLiveView`, cuando el
// reloj corre el bloque él solo.
//
// LA TABLA que decide qué formato entra por esta página, y por qué el sujeto
// cuenta atrás, arriba o hacia el objetivo, vive comentada en
// `FixedLiveView.swift` — donde se toma la decisión. Aquí sólo la
// implementación pura, para poder probarla sin reloj ni sesión viva
// (`FAHYBRIKTests/Workout/GuionEstacionesTests.swift`).
//
// 19-ago — SE AÑADE el cierre por OBJETIVO MEDIBLE (metros / calorías), el
// mismo hueco que ya resolvió `GuionSeries` para una serie de calle suelta
// («lo que falta se redondea hacia ARRIBA: no se da por acabado un tramo antes
// de tiempo» — mismo criterio aquí). Antes, un Run de 1.000 m dentro de una
// ruta mixta (Run · SkiErg · Run · Burpees · Run · Row · Run · Wall Balls cayó
// en la rama "sin caja" y sólo enseñaba el crono de la estación contando
// arriba — ni metros ni ritmo, la queja de fondo de Alex. `LiveTramo` YA sabe
// el objetivo (`targetDistanceMeters`/`targetCalories`); lo único que faltaba
// era una fuente de "cuánto llevo YA" por estación — el ergómetro la tenía
// (`tramoErgDistanceMeters`, anclada en cada `syncTramoIfNeeded`), la carrera
// no (`tramoRunCoveredMeters` caía a la lectura de TODO el bloque, la de otro
// arreglo en curso — ver el comentario de `FixedLiveView.paginaEstacion`).
//
// POR QUÉ EL MODO SIGUE SIENDO `.mando` Y NO `.ojeada` COMO EN GuionSeries:
// una serie de calle SUELTA cierra su hito por GPS (motor de carrera
// dedicado); una ESTACIÓN de una ruta mixta no — `LiveTramo.crossesMachineGoal`
// sólo cruza por ERGÓMETRO (`guard isErg else { return false }`), nunca por
// carrera. Sin auto-cierre, el toque es la ÚNICA forma de acabar un Run dentro
// de la ruta, así que tiene que seguir anunciado.
//
// POR QUÉ NO ES `GuionRuta`: ya existe un guion con ese nombre
// (`FAHYBRIKCore/Watch/Guiones/GuionRuta.swift`), pero sirve al RELEVO POR
// CABLE (`GuionDelEspejo` → `MirrorHUDView`, cuando el móvil manda el estado
// por Watch Connectivity) y es un modelo más viejo y más pobre: sólo distingue
// "tramo de carrera" de "estación ciega". El motor nativo SÍ conoce las cuatro
// formas de cerrar un tramo (`LiveTramo.swift`). Reconciliar las dos
// superficies cruza `PhoneMirrorService` y queda fuera de este cambio —
// auditoría 18-ago, card 67.
enum GuionEstaciones {

    /// Cómo se cierra ESTA estación — decide el sujeto, igual que en
    /// `GuionSeries.Cierre` para una serie suelta.
    enum Cierre: Equatable {
        /// "2 min de bici": el reloj cierra solo.
        case caja(segundos: Int)
        /// Un objetivo de DISTANCIA — carrera (GPS/cinta) o ergómetro (remo,
        /// ski). `cubiertos` es lo que ya lleva la estación; `nil` = aún sin
        /// lectura (GPS sin fijar, o ergómetro sin emparejar).
        case metros(objetivo: Double, cubiertos: Double?)
        /// Un objetivo de CALORÍAS — sólo ergómetro. Misma regla que metros.
        case calorias(objetivo: Int, cubiertas: Int?)
        /// Nada mide el cierre — reps ("50 wall balls") o ningún objetivo
        /// declarado: sólo lo sabe el atleta, y sólo él lo cierra con el toque.
        case atleta
    }

    struct Estado {
        /// El movimiento tal y como lo dice `LiveTramo.label` — "Remo", "Wall Balls".
        let etiqueta: String
        /// La dosis ya formateada del coach ("500 m", "15 cal"), o `nil` cuando
        /// el tramo no declara medida (`LiveTramo.workLine`). Sólo se pinta en
        /// el contexto cuando `cierre` NO es un objetivo medible — con
        /// objetivo, el sujeto YA es la dosis restante y repetirla sería el
        /// tercer dato en el mismo sitio.
        let dosis: String?
        let cierre: Cierre
        /// Sólo importa con `cierre == .metros`: si el objetivo lo mide la
        /// CARRERA (GPS/cinta) — entonces el segundo nivel es el RITMO — o un
        /// ERGÓMETRO, que no tiene ritmo por km y mantiene el total del
        /// bloque. Se ignora en los demás cierres.
        let esCarrera: Bool
        /// El ritmo medido DE ESTA ESTACIÓN (seg/km) — sólo tiene sentido
        /// cuando `esCarrera`. `nil` sin GPS todavía, o si no aplica.
        let ritmoSecPorKm: Int?
        /// Lo que queda de la caja, ya resuelto por el motor
        /// (`WorkoutSession.tramoWorkRemaining`). `nil` sin caja, o durante el
        /// descanso entre estaciones — el motor la apaga ahí a propósito, y el
        /// caso de abajo cae al tamaño íntegro de la caja en vez de mentir un 0.
        let cajaRestanteSegundos: Double?
        /// El parcial de la estación contando hacia ARRIBA
        /// (`WorkoutSession.tramoElapsedSeconds`) — el numeral cuando nada
        /// más mide el cierre: nada que contar hacia atrás sin inventar un final.
        let enEstacionSegundos: Double
        /// El crono del bloque entero — la puntuación real de un For Time /
        /// HYROX sim. Nunca se apaga del todo: baja al segundo nivel cuando
        /// nada más lo ocupa (un ergómetro, o sin objetivo medible).
        let bloqueSegundos: Double
        /// 1-based: en qué estación estás, de cuántas.
        let posicion: Int
        let total: Int

        init(etiqueta: String, dosis: String?, cierre: Cierre,
             esCarrera: Bool = false, ritmoSecPorKm: Int? = nil,
             cajaRestanteSegundos: Double? = nil, enEstacionSegundos: Double,
             bloqueSegundos: Double, posicion: Int, total: Int) {
            self.etiqueta = etiqueta
            self.dosis = dosis
            self.cierre = cierre
            self.esCarrera = esCarrera
            self.ritmoSecPorKm = ritmoSecPorKm
            self.cajaRestanteSegundos = cajaRestanteSegundos
            self.enEstacionSegundos = enEstacionSegundos
            self.bloqueSegundos = bloqueSegundos
            self.posicion = posicion
            self.total = total
        }
    }

    static func pagina(_ e: Estado, onEstacionHecha: (() -> Void)? = nil) -> WatchPagina {
        let (sujeto, unidad, tono) = sujetoDeEstacion(e)
        let (etiqueta, valor) = segundoDeEstacion(e)
        return WatchPagina(
            id: "estacion",
            contexto: contextoDeEstacion(e),
            modo: .mando,
            sujeto: sujeto,
            unidad: unidad,
            tono: tono,
            segundoEtiqueta: etiqueta,
            segundoValor: valor,
            accion: "Toca · estación hecha",
            onToca: onEstacionHecha
        )
    }

    /// Con objetivo medible el sujeto YA ES la dosis que falta, así que el
    /// contexto sólo necesita decir "falta" para no confundir llevar con
    /// faltar — mismo patrón que "REMO · TE FALTAN" del ergo del doble y
    /// «Serie · te faltan» de `GuionSeries`.
    private static func contextoDeEstacion(_ e: Estado) -> String {
        switch e.cierre {
        case .metros, .calorias:
            return "\(e.etiqueta) · te faltan"
        case .caja, .atleta:
            return e.dosis.map { "\(e.etiqueta) · \($0)" } ?? e.etiqueta
        }
    }

    private static func sujetoDeEstacion(_ e: Estado) -> (String, String?, Color) {
        switch e.cierre {
        case let .caja(segundos):
            guard segundos > 0 else { return sujetoDeParcial(e) }   // 0 no es una caja real
            let queda = e.cajaRestanteSegundos ?? Double(segundos)
            return (WatchFormat.countdown(queda), nil, WatchTinte.urgente(queda))
        case let .metros(objetivo, cubiertos):
            let faltan = max(0, objetivo - (cubiertos ?? 0))
            return (String(Int(faltan.rounded(.up))), "m", WatchTheme.ink)
        case let .calorias(objetivo, cubiertas):
            let faltan = max(0, objetivo - (cubiertas ?? 0))
            return ("\(faltan)", "cal", WatchTheme.ink)
        case .atleta:
            return sujetoDeParcial(e)
        }
    }

    /// Nada mide el cierre: el parcial propio de la estación, contando arriba
    /// — «llevas X en esta estación», igual que el doble.
    private static func sujetoDeParcial(_ e: Estado) -> (String, String?, Color) {
        (WatchFormat.clock(e.enEstacionSegundos), nil, WatchTheme.ink)
    }

    private static func segundoDeEstacion(_ e: Estado) -> (String?, String?) {
        if case .metros = e.cierre, e.esCarrera {
            // Sin GPS todavía no se pinta una etiqueta vacía: se calla — el
            // total del bloque no vuelve aquí porque el sujeto ya se lo llevó
            // a la carrera; sin ritmo, la página se queda con un solo dato,
            // que es lo que hay.
            guard let ritmo = e.ritmoSecPorKm else { return (nil, nil) }
            return ("GPS", "\(WatchFormat.pace(ritmo))\(Formato.UnidadRitmo.porKm.rawValue)")
        }
        let posicion = "\(e.posicion) / \(e.total)"
        return ("Total", "\(WatchFormat.clock(e.bloqueSegundos)) · \(posicion)")
    }
}
