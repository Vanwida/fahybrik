import XCTest
@testable import FAHYBRIK

// LA MUÑECA DE CORRER CONTRA EL KIT — vectores de oro del web al Swift.
//
// `Vectores/muneca-correr.json` lo escribe `web/scripts/muneca-correr-vectores.ts`
// desde las sesiones de correr del doble (491, 494, 573, 479, 551, 509, 535,
// 538, 552, las del modelo, el correr libre…; de cada una solo los pasos que pinta la cara de correr). Trae los PASOS con las claves del
// kit (aquí se decodifican con la codificación estable de `Vivo.Paso`) y, por
// cada paso y situación de lecturas, lo que pinta el kit en líneas de texto. El
// Swift monta el mismo estado, saca su `CuadroMuneca` y las líneas tienen que
// ser idénticas: qué número manda, la banda con su marca, a qué cuerpo cabe
// cada fila, el 3-2-1, la estructura, las vueltas.
//
// Si falla: o cambió el kit (regenera los vectores y porta el cambio al Swift) o
// se rompió el Swift. Nunca se retoca el fichero a mano.
final class MunecaCorrerTests: XCTestCase {

    // MARK: - El fichero

    struct Doc: Decodable {
        let lienzo: LienzoV
        let vueltas: [VueltasV]
        let casos: [CasoV]
    }
    struct LienzoV: Decodable { let anchoUtil, anchoHeroe, anchoCabeza, anchoPie, altoUtil: Double }
    struct CasoV: Decodable {
        let clave: String
        let plan: Vivo.PlanVivo
        let estructura: [EstructuraV]
        let pasos: [PasoV]
    }
    struct EstructuraV: Decodable { let i: Int; let filas: [String] }
    struct PasoV: Decodable {
        let paso: Cabecera
        let situaciones: [SituacionV]
    }
    struct Cabecera: Decodable {
        let i: Int
        let viene: String?
        let luego: [String?]?
        let cuenta: [String]
        let go: [String]
    }
    struct LecturasV: Decodable {
        let t: Double
        let hecho, ritmo, ppm: Double?
        let ppmTendencia: String?
        let gps: String
        let viejos: [String]?

        var lecturas: Vivo.Lecturas {
            Vivo.Lecturas(t: t, hecho: hecho, ritmo: ritmo, ppm: ppm, ppmTendencia: ppmTendencia.flatMap(Vivo.Tendencia.init(rawValue:)),
                          gps: Vivo.EstadoGps(rawValue: gps) ?? .noAplica, viejos: (viejos ?? []).compactMap(Vivo.CampoVivo.init(rawValue:)))
        }
    }
    struct SesionV: Decodable {
        let t: Double
        let metros, ritmoMedio, ppmMedio: Double?
        var sesion: Vivo.Sesion { Vivo.Sesion(t: t, metros: metros, ritmoMedio: ritmoMedio, ppmMedio: ppmMedio) }
    }
    struct SituacionV: Decodable {
        let n: String
        let lec: LecturasV
        let sesion: SesionV
        let plano: [String]
        let datos: [String]
    }
    struct VueltaV: Decodable {
        let n: Int
        let tanda: Int?
        let clase: String
        let segundos: Double
        let metros, vueltaM, ritmo, ppm: Double?
        let veredicto: String?
        let eje: String?
        var vuelta: Vivo.Vuelta {
            Vivo.Vuelta(n: n, tanda: tanda, clase: Vivo.Vuelta.Clase(rawValue: clase) ?? .serie, segundos: segundos, metros: metros, vueltaM: vueltaM, ritmo: ritmo, ppm: ppm,
                        veredicto: veredicto.flatMap(Vivo.Veredicto.init(rawValue:)), eje: eje.flatMap(Vivo.EjeObjetivo.init(rawValue:)))
        }
    }
    struct VueltasV: Decodable {
        let n: String
        let vueltas: [VueltaV]
        let objetivo: String?
        let visibles: Int
        let titulo: [String]
        let filas: [String]
    }

