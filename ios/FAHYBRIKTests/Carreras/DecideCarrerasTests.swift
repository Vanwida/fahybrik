import XCTest
@testable import FAHYBRIK

// EL SUJETO DE «CARRERAS», CLAVADO SOBRE LOS VEINTE CASOS — la traducción, caso a caso, de
// `web/tests/design-twin/carreras-decide.test.ts`.
//
// La pestaña cambia de sujeto a lo largo de la temporada (el objetivo, la carrera de ayer, la última,
// la invitación). Que el sujeto sea el correcto no se ve mirando una captura: se ve igual de bien un
// póster de objetivo que tapa una carrera de ayer sin resultado que al revés. Así que la precedencia se
// fija aquí, caso a caso, junto con las cuentas que la pantalla pinta y no calcula. Los mismos casos,
// los mismos resultados que en el doble: la app y el diseño no pueden divergir.
final class DecideCarrerasTests: XCTestCase {

    private typealias C = CasosCarreras

    private func lectura(_ id: String) -> LecturaCarreras { C.caso(id).lectura }

    /// El sujeto que toca en cada uno de los veinte escenarios del doble.
    private static let esperado: [String: SujetoCarreras.Tipo] = [
        "lleno": .objetivo, "solo-objetivo": .objetivo, "solo-historial": .ultima, "vacio": .vacio,
        "dobles": .objetivo, "parcial": .objetivo, "dia-de-carrera": .objetivo, "ayer": .postcarrera,
        "varios": .objetivo, "sin-coach": .objetivo, "cargando": .cargando, "error": .error,
        "importando": .vacio, "no-soy-yo": .ultima, "sin-pareja": .objetivo, "informe": .objetivo,
        "llegando": .objetivo, "fallos": .objetivo, "sin-principal": .objetivo, "no-hyrox": .objetivo,
    ]

    // MARK: Los veinte casos

    func testSonVeinteConIdsUnicosYTodosConSuExpectativa() {
        XCTAssertEqual(C.todos.count, 20)
        XCTAssertEqual(Set(C.todos.map(\.id)).count, 20)
        XCTAssertEqual(Set(Self.esperado.keys), Set(C.todos.map(\.id)))
    }

    func testCadaCasoTieneUnaLecturaCoherenteYSuSujeto() {
        for c in C.todos {
            // Un caso cargando o en error lleva valores de relleno que la pantalla no lee.
            if c.lectura.cargaHub == .lista {
                XCTAssertEqual(C.problemasDeLectura(c.lectura), [], "\(c.id): lectura incoherente")
            }
            XCTAssertEqual(DecideCarreras.sujeto(c.lectura).tipo, Self.esperado[c.id], "\(c.id): sujeto")
        }
    }

    func testCadaEstadoDeSujetoLoEjercitaAlMenosUnCaso() {
        let vistos = Set(C.todos.map { DecideCarreras.sujeto($0.lectura).tipo })
        XCTAssertEqual(vistos, Set(SujetoCarreras.Tipo.allCases))
    }

    // MARK: La precedencia del sujeto

    func testUnaCarreraDeAyerSinResultadoVaPorDelanteDelObjetivo() {
        let l = lectura("ayer")
        XCTAssertNotNil(DecideCarreras.principalDe(l.proximas))
        let s = DecideCarreras.sujeto(l)
        guard case .postcarrera(let carrera, let dias) = s else { return XCTFail("debía ser postcarrera, es \(s)") }
        XCTAssertEqual(dias, 1)
        XCTAssertEqual(carrera.nombre, "HYROX Madrid")
        // …y el objetivo no se pierde: pasa a la primera fila de «Próximas».
        XCTAssertEqual(DecideCarreras.proximasRestantes(l, sujeto: s).map(\.raceId), [261])
    }

    func testPasadoElPlazoElObjetivoVuelveAMandar() {
        let l = lectura("ayer")
        func conFechaDeLaPendiente(_ fecha: String) -> LecturaCarreras {
            var copia = l
            copia.pasadas = l.pasadas.map { $0.resultadoS == nil ? CasosCarreras.pasada($0.raceId, $0.nombre, fecha, nil) : $0 }
            return copia
        }
        let vieja = conFechaDeLaPendiente(C.sumaDias(C.hoy, -(DecideCarreras.diasPostcarrera + 1)))
        XCTAssertNil(DecideCarreras.pendienteReciente(pasadas: vieja.pasadas, hoy: vieja.hoy))
        XCTAssertEqual(DecideCarreras.sujeto(vieja).tipo, .objetivo)
        // En el límite (justo el último día del plazo) todavía manda la carrera.
        let limite = conFechaDeLaPendiente(C.sumaDias(C.hoy, -DecideCarreras.diasPostcarrera))
        XCTAssertEqual(DecideCarreras.sujeto(limite).tipo, .postcarrera)
    }

