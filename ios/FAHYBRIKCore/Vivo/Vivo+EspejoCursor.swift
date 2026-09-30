import Foundation

// EL CURSOR, DEL LADO DEL MÓVIL — de un `Vivo.EstadoVivo` (el que el móvil ya calcula
// con `Vivo.estadoDe`) al `MirrorCursor` que viaja en cada trama. Función PURA: la
// regla de qué viaja y qué no vive aquí, una sola vez, y el receptor
// (`Vivo.EspejoMuneca`) la usa para saber de dónde sacar cada lectura.
//
// La regla (P1, «un estado vivo, un pintor»): la muñeca mide sola lo que es suyo
// —el tiempo, el pulso y, corriendo con GPS, los metros y el ritmo— y de esas
// lecturas no manda nada el móvil. Lo que mide un aparato que lleva el móvil (la
// cinta enchufada, el monitor de un ergómetro) sí viaja, porque la muñeca no tiene
// de dónde sacarlo.

extension Vivo {

    /// ¿Los metros y el ritmo de este paso salen de un aparato que lleva el móvil?
    /// Corriendo: solo con la cinta ENCHUFADA (`.treadmill`); la cinta «tonta» y la
    /// calle las mide la propia muñeca (HealthKit). Cualquier otro paso (fuerza,
    /// máquina) no tiene medida propia en la muñeca: lo que tenga viene del móvil.
    static func loMideElMovil(_ p: Paso, entorno: RunEnvironment?) -> Bool {
        esCarrera(p) ? entorno == .treadmill : true
    }

    /// El cursor de esta trama. `cuentaRestanteS`: lo que queda de la cuenta de
    /// ARRANQUE del motor (`isTramoCountIn`), si hay. `parado`: los relojes del motor
    /// no corren sin que el atleta haya pausado (la puerta de un bloque).
    static func cursorDe(_ e: EstadoVivo, planHash: String, entorno: RunEnvironment?, parado: Bool = false,
                         cuentaRestanteS: Double? = nil) -> MirrorCursor {
        let movil = loMideElMovil(e.paso, entorno: entorno)
        return MirrorCursor(
            planHash: planHash,
            i: e.i,
            enPasoS: e.lecturas.t,
            sesionS: e.sesion.t,
            pausado: e.pausado,
            terminado: e.terminado,
            parado: parado,
            cuentaS: cuentaRestanteS,
            // El tiempo lo cuenta la muñeca: no viaja aunque el móvil también lo sepa.
            hecho: movil && e.paso.medida.tipo != .tiempo ? e.lecturas.hecho : nil,
            ritmo: movil ? e.lecturas.ritmo : nil,
            sesionM: movil ? e.sesion.metros : nil
        )
    }
}
