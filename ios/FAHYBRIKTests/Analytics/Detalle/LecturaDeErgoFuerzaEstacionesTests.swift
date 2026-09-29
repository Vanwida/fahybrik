import XCTest
@testable import FAHYBRIK

// ERGO, FUERZA Y ESTACIONES, LEÍDOS: lo que deciden `LecturaDeErgo`, `LecturaDeFuerza` y `LecturaDeEstaciones` sobre el detalle real del
// motor. Traducción de `detalleErgoDe`, `detalleFuerzaDe` y `detalleEstacionesDe` del doble: las ocho piezas con las que faltan como
// invitación, el umbral con su ancla, el reparto por patrón con su cambio, las estaciones a la misma dosis y carga, y los WOD de referencia.
final class LecturaDeErgoTests: XCTestCase {

    private func lectura(_ m: FamiliaDeDetalle, _ a: DetalleFixtures.Atleta) throws -> LecturaDeErgo {
        LecturaDeErgo.desde(try DetalleFixtures.detalle(m, a), m)
    }

    func testLasOchoPiezasSalenEnElOrdenDelMonitorConLasQueFaltanSinMarca() throws {
        let l = try lectura(.remo, .lleno)
        XCTAssertEqual(l.piezas.map(\.clave), ["100", "500", "1000", "2000", "5000", "60s", "240s", "1800s"])
        XCTAssertEqual(l.piezas.map(\.nombre), ["100 m", "500 m", "1000 m", "2000 m", "5000 m", "1′", "4′", "30′"])
        XCTAssertEqual(l.piezas.filter { $0.marca == nil }.map(\.clave), ["100", "60s", "1800s"], "sin hacer: una invitación, no un hueco mudo")
        XCTAssertEqual(l.piezasHechas, 5)
        XCTAssertEqual(l.piezas.map(\.medida), [.distancia, .distancia, .distancia, .distancia, .distancia, .tiempo, .tiempo, .tiempo])
    }

    func testUnaPiezaDeDistanciaSeMideEnSegundosYUnaDeTiempoEnMetros() throws {
        let l = try lectura(.remo, .lleno)
        let dos = try XCTUnwrap(l.piezas.first { $0.clave == "2000" })
        XCTAssertEqual(dos.unidad, .segundos)
        XCTAssertEqual(dos.marca?.valor, 449)
        XCTAssertEqual(try XCTUnwrap(dos.ritmo(por: 500)), 112.25, accuracy: 1e-9, "449 s por 2000 m: 1:52 por 500 m")
        let cuatro = try XCTUnwrap(l.piezas.first { $0.clave == "240s" })
        XCTAssertEqual(cuatro.unidad, .metros)
        XCTAssertEqual(try XCTUnwrap(cuatro.ritmo(por: 500)), 240 / 1062.8 * 500, accuracy: 1e-9)
        XCTAssertNil(try XCTUnwrap(l.piezas.first { $0.clave == "100" }).ritmo(por: 500), "sin marca no hay ritmo")
    }

    func testUnaMarcaNuevaSeMarcaYUnaViejaDiceSuDia() throws {
        let l = try lectura(.remo, .lleno)
        let quinientos = try XCTUnwrap(l.piezas.first { $0.clave == "500" }?.marca)
        XCTAssertEqual(quinientos.anterior, 108)
        XCTAssertTrue(quinientos.nuevo)
        XCTAssertFalse(quinientos.viejo)
        let cinco = try XCTUnwrap(l.piezas.first { $0.clave == "5000" }?.marca)
        XCTAssertTrue(cinco.viejo, "el 5000 m es de enero: fuera de la ventana")
        XCTAssertEqual(cinco.cuando, .dia("2026-01-29"))
        XCTAssertNil(cinco.anterior)
        XCTAssertFalse(cinco.nuevo)
    }

    func testElUmbralDeCadaMaquinaSaleDeSuAncla() throws {
        let remo = try XCTUnwrap(try lectura(.remo, .lleno).umbral)
        XCTAssertEqual(remo.ancla, .medida)
        XCTAssertEqual(try lectura(.ski, .lleno).umbral?.ancla, .medida)
        XCTAssertEqual(try lectura(.bici, .lleno).umbral?.ancla, .declarada)
        XCTAssertEqual(try lectura(.bici, .lleno).umbral?.vatios, 190)
        XCTAssertEqual(try lectura(.remo, .mixto).umbral?.ancla, .declarada, "Pau lo escribió él: el chip lo dice")
        XCTAssertNil(try lectura(.remo, .poco).umbral, "sin umbral de potencia de la máquina, sin celda")
        XCTAssertEqual(LecturaDeErgo.claveDeAncla(.remo), "row")
        XCTAssertEqual(LecturaDeErgo.claveDeAncla(.bici), "bike")
        XCTAssertNil(LecturaDeErgo.claveDeAncla(.correr))
    }

