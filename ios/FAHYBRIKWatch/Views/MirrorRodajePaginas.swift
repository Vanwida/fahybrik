import SwiftUI

// LAS TRES PÁGINAS DE CORRER EN ESPEJO (FH-30: solo ≡ espejo, misma cara).
//
// Sin móvil, correr tiene Datos | Vivo | Controles (`LiveFlowView`). El móvil
// lleva el motor el 90 % de los días y en espejo la muñeca sólo tenía Vivo y
// Controles: a Datos —la sesión: tiempo, distancia, ritmo medio, pulso— se le
// olvidó portarse. Estas tres vistas son esa cara leída de la TRAMA:
//
//   · el cromo es `RodajeCromo`, el mismo que `RodajeMarco` en solitario;
//   · QUÉ dice cada página lo deciden `RodajeLamina` (Vivo), `RodajeDatos`
//     (Datos) y `RodajeControles` (Controles), compartidos con las dos vías;
//   · aquí sólo se cablea la fuente: la trama, el pulso y los metros de la
//     muñeca, y las órdenes que viajan al móvil.
//
// El resto de modalidades en espejo NO pasa por aquí: dos páginas y el índice
// del sistema, como hasta ahora.

/// El vivo: la lámina pintada desde la trama. Rodaje de corrido, serie de
/// trabajo y recuperación —los tres estados— salen de `RodajeLamina.lectura`, el
/// mismo dato que lee `RodajeVivoPage` sin móvil.
struct MirrorRodajeFace: View {
    let frame: MirrorStateFrame
    let zone: HRZone?
    let elapsed: Double
    /// Segundos desde que aterrizó la trama, para envejecer la cuenta atrás de
    /// la recuperación igual que la envejece `MirrorTimedRest` al decidir cuándo
    /// mandar el avance (los timers del iPhone mueren en el bolsillo).
    let desdeTrama: TimeInterval
    let bisel: AnyView?
    let onAvanzar: () -> Void

    var body: some View {
        let ventana = RodajeLamina.Ventana(trama: frame, elapsed: elapsed, desdeTrama: desdeTrama)
        RodajeCromo(
            zona: zone,
            enRecupera: ventana.enRecupera,
            bisel: bisel,
            apagado: frame.phase == MirrorWire.Phase.paused ? 0.42 : 1
        ) {
            RodajeVivoCuerpo(
                lectura: RodajeLamina.lectura(ventana),
                punto: RodajePagina.vivo.punto,
                onToca: onAvanzar
            )
        }
    }
}

/// Datos: «la sesión». El reloj sale de la trama re-basado en local (los timers
/// del iPhone mueren en el bolsillo); la distancia y el pulso, de la muñeca.
struct MirrorRodajeDatosPage: View {
    let owner: WatchPrimaryOwner
    let frame: MirrorStateFrame
    let bisel: AnyView?
    /// Segundos desde la última trama mientras el reloj corre (0 en pausa).
    let desdeTrama: (Date) -> TimeInterval

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let ventana = RodajeLamina.Ventana(trama: frame, elapsed: 0)
            RodajeCromo(zona: owner.liveZone, enRecupera: ventana.enRecupera, bisel: bisel) {
                RodajeDatosCuerpo(lectura: RodajeDatos.lectura(.init(
                    trama: frame,
                    desdeTrama: desdeTrama(context.date),
                    metrosApple: owner.distanceMeters,
                    bpm: owner.liveHR,
                    zona: owner.liveZone
                )))
            }
        }
    }
}

/// Controles: las piezas de la lámina con las acciones del espejo. Pausar y
/// reanudar paran o arrancan la grabación de la muñeca y lo avisan al móvil;
/// Terminar pide confirmación; Descartar sólo existe con el enlace roto.
struct MirrorRodajeControlesPage: View {
    let owner: WatchPrimaryOwner
    let frame: MirrorStateFrame
    let bisel: AnyView?
    let desdeTrama: (Date) -> TimeInterval

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let ventana = RodajeLamina.Ventana(trama: frame, elapsed: 0)
            RodajeCromo(zona: owner.liveZone, enRecupera: ventana.enRecupera, bisel: bisel) {
                RodajeControles(
                    encabezado: RodajeLamina.encabezadoControles(
                        ventana,
                        sesionS: frame.sessionElapsed + desdeTrama(context.date)
                    ),
                    pausado: ventana.enPausa,
                    onPausa: alternarPausa,
                    avisoSinEnlace: owner.phoneUnlinked,
                    pie: "El entreno se controla desde el iPhone",
                    onTerminar: { owner.finishByAthlete() },
                    onDescartar: owner.phoneUnlinked ? { owner.discardByAthlete() } : nil
                )
            }
        }
    }

    private func alternarPausa() {
        if frame.phase == MirrorWire.Phase.paused {
            owner.resumeIfPaused()
            owner.sendCommand(MirrorWire.CommandKind.resume)
        } else {
            owner.pause()
            owner.sendCommand(MirrorWire.CommandKind.pause)
        }
    }
}
