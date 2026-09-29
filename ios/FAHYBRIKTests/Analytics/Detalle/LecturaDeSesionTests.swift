import XCTest
@testable import FAHYBRIK

// LA SESIÓN, LEÍDA: lo que decide `LecturaDeSesion` sobre el detalle real del motor — el sujeto es la carga (con su peldaño y su ancla, y
// «no se sabe» cuando ningún peldaño la precia), cada tramo con su nombre, lo pedido, lo hecho, su sello y su carga, y las curvas, los parciales
// y las zonas. Traducción de `sesionDe` del doble: las mismas seis ejecuciones contra las que se rompió el modelo (§7), con la carga por tramo,
// la que NO se sabe y el caso sin plan.
final class LecturaDeSesionTests: XCTestCase {

    private func lectura(_ caso: DetalleFixtures.Caso, conCumplimiento: Bool = true) throws -> LecturaDeSesion {
        let s = try DetalleFixtures.sesion(caso)
        let fila = conCumplimiento ? DetalleFixtures.fila(de: s, en: try DetalleFixtures.cumplimiento()) : nil
        return LecturaDeSesion.desde(s, fila: fila, hoy: "2026-09-29")
    }

    // MARK: - La cabecera

    func testElSobretituloEsFechaFormatoYDuracion() throws {
        XCTAssertEqual(try lectura(.cinta).sobretitulo, "22 sep · Series · 31 min")
        XCTAssertEqual(try lectura(.cinta).titulo, "Series 4 × 1000 m en cinta")
        XCTAssertEqual(try lectura(.sentadilla).sobretitulo, "18 sep · Series de fuerza · 25 min", "el formato «sets» se nombra con la palabra canónica del plan")
    }

    func testUnEntrenoLibreSinFormatoNiTituloSeDiceComoTal() throws {
        let l = try lectura(.carreraDeSalud)
        XCTAssertEqual(l.titulo, "Entreno libre")
        XCTAssertEqual(l.sobretitulo, "13 sep · 44 min", "sin formato, solo fecha y duración")
    }

    // MARK: - El sujeto: la carga

    func testElSujetoEsLaCargaConSuPeldanoDominanteYSuAncla() throws {
        let s = try lectura(.cinta).sujeto
        XCTAssertEqual(try XCTUnwrap(s.tss), 46.63, accuracy: 0.01)
        XCTAssertEqual(s.peldano, .ritmo, "casi todo el tiempo se preció por ritmo")
        XCTAssertEqual(s.ancla, .medida)
        XCTAssertNil(s.avisoSinSaber)
        XCTAssertEqual(s.familia, .correr)
    }

    func testLaCargaDeLaSentadillaSaleDelEsfuerzoYNoLlevaAncla() throws {
        let s = try lectura(.sentadilla).sujeto
        XCTAssertEqual(s.peldano, .esfuerzo)
        XCTAssertNil(s.ancla, "el esfuerzo no depende de ningún umbral del atleta: sin chip")
        XCTAssertEqual(s.familia, .fuerza)
    }

    func testLaCargaContraLaPlanificadaSoloSaleCuandoElPlanSeSabeEntero() throws {
        XCTAssertNotNil(try lectura(.remo).sujeto.plan, "el remo lleva su plan: se dice «de N planificados»")
        XCTAssertNil(try lectura(.cinta).sujeto.plan, "un plan que no se sabe entero no es una referencia")
        XCTAssertNil(try lectura(.carreraDeSalud).sujeto.plan)
    }

    func testUnTramoSinPeldanoCuentaContraLaCoberturaYSeDiceNoComoCero() throws {
        let l = try lectura(.trineos)
        let trineo = try XCTUnwrap(l.tramos.last)
        XCTAssertEqual(trineo.carga, .noSeSabe, "sin kilos, ni pulso, ni RPE: su carga no se sabe")
        XCTAssertNil(trineo.carga.tss)
        let aviso = try XCTUnwrap(l.sujeto.avisoSinSaber)
        XCTAssertTrue(aviso.hasPrefix("No se sabe el 63 % del tiempo"), aviso)
        XCTAssertNotNil(l.sujeto.tss, "el número de lo que sí se preció se queda")
    }