    func testUnaPendienteSinFechaNuncaEsReciente() {
        var l = lectura("vacio")
        l.pasadas = [C.pasada(9, "HYROX X", nil, nil)]
        XCTAssertNil(DecideCarreras.pendienteReciente(pasadas: l.pasadas, hoy: l.hoy))
        // Solo pendientes y nada por delante: no hay «última» (ninguna tiene resultado): invitación.
        XCTAssertEqual(DecideCarreras.sujeto(l).tipo, .vacio)
    }

    func testCargandoYErrorTapanTodoLoDemas() {
        var lleno = lectura("lleno")
        lleno.cargaHub = .fria
        XCTAssertEqual(DecideCarreras.sujeto(lleno).tipo, .cargando)
        lleno.cargaHub = .error
        XCTAssertEqual(DecideCarreras.sujeto(lleno).tipo, .error)
    }

    func testSinPrincipalElSujetoEsLaMasProximaYNoEsPrincipal() {
        guard case .objetivo(let carrera, let principal) = DecideCarreras.sujeto(lectura("sin-principal")) else { return XCTFail() }
        XCTAssertFalse(principal)
        XCTAssertEqual(carrera.nombre, "HYROX Madrid")
    }

    func testUnaFilaSinPrioridadCuentaComoPrincipal() {
        // La ruta de creación pone `target` por defecto: una fila antigua sin prioridad es la principal.
        XCTAssertEqual(PrioridadCarrera(wire: nil), .principal)
        XCTAssertEqual(PrioridadCarrera(wire: "target"), .principal)
        XCTAssertEqual(PrioridadCarrera(wire: "TARGET"), .principal)
        XCTAssertEqual(PrioridadCarrera(wire: "tune_up"), .puestaAPunto)
        XCTAssertEqual(PrioridadCarrera(wire: "secondary"), .secundaria)
        // Un token que la app no conoce NO promueve una carrera a principal.
        XCTAssertEqual(PrioridadCarrera(wire: "algo_nuevo"), .secundaria)
        XCTAssertEqual(DecideCarreras.principalDe([C.proxima(1, "HYROX X", 10)])?.raceId, 1)
    }

    func testConSoloHistorialElSujetoEsLaUltimaConResultadoSeaDeEquipoOno() {
        var l = lectura("solo-historial")
        l.pasadas = [C.pasada(1, "Pendiente", C.en(-40), nil), lectura("dobles").pasadas[0]]
        guard case .ultima(let carrera) = DecideCarreras.sujeto(l) else { return XCTFail() }
        XCTAssertEqual(carrera.formato, .dobles)
    }

    // MARK: Ordenar las próximas

    func testPorDiaElPrincipalPrimeroEnEmpateYSinFechaAlFinal() {
        let orden = DecideCarreras.ordenarProximas(lectura("varios").proximas).map(\.raceId)
        // 273 (a 12) · 271 principal y 272 (a 39) · 274 (96) · 277 (124) · 276 (141) · 275 sin fecha.
        XCTAssertEqual(orden, [273, 271, 272, 274, 277, 276, 275])
    }

    func testEsUnOrdenTotalBarajadasSalenIgual() {
        let lista = lectura("varios").proximas
        let base = DecideCarreras.ordenarProximas(lista).map(\.raceId)
        XCTAssertEqual(DecideCarreras.ordenarProximas(Array(lista.reversed())).map(\.raceId), base)
        XCTAssertEqual(DecideCarreras.ordenarProximas(Array(lista[3...] + lista[..<3])).map(\.raceId), base)
    }

    func testElSujetoSaleDeLaListaDeProximas() {
        let l = lectura("varios")
        let s = DecideCarreras.sujeto(l)
        guard case .objetivo(let carrera, _) = s else { return XCTFail() }
        XCTAssertEqual(carrera.raceId, 271)
        XCTAssertEqual(DecideCarreras.proximasRestantes(l, sujeto: s).map(\.raceId), [273, 272, 274, 277, 276, 275])
    }

    // MARK: La acción del póster es la salida del hueco más importante

    private func accion(_ id: String) -> AccionObjetivoCarrera {
        let l = lectura(id)
        guard case .objetivo(let carrera, let principal) = DecideCarreras.sujeto(l) else {
            XCTFail("no es objetivo"); return .verCamino
        }
        return DecideCarreras.accionObjetivo(principal: principal, carrera: carrera, prediccion: l.prediccion)
    }