    func testLaBiciSeLeePor1000mYConRpm() throws {
        let bici = try lectura(.bici, .lleno)
        XCTAssertEqual(bici.ritmoPor, 1000)
        XCTAssertEqual(bici.unidadDelRitmo, .s1000m)
        XCTAssertEqual(bici.unidadDeCadencia, .rpm)
        let remo = try lectura(.remo, .lleno)
        XCTAssertEqual(remo.ritmoPor, 500)
        XCTAssertEqual(remo.unidadDelRitmo, .s500m)
        XCTAssertEqual(remo.unidadDeCadencia, .spm)
    }

    func testElSujetoDelErgoEsLaMismaFilaQueLaPortada() throws {
        let l = try lectura(.remo, .lleno)
        XCTAssertTrue(l.filaEsMotor)
        XCTAssertEqual(l.sujeto.estado, .lleno)
        guard case .marca(let m) = l.sujeto.cuerpo else { return XCTFail() }
        XCTAssertEqual(m.etiqueta, "Motor")
        XCTAssertEqual(m.unidad, .watts)
        XCTAssertEqual(l.sujeto.familia, .remo, "el punto es el de la máquina")
    }

    func testUnaMaquinaQueNuncaSeHaUsadoEsUnVacio() throws {
        XCTAssertEqual(try lectura(.ski, .mixto).estado, .vacio)
        XCTAssertEqual(try lectura(.bici, .vacio).estado, .vacio)
        XCTAssertEqual(try lectura(.remo, .viejo).estado, .viejo, "Lucía: las piezas de junio se quedan, con su fecha")
    }

    func testElVolumenYLaCadenciaSonLecturasDeLaMaquina() throws {
        let l = try lectura(.remo, .lleno)
        XCTAssertEqual(l.volumen?.dato?.unidad, .metros)
        XCTAssertEqual(l.cadencia?.dato?.unidad, .spm)
        XCTAssertEqual(l.volumen?.serie?.paso, .semana)
        XCTAssertNil(l.volumen?.serie?.plan, "no hay carga planificada del ergo por metros: el contorno del plan no se dibuja")
    }
}

final class LecturaDeFuerzaTests: XCTestCase {

    private func lectura(_ a: DetalleFixtures.Atleta) throws -> LecturaDeFuerza {
        LecturaDeFuerza.desde(try DetalleFixtures.detalle(.fuerza, a))
    }

