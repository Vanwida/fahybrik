import XCTest
@testable import FAHYBRIK

// LOS DOBLES, LA SALIDA Y EL SALTO EN EL VIVO NUEVO — lo que el shell viejo
// (`RunLiveShellView`) hacía y el vivo nuevo tiene que hacer igual antes de
// encenderse en Release: el relevo no graba nada tuyo, el reparto es TU parte,
// la Estructura salta por segmentos y la tira de la pareja dice lo que hay.
final class VivoDoblesTests: XCTestCase {

    private typealias D = VivoPlanesDobles

    // MARK: - El adaptador: el turno como dato del paso

    func testLaEstacionDeLaParejaEsUnRelevo() throws {
        let plan = try D.simulacro()
        XCTAssertEqual(plan.segments.count, 4, "con reparto, cada estación es su segmento")
        let vivo = Vivo.planDe(plan, zonas: nil, entorno: .outdoor)
        let relevo = vivo.pasos.filter { $0.origen?.segmento == 1 }
        XCTAssertEqual(relevo.count, 1, "la estación de la pareja es UN paso: el motor la salta entera")
        let p = try XCTUnwrap(relevo.first)
        XCTAssertTrue(Vivo.esRelevo(p))
        XCTAssertEqual(p.rol, .recuperacion)
        XCTAssertEqual(p.nombre, "SkiErg 1km")
        XCTAssertEqual(p.dobles?.pareja, D.pareja)
        XCTAssertEqual(p.cierre, .atleta)
        XCTAssertEqual(p.medida.tipo, .abierta, "de tu pareja no se mide nada")
        XCTAssertEqual(Vivo.clavePorDefecto(p), .relevo)
        XCTAssertEqual(Vivo.ClavePrimaria.relevo.texto, "Relevo")
        XCTAssertTrue(Vivo.ClavePrimaria.relevo.esPrimaria)
        XCTAssertEqual(Vivo.avisoDeCierre(p), "Relevo · entras tú")
        XCTAssertEqual(Vivo.formatoDobles(try XCTUnwrap(p.dobles)), "Dobles · le toca a Marta")
        let h = Vivo.heroeDeFamilia(p, Vivo.Lecturas(t: 42, hecho: nil, ritmo: nil, ppm: 150), nil)
        XCTAssertEqual(h.texto, "0:42")
        XCTAssertEqual(h.etiqueta, "recuperas")
        // Lo individual no lleva turno.
        XCTAssertTrue(vivo.pasos.filter { $0.origen?.segmento == 0 }.allSatisfy { $0.dobles == nil })
    }

    func testEnUnRepartoLaDosisEsTuParte() throws {
        let vivo = Vivo.planDe(try D.simulacro(), zonas: nil, entorno: .outdoor)
        let wb = try XCTUnwrap(vivo.pasos.first { $0.origen?.segmento == 3 && $0.rol == .trabajo })
        let d = try XCTUnwrap(wb.dobles)
        XCTAssertEqual(d.turno, .reparto)
        XCTAssertEqual(d.tuyas, 60)
        XCTAssertEqual(d.suyas, 40)
        XCTAssertEqual(wb.medida.prescrito, 60, "la dosis es tu parte (la que graba el motor), no la estación")
        XCTAssertEqual(Vivo.pactoDe(d), "Tú 60 · Marta 40 · alterna 25")
        XCTAssertEqual(Vivo.formatoDobles(d), "Dobles · con Marta")
        XCTAssertFalse(Vivo.esRelevo(wb))
    }

    func testSinNombreLaParejaEsTuPareja() throws {
        let vivo = Vivo.planDe(try D.simulacro(conPareja: false), zonas: nil, entorno: .outdoor)
        let p = try XCTUnwrap(vivo.pasos.first(where: Vivo.esRelevo))
        let d = try XCTUnwrap(p.dobles)
        XCTAssertNil(d.pareja, "no se inventa un nombre")
        XCTAssertEqual(Vivo.textoTurno(d), "le toca a tu pareja")
        let wb = try XCTUnwrap(vivo.pasos.first { $0.dobles?.turno == .reparto }?.dobles)
        XCTAssertEqual(Vivo.pactoDe(wb), "Tú 60 · Tu pareja 40 · alterna 25")
    }

    // MARK: - El cuadro sobre el motor real

    @MainActor
    func testElCuadroDelRelevoPideRelevoYNoAnota() throws {
        let s = try D.sesion(en: 1)
        XCTAssertTrue(s.currentSegmentIsPartnerRelay)
        let vivo = Vivo.planDe(s.plan, zonas: nil, entorno: s.runEnvironment)
        let e = Vivo.estadoDe(s, plan: vivo)
        XCTAssertTrue(Vivo.esRelevo(e.paso), "el cursor del motor cae en el relevo")
        let c = VivoIphoneCuadro(estado: e, sesion: s, dispositivos: Vivo.sinDispositivos, test: false, declaradas: [:])
        XCTAssertEqual(c.primaria?.clave, .relevo)
        XCTAssertEqual(c.posicion, ["SkiErg 1km"])
        XCTAssertEqual(c.formato.first, "Dobles · le toca a Marta", "el turno y la pareja, delante en la cabecera")
        XCTAssertEqual(c.nota, Vivo.notaRelevo)
        XCTAssertTrue(c.seriesAnotables.isEmpty)
        XCTAssertEqual(c.heroe.etiqueta, "recuperas")
    }