    func testUnaCargaQueNingunPeldanoPrecioEsNoSeSabeYNoUnCero() throws {
        let s = SujetoDeSesion(familia: .fuerza, tss: nil, plan: nil, peldano: nil, ancla: nil, avisoSinSaber: nil, resumen: nil)
        XCTAssertNil(s.tss)
        XCTAssertEqual(CargaDeTramoVista(nil), .noSeSabe)
        XCTAssertEqual(CargaDeTramoVista(CargaDeTramo(tss: nil, segundos: 60, sinSaberS: 60, peldano: nil, ancla: nil)), .noSeSabe)
        XCTAssertEqual(CargaDeTramoVista(CargaDeTramo(tss: 8.4, segundos: 60, sinSaberS: 0, peldano: .ritmo, ancla: .medida)).peldano, "ritmo")
    }

    func testElResumenEsLoQueSePidioODeDondeSaleLaSesion() throws {
        XCTAssertEqual(try lectura(.cinta).sujeto.resumen, "1 de 5 tramos dentro de lo pedido")
        XCTAssertEqual(try lectura(.remo).sujeto.resumen, "4 de 5 tramos dentro de lo pedido")
        XCTAssertEqual(try lectura(.sentadilla).sujeto.resumen, "1 de 1 tramo dentro de lo pedido")
        XCTAssertEqual(try lectura(.carreraDeSalud).sujeto.resumen, "Sin plan: lo que fue")
        XCTAssertNil(try lectura(.cinta, conCumplimiento: false).sujeto.resumen, "sin el cumplimiento no se afirma nada de lo pedido")
        XCTAssertEqual(try lectura(.carreraDeSalud).preguntaDeTramos, "Sin plan: lo que fue")
        XCTAssertEqual(try lectura(.cinta, conCumplimiento: false).preguntaDeTramos, "Lo pedido frente a lo hecho")
    }

    // MARK: - Los tramos

    func testLosTramosDeUnaCarreraDeSeriesSeNombranPorSuFase() throws {
        let l = try lectura(.cinta)
        XCTAssertEqual(l.tramos.map(\.nombre), ["Calentamiento", "Serie 1", "Recuperación", "Serie 2", "Recuperación", "Serie 3", "Recuperación", "Serie 4"])
        XCTAssertEqual(l.tramos.map(\.esRecuperacion), [false, false, true, false, true, false, true, false])
    }

    func testUnTramoConEjercicioSeNombraPorElEjercicio() throws {
        XCTAssertEqual(try lectura(.sentadilla).tramos.map(\.nombre), ["Sentadilla"])
        XCTAssertEqual(try lectura(.trineos).tramos.map(\.nombre), ["Peso muerto", "Sled push"])
        let t = TramoDeSesion(id: "1", posicion: 1, ronda: 3, familia: .estaciones, ejercicioEs: "Ski", papel: nil, fase: nil, segundos: 45, prescrito: nil, hecho: nil, carga: nil)
        XCTAssertEqual(LecturaDeSesion.nombreDeTramo(t, ordinal: nil), "Ski · ronda 3", "un minuto de EMOM lleva su ronda")
        let libre = TramoDeSesion(id: "2", posicion: 1, ronda: 0, familia: .correr, ejercicioEs: nil, papel: nil, fase: nil, segundos: nil, prescrito: nil, hecho: nil, carga: nil)
        XCTAssertEqual(LecturaDeSesion.nombreDeTramo(libre, ordinal: nil), "Correr", "sin nada más, la familia")
    }

    func testCadaTramoDiceLoPedidoConLaFraseDelServidor() throws {
        let l = try lectura(.cinta)
        XCTAssertEqual(l.tramos[0].pedido, "10' @ Z2")
        XCTAssertEqual(l.tramos[1].pedido, "4×1000m @ Z5 · r90''")
        XCTAssertNil(l.tramos[2].pedido, "la frase de una recuperación es la de toda la serie: bajo «Recuperación» diría que se pidió correr a Z5")
        XCTAssertEqual(try lectura(.sentadilla).tramos[0].pedido, "4×5 @ RIR 2")
        XCTAssertNil(try lectura(.carreraDeSalud).tramos[0].pedido, "una importación no trae prescripción: no se inventa")
    }

    func testCadaTramoDiceLoHechoConLasCifrasDeSuModalidad() throws {
        let cinta = try lectura(.cinta).tramos
        XCTAssertEqual(cinta[0].hecho, "1,8 km · 5:41/km · 131 ppm")
        XCTAssertEqual(cinta[1].hecho, "1 km · 3:55/km · 163 ppm")
        XCTAssertEqual(cinta[2].hecho, "210 m · 7:18/km · 148 ppm")
        XCTAssertEqual(try lectura(.sentadilla).tramos[0].hecho, "4 × 5 a 100 kg · RIR 3 · 2 · 2 · 1", "las series iguales seguidas se juntan; el RIR, serie a serie")
        XCTAssertEqual(try lectura(.carreraDeSalud).tramos[0].hecho, "8 km · 5:30/km · 149 ppm")
        let remo = try lectura(.remo).tramos
        XCTAssertEqual(remo[0].hecho, "500 m · 1:50/500m · 263 W · 156 ppm")
    }