    func testLosEjerciciosSalenPorSuNombreYCadaUnoConSuTablaPorReps() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(Set(l.ejercicios.map(\.nombre)), ["Sentadilla", "Peso muerto", "Press banca", "Press militar", "Remo con barra"])
        XCTAssertTrue(l.ejercicios.allSatisfy { $0.metrica == "1RM estimado" && !$0.pesoCorporal })
        let sentadilla = try XCTUnwrap(l.ejercicios.first { $0.id == "sq" })
        XCTAssertEqual(sentadilla.porReps.map(\.reps), [1, 2, 3, 5], "de menos a más reps, solo las que ha levantado")
        XCTAssertEqual(sentadilla.porReps.map(\.etiqueta), ["1 rep", "2 reps", "3 reps", "5 reps"])
        XCTAssertTrue(sentadilla.porReps.allSatisfy { $0.kg == 104.5 }, "una serie de 5 cuenta también para 3, 2 y 1")
        XCTAssertTrue(l.ejercicios.allSatisfy { !$0.porReps.isEmpty })
    }

    func testElNombreSaleSinLoQueMide() throws {
        let d = try DetalleFixtures.detalle(.fuerza, .lleno)
        XCTAssertEqual(LecturaDeFuerza.nombreDeEjercicio(try XCTUnwrap(d.lectura("fuerza.e1rm.sq"))), "Sentadilla")
        let corporal = try AnaliticasFixtures.lectura(id: "fuerza.reps.x", grupo: "progreso", familia: "\"fuerza\"", unidad: "reps")
        XCTAssertEqual(LecturaDeFuerza.nombreDeEjercicio(corporal), "X", "sin sufijo conocido, el título tal cual")
    }

    func testElRepartoPorPatronSumaSeriesYTonelajeYDiceElCambio() throws {
        let l = try lectura(.lleno)
        // Más series primero; a igualdad, por nombre: Bisagra · Empuje horizontal · Empuje vertical · Sentadilla · Tirón horizontal · Acarreo.
        XCTAssertEqual(l.patrones.map(\.codigo), ["hinge", "horizontal_push", "vertical_push", "squat", "horizontal_pull", "carry"])
        let sentadilla = try XCTUnwrap(l.patrones.first { $0.codigo == "squat" })
        XCTAssertEqual(sentadilla.nombre, "Sentadilla")
        XCTAssertEqual(sentadilla.series, 48)
        XCTAssertEqual(sentadilla.tonelajeKg, 24263)
        XCTAssertEqual(sentadilla.seriesAnterior, 48)
        XCTAssertNil(sentadilla.cambioDeSeries, "las mismas series que antes: no hay cambio que decir")
        let acarreo = try XCTUnwrap(l.patrones.first { $0.codigo == "carry" })
        XCTAssertEqual(acarreo.series, 12)
        XCTAssertNil(acarreo.tonelajeKg, "los acarreos no suman kilos: se cuentan por series")
        XCTAssertEqual(l.patrones.last?.codigo, "carry", "el de menos series, al final")
    }

    func testElCambioDeSeriesLlevaSuSigno() {
        let sube = PatronDeFuerza(codigo: "squat", nombre: "Sentadilla", series: 14, tonelajeKg: 4200, seriesAnterior: 12)
        let baja = PatronDeFuerza(codigo: "hinge", nombre: "Bisagra", series: 10, tonelajeKg: 3600, seriesAnterior: 14)
        XCTAssertEqual(sube.cambioDeSeries, 2)
        XCTAssertEqual(baja.cambioDeSeries, -4)
        XCTAssertEqual(AnaliticasCuerpoDeFuerza.seriesConCambio(sube), "14 (+2)")
        XCTAssertEqual(AnaliticasCuerpoDeFuerza.seriesConCambio(baja), "10 (\u{2212}4)")
        XCTAssertNil(PatronDeFuerza(codigo: "x", nombre: "X", series: 4, tonelajeKg: nil, seriesAnterior: nil).cambioDeSeries, "sin periodo anterior no hay cambio")
    }

    func testElTonelajeYLasSeriesSonDeLaVentanaSinPlan() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(l.tonelaje?.dato?.unidad, .kg)
        XCTAssertEqual(l.series?.dato?.valor, 252)
        XCTAssertNil(l.tonelaje?.serie?.plan)
    }

    func testEnArranqueEnFrioElNumeroSeQuedaYLaComparacionSeDice() throws {
        let l = try lectura(.poco)
        XCTAssertEqual(l.estado, .poco)
        XCTAssertEqual(Set(l.ejercicios.map(\.nombre)), ["Sentadilla", "Press banca"])
        for e in l.ejercicios {
            XCTAssertNil(AnaliticasDerivados.delta(de: e.lectura), "sin periodo anterior no hay delta")
            XCTAssertEqual(AnaliticasCuerpoDeFuerza.notaDeComparacion(e.lectura), "sin periodo anterior con el que comparar")
        }
        let lleno = try lectura(.lleno)
        XCTAssertTrue(lleno.ejercicios.allSatisfy { AnaliticasCuerpoDeFuerza.notaDeComparacion($0.lectura) == nil })
    }

    func testUnVacioNoTieneEjerciciosNiPatrones() throws {
        let l = try lectura(.vacio)
        XCTAssertEqual(l.estado, .vacio)
        XCTAssertTrue(l.ejercicios.isEmpty)
        XCTAssertTrue(l.patrones.isEmpty)
    }
}

final class LecturaDeEstacionesTests: XCTestCase {

    private func lectura(_ a: DetalleFixtures.Atleta) throws -> LecturaDeEstaciones {
        LecturaDeEstaciones.desde(try DetalleFixtures.detalle(.estaciones, a))
    }