    func testVerElCaminoCuandoHayPredichoParcialOSinDatos() {
        XCTAssertEqual(accion("lleno"), .verCamino)
        XCTAssertEqual(accion("parcial"), .verCamino)
        XCTAssertEqual(accion("solo-objetivo"), .verCamino)
    }

    func testSinTiempoObjetivoFijarloHyroxOno() {
        XCTAssertEqual(accion("sin-coach"), .fijarMeta(cambia: false))
        let sinMeta = C.proxima(1, "Mitja", 141, tipoEvento: .otro, metaS: nil)
        XCTAssertEqual(
            DecideCarreras.accionObjetivo(principal: true, carrera: sinMeta, prediccion: .noAplica),
            .fijarMeta(cambia: false)
        )
        XCTAssertEqual(AccionObjetivoCarrera.fijarMeta(cambia: false).etiqueta, "Fijar tiempo objetivo")
    }

    func testUnaCarreraQueNoEsHyroxConMetaCambiarla() {
        XCTAssertEqual(accion("no-hyrox"), .fijarMeta(cambia: true))
        XCTAssertEqual(AccionObjetivoCarrera.fijarMeta(cambia: true).etiqueta, "Cambiar tiempo objetivo")
    }

    func testSinSerElPrincipalHacerloYSinParejaConectarla() {
        XCTAssertEqual(accion("sin-principal"), .hacerPrincipal)
        XCTAssertEqual(accion("sin-pareja"), .conectarPareja)
        XCTAssertEqual(AccionObjetivoCarrera.hacerPrincipal.etiqueta, "Hacer objetivo principal")
        XCTAssertEqual(AccionObjetivoCarrera.conectarPareja.etiqueta, "Conecta a tu pareja")
    }

    // MARK: Las cuentas que la pantalla pinta y no calcula

    func testElResumenDeLaUltima() {
        let l = lectura("lleno")
        let r = DecideCarreras.resumenDe(C.individual2026VLC, l.pasadas)
        XCTAssertEqual(r.totalS, 4012)
        XCTAssertEqual(r.correrS, 2170)
        XCTAssertEqual(r.estacionesS, 1562)
        XCTAssertEqual(r.roxzoneS, 280)
        XCTAssertEqual(r.puesto, "Puesto 412 de 1180 · top 35 %")
        // La anterior individual es Barcelona 2025 (4166), no los dobles de Girona.
        XCTAssertEqual(r.deltaAnteriorS, 4012 - 4166)
    }

    func testUnaSumaDeSieteEstacionesNoEsTusEstaciones() {
        var c = C.individual2026VLC
        c = C.pasada(
            c.raceId, c.nombre, c.fecha, c.resultadoS,
            correrS: c.correrS, roxzoneS: c.roxzoneS, vueltas: c.vueltas,
            estaciones: c.estaciones.enumerated().map { i, e in i == 3 ? ParcialEstacion(indice: e.indice, segundos: nil) : e },
            puesto: c.puesto, campo: c.campo
        )
        XCTAssertNil(DecideCarreras.estacionesTotalS(c))
    }

    func testUnaCarreraDeEquipoNoComparaSuTiempoConUnaIndividual() {
        let l = lectura("lleno")
        let gir = l.pasadas.first { $0.formato == .dobles }!
        XCTAssertNil(DecideCarreras.resumenDe(gir, l.pasadas).deltaAnteriorS)
    }

    func testLaEvolucionSonLasUltimasIndividualesDeLaMasAntiguaALaMasRecienteYLosDoblesNoEntran() {
        let e = DecideCarreras.evolucion(lectura("lleno").pasadas)!
        XCTAssertEqual(e.map(\.totalS), [4390, 4268, 4166, 4012])
        XCTAssertEqual(e.map(\.ultimo), [false, false, false, true])
        XCTAssertEqual(e[0].fraccion, 1)
        XCTAssertEqual(e[3].fraccion, 4012.0 / 4390.0, accuracy: 1e-5)
    }

    func testConMenosDeDosIndividualesNoHayEvolucion() {
        XCTAssertNil(DecideCarreras.evolucion([C.individual2026VLC]))
        XCTAssertNil(DecideCarreras.evolucion(lectura("dobles").pasadas))
        XCTAssertNil(DecideCarreras.evolucion([]))
    }