    /// Un tramo como lo sirve el servidor, para probar la frase sin montar los treinta campos a mano.
    private func hecho(_ json: String) throws -> SegmentActualDTO {
        try APIClient.makeJSONDecoder().decode(SegmentActualDTO.self, from: Data(json.utf8))
    }

    func testLasSeriesDeFuerzaDistintasSeEscribenUnaAUna() throws {
        let seguidas = try hecho(#"{"position":1,"modality":"strength","sets":[{"set_index":1,"status":"done","reps":5,"kg":100},{"set_index":2,"status":"done","reps":5,"kg":100},{"set_index":3,"status":"done","reps":5,"kg":105},{"set_index":4,"status":"done","reps":3,"kg":105}]}"#)
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(seguidas, segundosDelTramo: nil), "2 × 5 a 100 kg · 5 a 105 kg · 3 a 105 kg")
        let sinKilos = try hecho(#"{"position":1,"modality":"strength","sets":[{"set_index":1,"status":"done","reps":8},{"set_index":2,"status":"done","reps":8}]}"#)
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(sinKilos, segundosDelTramo: nil), "2 × 8 reps", "sin kilos apuntados se dice solo lo hecho")
        let saltada = try hecho(#"{"position":1,"modality":"strength","sets":[{"set_index":1,"status":"skipped","reps":5,"kg":100}]}"#)
        XCTAssertNil(LecturaDeSesion.hechoEnPalabras(saltada, segundosDelTramo: nil), "una serie saltada no es lo hecho")
    }

    func testUnTramoSinCifrasNoInventaUnaFrase() throws {
        let vacio = try hecho(#"{"position":1,"modality":"other"}"#)
        XCTAssertNil(LecturaDeSesion.hechoEnPalabras(vacio, segundosDelTramo: nil))
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(vacio, segundosDelTramo: 720), "12:00", "una estación sin medidas dice al menos cuánto duró")
        let ergoPorTiempo = try hecho(#"{"position":2,"modality":"row","duration_seconds":1200,"avg_hr":150}"#)
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(ergoPorTiempo, segundosDelTramo: nil), "20:00 · 150 ppm", "un ergo por tiempo sin distancia dice su tiempo")
    }

    func testUnEmomDiceLosMinutosQueCumplioSinRepetirElTiempo() throws {
        let emom = try hecho(#"{"position":3,"modality":"ski","duration_seconds":652,"avg_hr":162,"calories":96,"emom_rounds_completed":10,"emom_rounds_prescribed":12}"#)
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(emom, segundosDelTramo: nil), "10 de 12 minutos · 96 kcal · 162 ppm")
    }

    /// La clave `avg_pace_s_per_500m` se convierte a `avgPaceSPer500M` (M mayúscula): el ritmo del ergo se caía en silencio. Es el
    /// mismo tipo que decodifica el detalle del Plan, con la clave fijada a mano; este test es el que lo guarda aquí.
    func testElRitmoPor500mDelServidorLlegaAlHecho() throws {
        let remo = try hecho(#"{"position":4,"modality":"row","distance_meters":500,"avg_pace_s_per_500m":110,"avg_power_w":263,"avg_hr":156}"#)
        XCTAssertEqual(remo.avgPaceSPer500m, 110)
        XCTAssertEqual(LecturaDeSesion.hechoEnPalabras(remo, segundosDelTramo: nil), "500 m · 1:50/500m · 263 W · 156 ppm")
    }

    // MARK: - Los sellos

    func testConElCumplimientoCadaTramoLlevaSuSelloYSinElNoSeInventa() throws {
        let con = try lectura(.cinta).tramos.map(\.marca)
        XCTAssertEqual(con, [.menosDeLoPedido, .masDeLoPedido, .dentro, .masDeLoPedido, .dentro, .dentro, .dentro, .masDeLoPedido])
        let sin = try lectura(.cinta, conCumplimiento: false).tramos.map(\.marca)
        XCTAssertTrue(sin.allSatisfy { $0 == .sinComprobar }, "hay plan y no ha llegado el veredicto: «sin comprobar», nunca «dentro»")
        XCTAssertTrue(try lectura(.carreraDeSalud).tramos.allSatisfy { $0.marca == .sinPlan }, "sin plan no hay veredicto")
    }

    // MARK: - Curvas, parciales y zonas

    func testLasCurvasTrenenSuDuracionYLosParcialesDestacanElMasRapidoYElMasLento() throws {
        let l = try lectura(.carreraDeSalud)
        XCTAssertEqual(l.ritmo.count, 61)
        XCTAssertEqual(l.pulso.count, 61)
        XCTAssertEqual(l.duracionDeLasCurvas, 2640)
        XCTAssertEqual(l.parciales.count, 8)
        XCTAssertEqual(l.parciales.first?.etiqueta, "1 km")
        let destacados = l.parciales.filter(\.destacado)
        XCTAssertEqual(destacados.count, 2)
        XCTAssertEqual(Set(destacados.map(\.segundos)), [l.parciales.map(\.segundos).min()!, l.parciales.map(\.segundos).max()!])
    }

    func testUnParcialFinalNoEsElMasRapidoNiElMasLentoDeLosCompletos() {
        let km = [
            ParcialDeKm(index: 1, partial: false, distanceM: 1000, durationS: 330, avgPaceSPerKm: 330, avgHr: 150),
            ParcialDeKm(index: 2, partial: false, distanceM: 1000, durationS: 320, avgPaceSPerKm: 320, avgHr: 152),
            ParcialDeKm(index: 3, partial: true, distanceM: 400, durationS: 90, avgPaceSPerKm: 225, avgHr: 160),
        ]
        let p = LecturaDeSesion.parciales(km)
        XCTAssertEqual(p.map(\.etiqueta), ["1 km", "2 km", "400 m"])
        XCTAssertEqual(p.map(\.destacado), [true, true, false], "el parcial de 400 m es un trozo: no se compara con kilómetros")
        XCTAssertTrue(LecturaDeSesion.parciales([ParcialDeKm(index: 1, partial: false, distanceM: 1000, durationS: nil, avgPaceSPerKm: nil, avgHr: nil)]).isEmpty, "un km sin tiempo no se dibuja")
    }

    func testLasZonasSalenConSuPorcentajeYSinLasQueNoPiso() throws {
        let z = try lectura(.carreraDeSalud).zonas
        XCTAssertEqual(z.map(\.zona), [1, 2, 3, 4], "la zona 5 tiene 0 s: no se pinta")
        XCTAssertEqual(z.map(\.etiqueta), ["Z1", "Z2", "Z3", "Z4"])
        XCTAssertEqual(z.map(\.pct).reduce(0, +), 100, accuracy: 1e-6)
        XCTAssertTrue(try lectura(.cinta).zonas.isEmpty, "sin ancla no hay zonas que repartir: el servidor lo declara y se calla")
    }

    // MARK: - Lo que dijo

    func testElRpeYLaDuracionSonLosDelServidor() throws {
        let l = try lectura(.cinta)
        XCTAssertEqual(l.rpe, 8)
        XCTAssertEqual(l.duracionS, 1860)
        XCTAssertNil(try lectura(.trineos).rpe, "sin RPE al cerrar: se dice, no se pinta un valor por defecto")
    }

    func testElNotaDelRestoSoloSaleSiPesoAlgo() throws {
        XCTAssertNotNil(try lectura(.remo).notaDelResto, "los 15 min entre piezas suman carga y sin ellos las filas no suman el sujeto")
        XCTAssertNil(try lectura(.trineos).notaDelResto, "el resto sin carga que sumar no se dice como cero")
        XCTAssertNil(try lectura(.carreraDeSalud).notaDelResto)
    }

    func testUnEnvoltorioDeSesionConLaTrazaVaciaDecodifica() throws {
        let s = try DetalleFixtures.sesion(.sentadilla)
        XCTAssertFalse(s.traza.disponible)
        XCTAssertTrue(s.traza.parcialesKm.isEmpty)
        XCTAssertNil(s.traza.ritmo)
        XCTAssertEqual(s.executionId, "9003")
        XCTAssertEqual(s.assignmentId, "7003")
        XCTAssertNil(s.fueraDelPlan)
        XCTAssertEqual(try DetalleFixtures.sesion(.carreraDeSalud).fueraDelPlan, "no_assignment")
    }

    func testLosPeldanosSeNombranEnElOrdenDeEvidencia() {
        XCTAssertEqual(PeldanoDeCarga.allCases.filter { $0 != .desconocido }.compactMap(\.nombre), ["potencia", "ritmo", "pulso", "esfuerzo"])
        XCTAssertNil(PeldanoDeCarga.desconocido.nombre)
    }
}