    func testElTituloDeUnaPruebaSeParteEnNombreDosisYCarga() {
        let a = LecturaDeEstaciones.partesDelTitulo("Sled push · 50 m · 152 kg")
        XCTAssertEqual(a.nombre, "Sled push")
        XCTAssertEqual(a.dosis, "50 m")
        XCTAssertEqual(a.carga, "152 kg")
        let sinCarga = LecturaDeEstaciones.partesDelTitulo("Burpee broad jump · 80 m")
        XCTAssertEqual(sinCarga.nombre, "Burpee broad jump")
        XCTAssertEqual(sinCarga.dosis, "80 m")
        XCTAssertNil(sinCarga.carga, "sin kilos apuntados es «sin carga»: nunca se inventa la del plan")
        let reps = LecturaDeEstaciones.partesDelTitulo("Wall balls · 100 reps · 6 kg")
        XCTAssertEqual(reps.dosis, "100 reps")
        XCTAssertEqual(LecturaDeEstaciones.partesDelTitulo("Solo nombre").dosis, nil)
    }

    func testCadaEstacionSaleConSuDosisSuCargaYLoQueMejoro() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(l.estaciones.count, 6)
        let sled = try XCTUnwrap(l.estaciones.first { $0.nombre == "Sled push" })
        XCTAssertEqual(sled.dosis, "50 m")
        XCTAssertEqual(sled.carga, "152 kg")
        XCTAssertEqual(sled.detalle, "50 m · 152 kg")
        XCTAssertEqual(sled.mejor, 184)
        XCTAssertEqual(sled.anterior, 185)
        XCTAssertTrue(sled.nuevo)
        XCTAssertEqual(sled.cuando, .dia("2026-07-25"))
        XCTAssertNotNil(sled.delta)
        let burpee = try XCTUnwrap(l.estaciones.first { $0.nombre == "Burpee broad jump" })
        XCTAssertNil(burpee.carga)
        XCTAssertEqual(burpee.detalle, "80 m")
    }

    func testLasSimulacionesYLosWodTienenSuHistorialEntero() throws {
        let l = try lectura(.lleno)
        XCTAssertEqual(l.wods.map(\.id), ["wod.sim", "wod.amrap"])
        let sim = try XCTUnwrap(l.wods.first { $0.esSimulacion })
        XCTAssertEqual(sim.unidad, .segundos)
        XCTAssertTrue(sim.menosEsMejor)
        XCTAssertEqual(sim.ultimo?.dia, "2026-09-12")
        XCTAssertEqual(sim.ultimo?.valor, 4459)
        XCTAssertTrue(sim.hayTendencia)
        let amrap = try XCTUnwrap(l.wods.first { !$0.esSimulacion })
        XCTAssertEqual(amrap.unidad, .rondas)
        XCTAssertFalse(amrap.menosEsMejor, "en rondas, más es mejor")
    }

    func testTresEstacionesYNingunWodEsUnPocoDeDato() throws {
        let l = try lectura(.mixto)
        XCTAssertEqual(l.estaciones.count, 3)
        XCTAssertTrue(l.wods.isEmpty, "el hueco de los WOD lo dice el detalle, con su invitación")
    }

    func testUnDatoViejoSeQuedaConSuFechaYSinComparacion() throws {
        let l = try lectura(.viejo)
        XCTAssertEqual(l.estado, .viejo)
        XCTAssertTrue(l.estaciones.allSatisfy { $0.viejo && !$0.nuevo && $0.anterior == nil && $0.delta == nil })
        XCTAssertEqual(l.estaciones.first?.cuando, .dia("2026-06-06"))
    }

    func testUnaSimulacionTieneTendenciaConDosMarcasYNoConUna() {
        let una = WodDeReferencia(id: "wod.x", nombre: "X", unidad: .segundos, serie: [PuntoDeSerie(t: "2026-09-01", v: 4500)], ultimo: UltimaPuntuacion(valor: 4500, dia: "2026-09-01"), esSimulacion: false, delta: nil)
        XCTAssertFalse(una.hayTendencia)
        let dos = WodDeReferencia(id: "wod.x", nombre: "X", unidad: .segundos, serie: [PuntoDeSerie(t: "2026-09-01", v: 4500), PuntoDeSerie(t: "2026-09-15", v: 4400)], ultimo: UltimaPuntuacion(valor: 4400, dia: "2026-09-15"), esSimulacion: false, delta: nil)
        XCTAssertTrue(dos.hayTendencia)
    }

    func testSinNadaEsUnVacio() throws {
        let l = try lectura(.vacio)
        XCTAssertEqual(l.estado, .vacio)
        XCTAssertTrue(l.estaciones.isEmpty)
        XCTAssertTrue(l.wods.isEmpty)
    }
}