    func testSinNingunPuestoPorEstacionLaSeccionLoDeclara() {
        XCTAssertTrue(DecideCarreras.estacionesSinPuesto(lectura("parcial").analisis!.estaciones))
        XCTAssertFalse(DecideCarreras.estacionesSinPuesto(lectura("lleno").analisis!.estaciones))
        XCTAssertFalse(DecideCarreras.estacionesSinPuesto([]))
    }

    func testSoloDeEquipoElAnalisisNoPuedeExistir() {
        XCTAssertTrue(DecideCarreras.soloDeEquipo(lectura("dobles").pasadas))
        XCTAssertFalse(DecideCarreras.soloDeEquipo(lectura("lleno").pasadas))
        XCTAssertFalse(DecideCarreras.soloDeEquipo([]))
    }

    func testListaCortaNombraLosQueFaltanSinPasarse() {
        XCTAssertEqual(DecideCarreras.listaCorta(["Wall ball"]), "Wall ball")
        XCTAssertEqual(DecideCarreras.listaCorta(["A", "B"]), "A y B")
        XCTAssertEqual(DecideCarreras.listaCorta(["A", "B", "C"]), "A, B y C")
        XCTAssertEqual(DecideCarreras.listaCorta(["A", "B", "C", "D", "E"]), "A, B y 3 más")
    }

    // MARK: Las etiquetas de una carrera

    func testElEquipoSeDiceComoSeHabla() {
        XCTAssertEqual(DecideCarreras.textoEquipo([CompaneroDeEquipo(posicion: 1, nombre: "Aina")]), "con Aina")
        XCTAssertEqual(
            DecideCarreras.textoEquipo([
                CompaneroDeEquipo(posicion: 2, nombre: "Joan"),
                CompaneroDeEquipo(posicion: 1, nombre: "Aina"),
                CompaneroDeEquipo(posicion: 3, nombre: "Pau"),
            ]),
            "con Aina, Joan y Pau"
        )
        XCTAssertNil(DecideCarreras.textoEquipo([]))
    }

    func testLaCategoriaDeUnaCarreraQueNoEsHyroxNoSePinta() {
        // El servidor rellena individual/open/hombres por defecto en las que no lo son: no es un dato del atleta.
        XCTAssertEqual(DecideCarreras.lineaCategoria(C.proxima(1, "HYROX", 3)), "Individual · Open · Hombres")
        XCTAssertEqual(DecideCarreras.lineaCategoria(C.proxima(1, "HYROX", 3, formato: .dobles, categoria: .mixto)), "Open · Mixto")
        XCTAssertNil(DecideCarreras.lineaCategoria(C.proxima(1, "Mitja", 3, tipoEvento: .otro)))
    }

    func testSinEtiquetaDeDivisionOCategoriaEseTrozoSeCalla() {
        // El servidor no mandó la categoría: la línea no la inventa.
        let sinCategoria = ProximaCarrera(
            raceId: 1, nombre: "HYROX", tipoEvento: .hyrox, formato: .individual, division: .pro, categoria: nil,
            fecha: nil, lugar: nil, metaS: nil, diasHasta: nil, prioridad: .principal
        )
        XCTAssertEqual(DecideCarreras.lineaCategoria(sinCategoria), "Individual · Pro")
    }

    func testEnEspanolDeBoxLoDeTuneUpYRelayEsPuestaAPuntoYRelevos() {
        XCTAssertEqual(PrioridadCarrera.puestaAPunto.etiqueta, "Puesta a punto")
        XCTAssertEqual(PrioridadCarrera.secundaria.etiqueta, "Secundaria")
        XCTAssertEqual(PrioridadCarrera.principal.etiqueta, "Objetivo principal")
        XCTAssertEqual(FormatoCarrera.relevos.etiqueta, "Relevos")
        XCTAssertEqual(DecideCarreras.etiquetaEquipo(.relevos), "Relevos")
        XCTAssertEqual(DecideCarreras.etiquetaEquipo(.dobles), "Dobles")
        XCTAssertNil(DecideCarreras.etiquetaEquipo(.individual))
    }

    // MARK: El calendario de ejemplo y el resto de vocabulario

    func testUnFormatoDesconocidoNoSeInventa() {
        XCTAssertNil(FormatoCarrera(wire: "otra-cosa"))
        XCTAssertNil(DivisionCarrera(wire: nil))
        XCTAssertNil(CategoriaCarrera(wire: "x"))
        XCTAssertEqual(TipoEventoCarrera(wire: "algo"), .otro)
        XCTAssertEqual(SeveridadCarrera(wire: "better"), .better)
        XCTAssertEqual(SeveridadCarrera(wire: "desconocida"), .worse)
    }
}