    @MainActor
    func testElRelevoNoGrabaNadaTuyo() throws {
        // La misma llamada que hace la primaria «Relevo» (y la muñeca, y el shell viejo).
        let s = try D.sesion(en: 1)
        let antes = s.laps.map(\.templateSegmentId)
        s.advanceRelay()
        XCTAssertEqual(s.laps.map(\.templateSegmentId), antes, "la estación de la pareja no entra en tu volumen")
        XCTAssertFalse(s.laps.contains { $0.templateSegmentId == 2169 })
        XCTAssertEqual(s.currentSegmentIndex, 2)
    }

    @MainActor
    func testElCuadroDelRepartoLlevaElPacto() throws {
        let s = try D.sesion(en: 3)
        let vivo = Vivo.planDe(s.plan, zonas: nil, entorno: s.runEnvironment)
        let e = Vivo.estadoDe(s, plan: vivo)
        let c = VivoIphoneCuadro(estado: e, sesion: s, dispositivos: Vivo.sinDispositivos, test: false, declaradas: [:])
        XCTAssertEqual(c.formato.first, "Dobles · con Marta")
        XCTAssertEqual(c.nota, "Tú 60 · Marta 40 · alterna 25")
        XCTAssertNotEqual(c.primaria?.clave, .relevo)
    }

    // MARK: - Saltar desde la Estructura

    func testLaEstructuraSaltaPorSegmentos() throws {
        let vivo = Vivo.planDe(try D.simulacro(), zonas: nil, entorno: .outdoor)
        let i = try XCTUnwrap(vivo.pasos.firstIndex { $0.origen?.segmento == 0 })
        let filas = Vivo.estructuraDe(vivo.pasos, i: i)
        let saltos = filas.map { Vivo.segmentoDeSalto($0, segmentoActual: 0) }
        XCTAssertNil(saltos.first ?? nil, "la fila de ahora no salta")
        XCTAssertEqual(saltos.compactMap { $0 }, [1, 2, 3], "cada fila de otro tramo lleva a su segmento")
        // La estación de la pareja es SU fila, no la «recuperación» del Run de antes.
        let relevo = try XCTUnwrap(filas.first { $0.trabajo.origen?.segmento == 1 })
        XCTAssertEqual(Vivo.textoFila(relevo).linea, "SkiErg 1km")
        XCTAssertEqual(Vivo.textoFila(relevo).detalle, "le toca a Marta")
        XCTAssertNil(filas.first?.recupera)
        // Una fila del segmento en curso que no es la de ahora no salta (el motor salta por segmentos).
        var f = try XCTUnwrap(filas.first)
        f.estado = .pendiente
        XCTAssertNil(Vivo.segmentoDeSalto(f, segmentoActual: 0))
        XCTAssertEqual(Vivo.segmentoDeSalto(f, segmentoActual: 2), 0, "hacia atrás también")
    }

    // MARK: - La tira de la pareja

    func testLaTiraDeLaParejaDiceLoQueHay() {
        XCTAssertNil(DoblesLiveStripState.hidden.lineaVivo)
        let vivo = DoblesLiveStripState.live(name: "Marta", paused: false, blockName: "SkiErg", progress: "600 m",
                                             elapsedS: 754, hrBpm: 162, ageS: 3).lineaVivo
        XCTAssertEqual(vivo?.titular, "Marta · en vivo")
        XCTAssertEqual(vivo?.detalle, "SkiErg · 600 m · 12:34 · 162 ppm")
        XCTAssertEqual(vivo?.enVivo, true)
        XCTAssertEqual(DoblesLiveStripState.live(name: "Marta", paused: true, blockName: nil, progress: nil,
                                                 elapsedS: 60, hrBpm: nil, ageS: 3).lineaVivo?.titular, "Marta · en pausa")
        XCTAssertEqual(DoblesLiveStripState.stale(name: "Marta", ageS: 40).lineaVivo?.detalle, "última hace 40 s")
        XCTAssertEqual(DoblesLiveStripState.finished(name: "Marta", finalTimeS: 4210, finalRpe: nil).lineaVivo?.titular, "Marta ha terminado")
        XCTAssertEqual(DoblesLiveStripState.left(name: "Marta").lineaVivo?.detalle, "tu sesión sigue igual")
    }

    // MARK: - La bandera

    func testLaBanderaEstaEncendidaPorDefecto() {
        let d = UserDefaults.standard
        let antes = d.object(forKey: VivoIphoneBandera.clave)
        d.removeObject(forKey: VivoIphoneBandera.clave)
        defer { if let antes { d.set(antes, forKey: VivoIphoneBandera.clave) } }
        XCTAssertTrue(VivoIphoneBandera.activa, "el vivo nuevo es el de la app (Debug y Release)")
    }
}