    static let doc: Doc = {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Vectores/muneca-correr.json")
        do { return try JSONDecoder().decode(Doc.self, from: try Data(contentsOf: url)) }
        catch { fatalError("Los vectores de oro no se leen (\(url.path)): \(error)") }
    }()

    private var doc: Doc { Self.doc }

    /// Compara y junta los fallos: un cambio en el kit puede romper cientos de líneas y no
    /// queremos cientos de avisos, sino los primeros con su contexto.
    private func comprobar(_ fallos: [String], _ que: String, file: StaticString = #filePath, line: UInt = #line) {
        guard !fallos.isEmpty else { return }
        XCTFail("\(que): \(fallos.count) diferencias con el kit. Las primeras:\n" + fallos.prefix(30).joined(separator: "\n"), file: file, line: line)
    }

    private func diferencias(_ esperado: [String], _ obtenido: [String], _ donde: String) -> [String] {
        guard esperado != obtenido else { return [] }
        var out = ["· \(donde)"]
        for k in 0..<Swift.max(esperado.count, obtenido.count) {
            let a = k < esperado.count ? esperado[k] : "(falta)"
            let b = k < obtenido.count ? obtenido[k] : "(falta)"
            if a != b { out.append("    kit:   \(a)\n    swift: \(b)") }
        }
        return out
    }

    // MARK: - El lienzo

    func testElLienzoDelKitEsElDelSwift() {
        let l = Vivo.MedidasMuneca.mm46
        XCTAssertEqual(l.anchoUtil, doc.lienzo.anchoUtil)
        XCTAssertEqual(l.anchoHeroe, doc.lienzo.anchoHeroe)
        XCTAssertEqual(l.anchoCabeza, doc.lienzo.anchoCabeza, accuracy: 1e-9)
        XCTAssertEqual(l.anchoPie, doc.lienzo.anchoPie, accuracy: 1e-9)
        XCTAssertEqual(l.altoUtil, doc.lienzo.altoUtil)
    }

    // MARK: - Los planes

    func testLosVectoresTraenLasSesionesQueSeExaminan() {
        let claves = doc.casos.map(\.clave)
        for c in ["573", "509", "535", "552", "479", "491", "494", "551", "538-correr"] { XCTAssertTrue(claves.contains(c), c) }
        XCTAssertTrue(doc.casos.allSatisfy { !$0.plan.pasos.isEmpty })
        // Cuadros hay en cada sesión con algún paso que pinte la cara de correr; la 552 (For Time) trae solo su plan.
        for c in doc.casos {
            let pintaCorrer = c.plan.pasos.indices.contains { Vivo.familiaMuneca(c.plan.pasos, $0) == .correr }
            XCTAssertEqual(!c.pasos.isEmpty, pintaCorrer, c.clave)
        }
    }

    /// El plan del kit, decodificado con la codificación estable, vuelve a ser el mismo al escribirlo y leerlo.
    func testLosPlanesDelKitDanLaVueltaEntera() throws {
        for c in doc.casos {
            let back = try JSONDecoder().decode(Vivo.PlanVivo.self, from: try JSONEncoder().encode(c.plan))
            XCTAssertEqual(back, c.plan, c.clave)
        }
    }

    // MARK: - Lo que pinta cada paso

    func testElCuadroDeCadaPasoEsElDelKit() {
        var fallos: [String] = []
        var vistos = 0
        for c in doc.casos {
            for pv in c.pasos {
                for s in pv.situaciones {
                    let e = Vivo.EstadoVivo(pasos: c.plan.pasos, i: pv.paso.i, lecturas: s.lec.lecturas, sesion: s.sesion.sesion,
                                            zonas: c.plan.zonas, reglas: c.plan.reglas, pausado: false)
                    let cuadro = Vivo.cuadroMuneca(e)
                    let donde = "\(c.clave) · paso \(pv.paso.i) · \(s.n)"
                    fallos += diferencias(s.plano, MunecaPlano.plano(cuadro.cara, tinte: cuadro.tinte), donde)
                    fallos += diferencias(s.datos, cuadro.datos.filas.map(MunecaPlano.plano), "\(donde) · datos")
                    vistos += 1
                }
            }
        }
        XCTAssertGreaterThan(vistos, 300, "se esperaban cientos de cuadros")
        comprobar(fallos, "el cuadro de la muñeca")
    }

