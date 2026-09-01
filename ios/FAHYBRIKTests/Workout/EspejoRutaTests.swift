import XCTest
@testable import FAHYBRIK

// LA RUTA EN EL ESPEJO — la reconciliación de card 67 (20-ago).
//
// Mañana Alex corre un HYROX sim de 8 estaciones: Run 1.000 m · SkiErg 500 m ·
// Run 1.000 m · Burpee Broad Jump 40 m · Run 1.000 m · Rowing 500 m · Run 1.000 m
// · Wall Balls 25. Entrena en ESPEJO — el móvil lleva el motor, el reloj repinta
// lo que le llega — y ese camino pasaba por `GuionRuta`, que sólo distinguía
// "tramo de carrera" de "estación ciega": el ski, el remo, los burpees y los wall
// balls caían todos en el crono del BLOQUE ENTERO contando arriba, nunca en lo
// que llevan o les falta de ESA estación.
//
// `GuionEstaciones` ya resolvía esto para el reloj en solitario
// (`GuionEstacionesTests.swift`, `FixedLiveView.paginaEstacion`) con sus cuatro
// cierres (caja / metros / calorías / atleta). Estos tests comprueban que
// `GuionDelEspejo` ahora lee esa MISMA decisión desde el `MirrorTramo` del
// cable, en vez de reimplementarla — cubriendo la forma EXACTA del bloque de
// mañana, estación por estación.
@MainActor
final class EspejoRutaTests: XCTestCase {

    private func frame(_ tramo: MirrorTramo, sessionElapsed: Double) -> MirrorStateFrame {
        var f = MirrorStateFrame(
            phase: MirrorWire.Phase.active, blockTitle: "HYROX sim", lineTitle: nil,
            detailLine: nil, progressText: nil, sessionElapsed: sessionElapsed, lapElapsed: 0,
            countdownRemaining: nil, targetZone: nil, isFinalStep: nil, restRemaining: nil
        )
        f.tramo = tramo
        return f
    }

    private func tramo(
        modalidad: String, etiqueta: String, dosis: String,
        rondaN: Int, rondaTotal: Int, cierre: String,
        objetivoMedida: Double? = nil, hechoMedida: Double? = nil,
        objetivoEsCalorias: Bool = false, ventanaQueda: Double? = nil, ventanaTotal: Double? = nil,
        enTramoS: Double, ritmoSecPorKm: Int? = nil
    ) -> MirrorTramo {
        MirrorTramo(
            formato: PrescriptionScheme.hyroxSim.rawValue, modalidad: modalidad, etiqueta: etiqueta,
            dosis: dosis, rondaN: rondaN, rondaTotal: rondaTotal, enDescanso: false, cierre: cierre,
            objetivoMedida: objetivoMedida, hechoMedida: hechoMedida, objetivoEsCalorias: objetivoEsCalorias,
            ventanaQueda: ventanaQueda, ventanaTotal: ventanaTotal, enTramoS: enTramoS,
            ritmoSecPorKm: ritmoSecPorKm, objetivoLabel: nil, objetivoEstado: nil, zonaViva: nil,
            siguiente: nil, cargaKg: nil, reps: nil
        )
    }

    private func primera(_ t: MirrorTramo, sessionElapsed: Double) -> WatchPagina {
        let p = GuionDelEspejo.paginas(frame(t, sessionElapsed: sessionElapsed), bpm: nil, elapsed: 0, avanzar: {})
        return p[0]
    }

    // MARK: - Run dentro de la ruta: metros que faltan + ritmo, nunca el crono del bloque

    func testRunEnLaRutaEnsenaLosMetrosQueFaltanYElRitmoNoElCronoDelBloque() {
        let t = tramo(modalidad: PrescriptionModality.run.rawValue, etiqueta: "Run", dosis: "1.000 m",
                      rondaN: 1, rondaTotal: 8, cierre: "machineGoal",
                      objetivoMedida: 1_000, hechoMedida: 340, enTramoS: 90, ritmoSecPorKm: 278)
        let p = primera(t, sessionElapsed: 2_480)
        XCTAssertEqual(p.sujeto, "660", "660 m por cubrir, no el crono de 2.480 s del bloque")
        XCTAssertEqual(p.unidad, "m")
        XCTAssertEqual(p.segundoEtiqueta, "GPS", "la carrera lleva ritmo de segundo nivel, no el total")
        XCTAssertEqual(p.segundoValor, "4:38/km")
    }

    // MARK: - SkiErg y Rowing: metros que faltan de LA ESTACIÓN, no el crono del bloque entero

