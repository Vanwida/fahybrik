import SwiftUI

// GuionEstaciones — el guion puro (Estado → página) de una lista por ESTACIONES
// del motor NATIVO: For Time / Chipper / Ladder / Rounds / simulación HYROX
// recorridos como RUTA, no como rondas que se repiten
// (`WorkoutSegment.fixedListIsStations`). Lo usa `FixedLiveView`, cuando el
// reloj corre el bloque él solo.
//
// LA TABLA que decide qué formato entra por esta página, y por qué el sujeto
// cuenta atrás o arriba, vive comentada en `FixedLiveView.swift` — donde se
// toma la decisión. Aquí sólo la implementación pura, para poder probarla sin
// reloj ni sesión viva (`FAHYBRIKTests/Workout/GuionEstacionesTests.swift`).
//
// POR QUÉ NO ES `GuionRuta`: ya existe un guion con ese nombre
// (`FAHYBRIKCore/Watch/Guiones/GuionRuta.swift`), pero sirve al RELEVO POR
// CABLE (`GuionDelEspejo` → `MirrorHUDView`, cuando el móvil manda el estado
// por Watch Connectivity) y es un modelo más viejo y más pobre: sólo distingue
// "tramo de carrera" de "estación ciega", porque el relevo nunca le mandó las
// cuatro formas de cerrar una estación que `LiveTramo` ya conoce (metros,
// calorías, segundos, reps — ver `LiveTramo.swift`). El motor nativo SÍ las
// conoce, así que el sujeto de esta página puede ser el correcto: la caja de
// reloj cuando la hay, el parcial propio cuando no. Reconciliar las dos
// superficies (que el relevo hable el mismo `LiveTramo` que el motor nativo)
// es un cambio más grande, cruza `PhoneMirrorService`, y queda fuera de este —
// auditoría 18-ago, card 67.
enum GuionEstaciones {

    struct Estado {
        /// El movimiento tal y como lo dice `LiveTramo.label` — "Remo", "Wall Balls".
        let etiqueta: String
        /// La dosis ya formateada del coach ("500 m", "15 cal"), o `nil` cuando
        /// el tramo no declara medida (`LiveTramo.workLine`).
        let dosis: String?
        /// Segundos que box la caja de reloj de ESTA estación ("2 min de bici"),
        /// o `nil` cuando cierra por metros / calorías / reps
        /// (`LiveTramo.boxedSeconds`).
        let cajaSegundos: Int?
        /// Lo que queda de la caja, ya resuelto por el motor
        /// (`WorkoutSession.tramoWorkRemaining`). `nil` sin caja, o durante el
        /// descanso entre estaciones — el motor la apaga ahí a propósito, y el
        /// caso de abajo cae al tamaño íntegro de la caja en vez de mentir un 0.
        let cajaRestanteSegundos: Double?
        /// El parcial de la estación contando hacia ARRIBA
        /// (`WorkoutSession.tramoElapsedSeconds`) — el numeral cuando no hay
        /// caja: nada que contar hacia atrás sin inventar un final.
        let enEstacionSegundos: Double
        /// El crono del bloque entero — la puntuación real de un For Time /
        /// HYROX sim. Nunca se apaga: baja al segundo nivel, no desaparece.
        let bloqueSegundos: Double
        /// 1-based: en qué estación estás, de cuántas.
        let posicion: Int
        let total: Int

        init(etiqueta: String, dosis: String?, cajaSegundos: Int?,
             cajaRestanteSegundos: Double?, enEstacionSegundos: Double,
             bloqueSegundos: Double, posicion: Int, total: Int) {
            self.etiqueta = etiqueta
            self.dosis = dosis
            self.cajaSegundos = cajaSegundos
            self.cajaRestanteSegundos = cajaRestanteSegundos
            self.enEstacionSegundos = enEstacionSegundos
            self.bloqueSegundos = bloqueSegundos
            self.posicion = posicion
            self.total = total
        }
    }

    static func pagina(_ e: Estado, onEstacionHecha: (() -> Void)? = nil) -> WatchPagina {
        let contexto = e.dosis.map { "\(e.etiqueta) · \($0)" } ?? e.etiqueta
        let sujeto: String
        let tono: Color
        if let caja = e.cajaSegundos, caja > 0 {
            let queda = e.cajaRestanteSegundos ?? Double(caja)
            sujeto = WatchFormat.countdown(queda)
            tono = WatchTinte.urgente(queda)
        } else {
            sujeto = WatchFormat.clock(e.enEstacionSegundos)
            tono = WatchTheme.ink
        }
        return WatchPagina(
            id: "estacion",
            contexto: contexto,
            modo: .mando,
            sujeto: sujeto,
            tono: tono,
            segundoEtiqueta: "Total",
            segundoValor: "\(WatchFormat.clock(e.bloqueSegundos)) · \(e.posicion) / \(e.total)",
            accion: "Toca · estación hecha",
            onToca: onEstacionHecha
        )
    }
}