    func testLaCuentaAtrasYElGoDeCadaPasoSonLosDelKit() {
        var fallos: [String] = []
        for c in doc.casos {
            for pv in c.pasos {
                let i = pv.paso.i
                let p = c.plan.pasos[i]
                let entra = i + 1 < c.plan.pasos.count ? c.plan.pasos[i + 1] : p
                fallos += diferencias(pv.paso.cuenta, MunecaPlano.plano(Vivo.caraCuenta(3, entra, .mm46)), "\(c.clave) · paso \(i) · 3-2-1")
                fallos += diferencias(pv.paso.go, MunecaPlano.plano(Vivo.caraCuenta(0, p, .mm46)), "\(c.clave) · paso \(i) · GO")
            }
        }
        comprobar(fallos, "la cuenta atrás")
    }

    func testLoQueVieneYElLuegoSonLosDelKit() {
        var fallos: [String] = []
        for c in doc.casos {
            for pv in c.pasos {
                let i = pv.paso.i
                let viene = i + 1 < c.plan.pasos.count ? Vivo.textoViene(c.plan.pasos[i + 1]) : nil
                if viene != pv.paso.viene { fallos.append("· \(c.clave) · paso \(i) · viene\n    kit:   \(pv.paso.viene ?? "-")\n    swift: \(viene ?? "-")") }
                let luego = Vivo.luegoDe(c.plan.pasos, i).map { [$0.que, $0.despues] as [String?] }
                if luego != pv.paso.luego { fallos.append("· \(c.clave) · paso \(i) · luego\n    kit:   \(String(describing: pv.paso.luego))\n    swift: \(String(describing: luego))") }
            }
        }
        comprobar(fallos, "«Luego ·» y «Viene:»")
    }

    // MARK: - La página Estructura

    /// Las filas de una sesión de correr son las del kit. Las estaciones que se cuelan en un plan mixto
    /// (los Wall Balls de 479) se escriben con su dosis y su carga, como en el iPhone: solo se comprueba su estado.
    func testLaEstructuraDeCadaSesionEsLaDelKit() {
        var fallos: [String] = []
        for c in doc.casos {
            for x in c.estructura {
                let filas = Vivo.estructuraDe(c.plan.pasos, i: x.i)
                let obtenidas = filas.map { f -> String in
                    let t = Vivo.textoFila(f)
                    let linea = MunecaPlano.plano(Vivo.FilaLista(linea: t.linea, detalle: t.detalle, estado: f.estado))
                    return f.trabajo.clase == .estacion ? "\(f.estado.rawValue)|(estación)" : linea
                }
                let esperadas = zip(x.filas, filas).map { linea, f in f.trabajo.clase == .estacion ? "\(f.estado.rawValue)|(estación)" : linea }
                fallos += diferencias(esperadas, obtenidas, "\(c.clave) · paso \(x.i) · estructura")
            }
        }
        comprobar(fallos, "la estructura")
    }

    // MARK: - La página Vueltas

    func testLasVueltasSonLasDelKit() {
        var fallos: [String] = []
        for v in doc.vueltas {
            let r = Vivo.filasDeVueltas(v.vueltas.map(\.vuelta), objetivo: v.objetivo, visibles: v.visibles)
            if r.titulo != v.titulo { fallos.append("· \(v.n) · título: kit \(v.titulo) swift \(r.titulo)") }
            fallos += diferencias(v.filas, r.filas.map(MunecaPlano.plano), "\(v.n) · filas")
        }
        comprobar(fallos, "las vueltas")
    }
}