    func testSkiErgEnsenaLosMetrosQueFaltanDeLaEstacionNoElCronoDelBloque() {
        let t = tramo(modalidad: PrescriptionModality.ski.rawValue, etiqueta: "SkiErg", dosis: "500 m",
                      rondaN: 2, rondaTotal: 8, cierre: "machineGoal",
                      objetivoMedida: 500, hechoMedida: 120, enTramoS: 45)
        let p = primera(t, sessionElapsed: 2_525)
        XCTAssertEqual(p.sujeto, "380", "380 m por cubrir del ski, no 42:05 del bloque")
        XCTAssertEqual(p.unidad, "m")
        // Un ergómetro no tiene ritmo/km: el segundo nivel se queda con el total
        // del bloque + posición, igual que en solitario.
        XCTAssertEqual(p.segundoEtiqueta, "Total")
        XCTAssertEqual(p.segundoValor, "42:05 · 2 / 8")
    }

    func testRowingEnsenaLosMetrosQueFaltanDeLaEstacion() {
        let t = tramo(modalidad: PrescriptionModality.row.rawValue, etiqueta: "Rowing", dosis: "500 m",
                      rondaN: 6, rondaTotal: 8, cierre: "machineGoal",
                      objetivoMedida: 500, hechoMedida: 60, enTramoS: 20)
        let p = primera(t, sessionElapsed: 3_200)
        XCTAssertEqual(p.sujeto, "440")
        XCTAssertEqual(p.unidad, "m")
    }

    /// El caso que motivó `objetivoEsCalorias`: un ergo con dosis en CALORÍAS no
    /// tiene forma de distinguirse de una en metros salvo por este campo — sin
    /// él, «faltan 9 cal» se habría pintado «faltan 9 m».
    func testErgoConDosisEnCaloriasEnsenaCaloriasNoMetros() {
        let t = tramo(modalidad: PrescriptionModality.ski.rawValue, etiqueta: "SkiErg", dosis: "15 cal",
                      rondaN: 2, rondaTotal: 8, cierre: "machineGoal",
                      objetivoMedida: 15, hechoMedida: 6, objetivoEsCalorias: true, enTramoS: 45)
        let p = primera(t, sessionElapsed: 2_525)
        XCTAssertEqual(p.sujeto, "9")
        XCTAssertEqual(p.unidad, "cal")
    }

    // MARK: - Burpee Broad Jump y Wall Balls: nada lo mide, cuenta ARRIBA el parcial de la estación

    /// 40 m de burpee broad jump es una DOSIS, no un objetivo medible — ningún
    /// sensor cuenta un burpee broad jump. Antes esto caía en "estación ciega" y
    /// enseñaba el crono del bloque entero (2.560 s); ahora cuenta el parcial
    /// propio de la estación.
    func testBurpeeBroadJumpCuentaArribaSuPropioParcialNoElCronoDelBloque() {
        let t = tramo(modalidad: PrescriptionModality.functional.rawValue, etiqueta: "Burpee Broad Jump",
                      dosis: "40 m", rondaN: 4, rondaTotal: 8, cierre: "athleteTap", enTramoS: 38)
        let p = primera(t, sessionElapsed: 2_560)
        XCTAssertEqual(p.sujeto, "00:38", "el parcial de la estación, no 42:40 del bloque")
        XCTAssertNil(p.unidad)
    }

    func testWallBallsCuentaArribaSuPropioParcial() {
        let t = tramo(modalidad: PrescriptionModality.functional.rawValue, etiqueta: "Wall Balls",
                      dosis: "25 reps", rondaN: 8, rondaTotal: 8, cierre: "athleteTap", enTramoS: 72)
        let p = primera(t, sessionElapsed: 4_100)
        XCTAssertEqual(p.sujeto, "01:12")
        XCTAssertNil(p.unidad)
    }

    // MARK: - El gesto sigue siendo el toque, en cualquier estación

    func testCualquierEstacionDeLaRutaSigueSiendoMandoYElTapAvanza() {
        var avanzo = false
        let t = tramo(modalidad: PrescriptionModality.ski.rawValue, etiqueta: "SkiErg", dosis: "500 m",
                      rondaN: 2, rondaTotal: 8, cierre: "machineGoal", objetivoMedida: 500,
                      hechoMedida: 120, enTramoS: 45)
        let paginas = GuionDelEspejo.paginas(frame(t, sessionElapsed: 2_525), bpm: nil, elapsed: 0,
                                             avanzar: { avanzo = true })
        XCTAssertEqual(paginas[0].modo, .mando)
        paginas[0].onToca?()
        XCTAssertTrue(avanzo)
    }
}
