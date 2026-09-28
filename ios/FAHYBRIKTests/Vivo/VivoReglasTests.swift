import XCTest
@testable import FAHYBRIK

// EL DOMINIO DEL VIVO, EN SWIFT, CONTRA LOS MISMOS CASOS QUE EL KIT DE LA MUÑECA.
//
// Espejo de `web/tests/design-twin/kit-reloj-familia.test.ts`,
// `kit-reloj-veredicto.test.ts` y `kit-reloj-motor.test.ts` (la parte pura):
// mismos insumos, mismas salidas. Si un caso cambia en el kit del doble, cambia
// aquí en el mismo lote — es lo único que significa «un estado, dos pintores».

final class VivoReglasTests: XCTestCase {

    private let zonas = Vivo.ZonasCoach(techos: [138, 150, 160, 173, 192])
    private let R = Vivo.reglasAvisoDefecto
    private var n = 0

    private func paso(_ clase: Vivo.Clase, _ rol: Vivo.Rol, _ medida: Vivo.Medida, _ mod: (inout Vivo.Paso) -> Void = { _ in }) -> Vivo.Paso {
        n += 1
        var p = Vivo.Paso(id: "p\(n)", clase: clase, rol: rol, fase: .principal, medida: medida)
        mod(&p)
        return p
    }

    private func lect(_ mod: (inout Vivo.Lecturas) -> Void = { _ in }) -> Vivo.Lecturas {
        var l = Vivo.Lecturas(t: 60, hecho: nil, ritmo: nil, ppm: 160)
        mod(&l)
        return l
    }

    private func split(_ s: Double) -> Vivo.Objetivo { Vivo.Objetivo(eje: .split500, min: s, max: s, papel: .principal) }

    // MARK: - La bici se lee por 1000 m; el remo y el ski, por 500

    func testLaBiciSeLeePorMil() {
        let bici = Vivo.Maquina(tipo: .bici), remo = Vivo.Maquina(tipo: .remo)
        XCTAssertEqual(Vivo.fmtSplit(60, bici), "2:00")
        XCTAssertEqual(Vivo.fmtSplit(60, remo), "1:00")
        XCTAssertEqual(Vivo.fmtSplit(nil, bici), "—")
        XCTAssertEqual(Vivo.unidadSplit(bici), "/1000")
        XCTAssertEqual(Vivo.unidadSplit(remo), "/500")
        XCTAssertEqual(Vivo.fmtObjetivo(split(60), bici), "2:00 /1000")
        XCTAssertEqual(Vivo.fmtObjetivo(split(125), remo), "2:05 /500")
        XCTAssertEqual(Vivo.textoObjetivo(split(60), bici), "a 2:00 /1000")
        let p = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 2000, mide: .ergo)) { $0.nombre = "BikeErg"; $0.maquina = bici; $0.objetivos = [self.split(60)] }
        let l = lect { $0.split500 = 61; $0.hecho = 800 }
        let h = Vivo.heroeDelPaso(p, l, zonas)
        XCTAssertEqual(h.clase, .split); XCTAssertEqual(h.texto, "2:02"); XCTAssertEqual(h.unidad, "/1000")
        XCTAssertEqual(Vivo.laminaDelPaso(p, l, zonas, R).banda?.rotulo, "2:00 /1000")
        XCTAssertTrue(Vivo.vozInicio(p).contains("el mil"))
        XCTAssertEqual(Vivo.nombreMaquina(bici), "la bici")
        XCTAssertEqual(Vivo.nombreMaquinaCorto(remo), "Remo")
        XCTAssertEqual(Vivo.deMaquina(remo), "del remo")
        XCTAssertEqual(Vivo.deMaquina(bici), "de la bici")
    }

    // MARK: - La familia del paso

    func testCadaPasoCaeEnSuFamilia() {
        XCTAssertEqual(Vivo.familiaDe(paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps))), .correr)
        XCTAssertEqual(Vivo.familiaDe(paso(.series, .trabajo, .init(tipo: .tiempo, prescrito: 120, mide: .reloj)) { $0.entorno = .cinta }), .cinta)
        XCTAssertEqual(Vivo.familiaDe(paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .ergo)) { $0.nombre = "SkiErg"; $0.maquina = .init(tipo: .ski) }), .ski)
        XCTAssertEqual(Vivo.familiaDe(paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .atleta)) { $0.nombre = "SkiErg"; $0.maquina = .init(tipo: .ski); $0.cierre = .atleta }), .estacion)
        XCTAssertEqual(Vivo.familiaDe(paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta)) { $0.nombre = "Sled Push"; $0.cierre = .atleta }), .estacion)
        XCTAssertEqual(Vivo.familiaDe(paso(.recuperacion, .recuperacion, .init(tipo: .tiempo, prescrito: 90, mide: .reloj))), .recupera)
        XCTAssertEqual(Vivo.familiaDe(paso(.descanso, .descanso, .init(tipo: .tiempo, prescrito: 120, mide: .reloj))), .descanso)
        XCTAssertEqual(Vivo.familiaDe(paso(.roxzone, .transicion, .init(tipo: .abierta, prescrito: nil, mide: .reloj)) { $0.roxzone = .entrada; $0.cierre = .atleta }), .roxzone)
        let run = Vivo.Tarea(nombre: "Run", dosis: nil, mide: .cinta, corre: true)
        let row = Vivo.Tarea(nombre: "Row", dosis: nil, mide: .ergo)
        let enCinta = paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 75, mide: .reloj)) { $0.entorno = .cinta; $0.wod = .emom(tarea: run, ciclo: [run, row], ventanas: 10, ventanaS: 75) }
        let enRemo = paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 75, mide: .reloj)) { $0.maquina = .init(tipo: .remo); $0.wod = .emom(tarea: row, ciclo: [run, row], ventanas: 10, ventanaS: 75) }
        XCTAssertEqual(Vivo.familiaDe(enCinta), .cinta)
        XCTAssertEqual(Vivo.familiaDe(enRemo), .emom)
    }

    func testUnTestEsSuFamiliaYLlevaLaMarca() {
        let t = paso(.test, .trabajo, .init(tipo: .distancia, prescrito: 2000, mide: .ergo)) { $0.nombre = "Row"; $0.maquina = .init(tipo: .remo) }
        XCTAssertEqual(Vivo.familiaDe(t), .remo)
        XCTAssertTrue(Vivo.esTest(t))
        let h = Vivo.heroeDeFamilia(t, lect { $0.split500 = 112; $0.hecho = 1300 }, zonas)
        XCTAssertEqual(h.clase, .falta); XCTAssertEqual(h.texto, "700"); XCTAssertEqual(h.unidad, "m")
        let m = Vivo.metricasDelPaso(t, lect { $0.split500 = 112; $0.hecho = 1300; $0.cadencia = 30; $0.vatios = 260; $0.cal = 40 }, heroe: .falta, zonas)
        XCTAssertEqual(m.first?.clave, .split); XCTAssertEqual(m.first?.valor, "1:52")
    }

    func testElFormatoEnCastellanoDeBox() {
        let row = Vivo.Tarea(nombre: "Row", dosis: nil, mide: .ergo)
        XCTAssertEqual(Vivo.formatoDe(paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 60, mide: .reloj)) { $0.wod = .emom(tarea: row, ciclo: [row], ventanas: 12, ventanaS: 60) }), "EMOM 12′")
        XCTAssertEqual(Vivo.formatoDe(paso(.amrap, .trabajo, .init(tipo: .tiempo, prescrito: 900, mide: .reloj)) { $0.wod = .amrap(tareas: [], duracionS: 900) }), "AMRAP 15′")
        XCTAssertEqual(Vivo.formatoDe(paso(.fortime, .trabajo, .init(tipo: .reps, prescrito: 20, mide: .atleta)) { $0.wod = .fortime(tarea: nil, capS: 1200) }), "For Time · cap 20′")
        XCTAssertEqual(Vivo.formatoDe(paso(.series, .trabajo, .init(tipo: .tiempo, prescrito: 20, mide: .reloj)) { $0.wod = .pared(trabajoS: 20, descansoS: 10, rondas: 8) }), "Tabata 8 × 20″/10″")
        XCTAssertEqual(Vivo.formatoDe(paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps))), "Series")
        XCTAssertEqual(Vivo.formatoDe(paso(.rodaje, .trabajo, .init(tipo: .tiempo, prescrito: 3000, mide: .reloj))), "Rodaje")
        XCTAssertEqual(Vivo.formatoDe(paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta)) { $0.posicion = .init(ronda: .init(n: 2, de: 5)) }), "Circuito")
        XCTAssertTrue(Vivo.admiteHorizontal(.remo)); XCTAssertTrue(Vivo.admiteHorizontal(.cinta))
        XCTAssertFalse(Vivo.admiteHorizontal(.correr)); XCTAssertFalse(Vivo.admiteHorizontal(.fuerza))
    }

    // MARK: - La rejilla de apoyo (§4)

    func testRejillaCorrerARitmo() {
        let p = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 225, max: 235, papel: .principal)] }
        let m = Vivo.metricasDelPaso(p, lect { $0.ritmo = 230; $0.ppm = 171; $0.cadencia = 178; $0.hecho = 380 }, heroe: .ritmo, zonas, .init(metrosPaso: 380))
        XCTAssertEqual(m.map(\.clave), [.pulso, .distancia, .cadencia])
        XCTAssertEqual(m[0].valor, "171"); XCTAssertEqual(m[0].unidad, "ppm"); XCTAssertEqual(m[0].zona?.n, 4)
        XCTAssertEqual(m[1].valor, "380"); XCTAssertEqual(m[1].unidad, "m")
        XCTAssertEqual(m[2].valor, "178"); XCTAssertEqual(m[2].unidad, "pasos")
    }

    func testRejillaCorrerAZonaTraeElRitmo() {
        let p = paso(.rodaje, .trabajo, .init(tipo: .tiempo, prescrito: 3000, mide: .reloj)) { $0.objetivos = [.init(eje: .zona, min: 2, max: 2, papel: .principal)] }
        let m = Vivo.metricasDelPaso(p, lect { $0.ritmo = 330; $0.ppm = 145 }, heroe: .pulso, zonas, .init(metrosPaso: 2200))
        XCTAssertEqual(m.map(\.clave), [.ritmo, .distancia])
        XCTAssertEqual(m[0].valor, "5:30"); XCTAssertEqual(m[0].unidad, "/km")
    }

    func testRejillaDelRemoYLaBici() {
        let remo = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 500, mide: .ergo)) { $0.nombre = "Row"; $0.maquina = .init(tipo: .remo); $0.objetivos = [self.split(112)] }
        let m = Vivo.metricasDelPaso(remo, lect { $0.split500 = 113; $0.cadencia = 28; $0.vatios = 240; $0.cal = 18; $0.ppm = 166 }, heroe: .split, zonas)
        XCTAssertEqual(m.map(\.clave), [.cadencia, .pulso, .cal, .vatios])
        XCTAssertEqual(m[0].valor, "28"); XCTAssertEqual(m[0].unidad, "s/min")
        XCTAssertEqual(m[2].valor, "18"); XCTAssertEqual(m[2].unidad, "cal")
        let bici = paso(.ergo, .trabajo, .init(tipo: .tiempo, prescrito: 240, mide: .ergo)) { $0.nombre = "BikeErg"; $0.maquina = .init(tipo: .bici); $0.objetivos = [.init(eje: .zona, min: 2, max: 2, papel: .principal)] }
        let mb = Vivo.metricasDelPaso(bici, lect { $0.split500 = 62; $0.cadencia = 88; $0.vatios = nil; $0.cal = nil }, heroe: .pulso, zonas)
        XCTAssertEqual(mb.map(\.clave), [.split, .cadencia])
        XCTAssertEqual(mb[0].valor, "2:04"); XCTAssertEqual(mb[0].unidad, "/1000")
        XCTAssertEqual(mb[1].valor, "88"); XCTAssertEqual(mb[1].unidad, "rpm")
    }

    func testUnDatoViejoSePintaRaya() {
        let p = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 250, mide: .ergo)) { $0.nombre = "SkiErg"; $0.maquina = .init(tipo: .ski); $0.objetivos = [self.split(125)] }
        let m = Vivo.metricasDelPaso(p, lect { $0.split500 = 120; $0.cadencia = 40; $0.vatios = 210; $0.cal = 12; $0.viejos = [.split500, .cadencia, .vatios, .cal, .hecho] }, heroe: .crono, zonas)
        XCTAssertEqual(m.first { $0.clave == .split }?.valor, "—")
        XCTAssertEqual(m.first { $0.clave == .cal }?.valor, "—")
        XCTAssertEqual(m.first { $0.clave == .cadencia }?.valor, "—")
        XCTAssertEqual(m.map(\.clave), [.split, .cadencia, .pulso, .cal])
    }

    func testRejillaDeLaCintaYNuncaMasDeCuatro() {
        let p = paso(.series, .trabajo, .init(tipo: .tiempo, prescrito: 120, mide: .reloj)) { $0.entorno = .cinta; $0.objetivos = [.init(eje: .zona, min: 4, max: 4, papel: .principal), .init(eje: .inclinacion, min: 1, max: 1, papel: .secundario)] }
        let m = Vivo.metricasDelPaso(p, lect { $0.ritmo = 250; $0.ppm = 168 }, heroe: .pulso, zonas, .init(metrosPaso: 192))
        XCTAssertEqual(m.map(\.clave), [.ritmo, .inclinacion, .distancia])
        XCTAssertEqual(m[1].valor, "1"); XCTAssertEqual(m[1].unidad, "%")
        let r = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 500, mide: .ergo)) { $0.nombre = "Row"; $0.maquina = .init(tipo: .remo); $0.objetivos = [.init(eje: .zona, min: 3, max: 3, papel: .principal)] }
        XCTAssertEqual(Vivo.metricasDelPaso(r, lect { $0.split500 = 113; $0.cadencia = 28; $0.vatios = 240; $0.cal = 18; $0.ppm = 155 }, heroe: .pulso, zonas).count, 4)
    }

    // MARK: - El héroe con las reglas de familia (I4)

    func testElHeroeDeCadaFamilia() {
        let row = Vivo.Tarea(nombre: "Row", dosis: .init(tipo: .distancia, prescrito: 500, mide: .ergo), mide: .ergo)
        let ft = paso(.fortime, .trabajo, row.dosis!) { $0.nombre = "Row"; $0.maquina = .init(tipo: .remo); $0.wod = .fortime(tarea: row, capS: 1200) }
        let hf = Vivo.heroeDeFamilia(ft, lect { $0.split500 = 120; $0.hecho = 200 }, zonas, .init(total: 850))
        XCTAssertEqual(hf.clase, .crono); XCTAssertEqual(hf.texto, "14:10"); XCTAssertEqual(hf.etiqueta, "total")

        let tareas = [Vivo.Tarea(nombre: "Wall Ball", dosis: .init(tipo: .reps, prescrito: 12, mide: .atleta), mide: .atleta),
                      Vivo.Tarea(nombre: "Burpee", dosis: .init(tipo: .reps, prescrito: 8, mide: .atleta), mide: .atleta)]
        let am = paso(.amrap, .trabajo, .init(tipo: .tiempo, prescrito: 900, mide: .reloj)) { $0.wod = .amrap(tareas: tareas, duracionS: 900) }
        let ha = Vivo.heroeDeFamilia(am, lect { $0.t = 522 }, zonas, .init(rondas: 4))
        XCTAssertEqual(ha.clase, .crono); XCTAssertEqual(ha.texto, "4"); XCTAssertEqual(ha.unidad, "rondas")

        let tb = paso(.series, .trabajo, .init(tipo: .tiempo, prescrito: 20, mide: .reloj)) { $0.nombre = "Burpee"; $0.posicion = .init(ronda: .init(n: 4, de: 8)); $0.wod = .pared(trabajoS: 20, descansoS: 10, rondas: 8) }
        let ht = Vivo.heroeDeFamilia(tb, lect { $0.t = 12 }, zonas)
        XCTAssertEqual(ht.clase, .falta); XCTAssertEqual(ht.texto, "0:08"); XCTAssertEqual(ht.etiqueta, "trabajo")

        let sled = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta)) { $0.nombre = "Sled Push"; $0.cierre = .atleta }
        let hs = Vivo.heroeDeFamilia(sled, lect { $0.t = 38 }, zonas)
        XCTAssertEqual(hs.clase, .crono); XCTAssertEqual(hs.texto, "0:38"); XCTAssertEqual(hs.etiqueta, "lo dices tú")
    }

    func testLaFilaDelTrabajo() {
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 225, max: 235, papel: .principal)] }
        XCTAssertEqual(Vivo.trabajoDe(serie, lect { $0.ritmo = 230; $0.hecho = 380 }, heroe: .ritmo), .init(etiqueta: "quedan", valor: "620", unidad: "m"))
        XCTAssertNil(Vivo.trabajoDe(serie, lect { $0.hecho = 380 }, heroe: .falta))
        let row = Vivo.Tarea(nombre: "Row", dosis: nil, mide: .ergo)
        let bench = Vivo.Tarea(nombre: "Bench Press", dosis: .init(tipo: .reps, prescrito: 6, mide: .atleta), carga: .init(kg: 60), mide: .atleta)
        let minuto = paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 60, mide: .reloj)) { $0.wod = .emom(tarea: bench, ciclo: [bench, row], ventanas: 12, ventanaS: 60) }
        XCTAssertEqual(Vivo.trabajoDe(minuto, lect { $0.t = 19 }, heroe: .falta), .init(etiqueta: "tarea", valor: "6 Bench Press · 60 kg", texto: true))
        let sled = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta)) { $0.nombre = "Sled Push"; $0.carga = .init(kg: 152); $0.cierre = .atleta }
        XCTAssertEqual(Vivo.trabajoDe(sled, lect(), heroe: .crono), .init(etiqueta: "dosis", valor: "50\u{00A0}m · 152\u{00A0}kg", texto: true))
    }

    func testFuerzaElHeroeEsLaDosis() {
        var squat = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 8, mide: .atleta)) { $0.nombre = "Back Squat"; $0.cierre = .atleta; $0.tempo = .init(excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0) }
        squat.fuerza = .init(ejercicio: "bs", carga: .rm(pctMin: 65, pctMax: 70, rmKg: 186.5), esfuerzo: .init(eje: .rir, min: 2, max: 2))
        let h = Vivo.heroeDeFamilia(squat, lect(), zonas)
        XCTAssertEqual(h.texto, "8 × 125"); XCTAssertEqual(h.unidad, "kg"); XCTAssertEqual(h.etiqueta, "65–70 % RM · RIR 2")
        XCTAssertEqual(Vivo.heroeDeFamilia(squat, lect(), zonas, .init(cargaKg: 127.5)).texto, "8 × 127,5")
        XCTAssertEqual(Vivo.trabajoDe(squat, lect(), heroe: .falta), .init(etiqueta: "tempo", valor: "3-1-1", texto: true))
        var corporal = squat
        corporal.fuerza = .init(ejercicio: "bj", carga: .corporal, esfuerzo: nil)
        let hc = Vivo.heroeDeFamilia(corporal, lect(), zonas)
        XCTAssertEqual(hc.texto, "8"); XCTAssertEqual(hc.unidad, "reps"); XCTAssertEqual(hc.etiqueta, "peso corporal")
    }

    // MARK: - «Luego ·» con el «después»

    func testLuegoConElDespues() {
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 225, max: 235, papel: .principal)]; $0.posicion = .init(serie: .init(n: 3, de: 6)) }
        let rec = paso(.recuperacion, .recuperacion, .init(tipo: .tiempo, prescrito: 90, mide: .reloj)) { $0.modoRecupera = .trote }
        var serie4 = serie; serie4.id = "s4"; serie4.posicion = .init(serie: .init(n: 4, de: 6))
        XCTAssertEqual(Vivo.textoViene(rec), "Recupera 90″ trote")
        XCTAssertEqual(Vivo.luegoDe([serie, rec, serie4], 0), .init(que: "Recupera 90″ trote", despues: "1000\u{00A0}m a 3:45–3:55"))
        XCTAssertEqual(Vivo.luegoDe([serie, rec, serie4], 1), .init(que: "1000\u{00A0}m a 3:45–3:55", despues: nil))
        XCTAssertNil(Vivo.luegoDe([serie, rec, serie4], 2))
        let rox = paso(.roxzone, .transicion, .init(tipo: .abierta, prescrito: nil, mide: .sensor)) { $0.roxzone = .salida; $0.posicion = .init(ronda: .init(n: 2, de: 8)) }
        let run3 = paso(.carrera, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.nombre = "Run"; $0.posicion = .init(ronda: .init(n: 3, de: 8)) }
        XCTAssertEqual(Vivo.luegoDe([serie, rox, run3], 0), .init(que: "Roxzone", despues: "Ronda 3/8 · Run · 1000\u{00A0}m"))
        var squat = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 8, mide: .atleta)) { $0.nombre = "Back Squat"; $0.cierre = .atleta; $0.posicion = .init(serie: .init(n: 2, de: 4), slot: "A1") }
        squat.fuerza = .init(ejercicio: "bs", carga: .rm(pctMin: 65, pctMax: 70, rmKg: 186.5), esfuerzo: nil)
        XCTAssertEqual(Vivo.textoViene(squat), "A1 · Back Squat · 8 × 125 kg")
    }

    func testLaPosicionDeLaCabecera() {
        let row = Vivo.Tarea(nombre: "Row", dosis: nil, mide: .ergo)
        let minuto = paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 60, mide: .reloj)) { $0.posicion = .init(serie: .init(n: 3, de: 12)); $0.wod = .emom(tarea: row, ciclo: [row], ventanas: 12, ventanaS: 60) }
        XCTAssertEqual(Vivo.posicionDe(minuto), ["Minuto 3/12"])
        let tareas = [Vivo.Tarea(nombre: "Wall Ball", dosis: .init(tipo: .reps, prescrito: 12, mide: .atleta), mide: .atleta), Vivo.Tarea(nombre: "Burpee", dosis: .init(tipo: .reps, prescrito: 8, mide: .atleta), mide: .atleta)]
        let am = paso(.amrap, .trabajo, .init(tipo: .tiempo, prescrito: 900, mide: .reloj)) { $0.wod = .amrap(tareas: tareas, duracionS: 900) }
        XCTAssertEqual(Vivo.posicionDe(am, .init(rondas: 4)), ["Ronda 5"])
        let rec = paso(.recuperacion, .recuperacion, .init(tipo: .tiempo, prescrito: 90, mide: .reloj)) { $0.modoRecupera = .trote }
        XCTAssertEqual(Vivo.posicionDe(rec), ["Recupera", "trote", "90″"])
        let sled = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta)) { $0.nombre = "Sled Push"; $0.posicion = .init(ronda: .init(n: 2, de: 8), estacion: .init(n: 2, de: 8)) }
        XCTAssertEqual(Vivo.posicionDe(sled), ["Sled Push", "Ronda 2/8", "Estación 2/8"])
        let ski = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 250, mide: .ergo)) { $0.nombre = "SkiErg"; $0.maquina = .init(tipo: .ski); $0.posicion = .init(serie: .init(n: 3, de: 8)) }
        XCTAssertEqual(Vivo.posicionDe(ski), ["SkiErg", "Serie 3/8", "250\u{00A0}m"])
        XCTAssertEqual(Vivo.formatoDe(ski), "Series")
        let test = paso(.test, .trabajo, .init(tipo: .distancia, prescrito: 2000, mide: .ergo)) { $0.maquina = .init(tipo: .remo) }
        XCTAssertEqual(Vivo.posicionDe(test), ["Remo", "2000\u{00A0}m"])
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.posicion = .init(serie: .init(n: 3, de: 6)) }
        XCTAssertEqual(Vivo.posicionDe(serie), ["Serie 3/6", "1000\u{00A0}m"])
        var a1 = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 8, mide: .atleta)) { $0.nombre = "Back Squat"; $0.posicion = .init(serie: .init(n: 2, de: 4), slot: "A1") }
        a1.fuerza = .init(ejercicio: "bs", carga: .kg(min: 100, max: 100), esfuerzo: nil)
        XCTAssertEqual(Vivo.posicionDe(a1), ["A1 · Back Squat", "Serie 2/4"])
    }

    // MARK: - Anotar la serie

    func testAnotarLoPropuestoNoCuentaHastaConfirmar() {
        let ficha = Vivo.FichaFuerza(ejercicio: "bs", carga: .rm(pctMin: 65, pctMax: 70, rmKg: 186.5), esfuerzo: nil)
        var s1 = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 8, mide: .atleta)) { $0.nombre = "Back Squat"; $0.cierre = .atleta; $0.posicion = .init(serie: .init(n: 1, de: 4)) }
        s1.fuerza = ficha
        let d1 = paso(.descanso, .descanso, .init(tipo: .tiempo, prescrito: 120, mide: .reloj))
        var s2 = s1; s2.id = "s2"; s2.posicion = .init(serie: .init(n: 2, de: 4))
        let pasos = [s1, d1, s2]
        XCTAssertEqual(Vivo.seriesDelDescanso(pasos, 1), [0])
        let a = Vivo.anotacionDe(pasos, 0, [:], medida: nil)!
        XCTAssertEqual(a.reps, .init(valor: 8, estado: .propuesto))
        XCTAssertEqual(a.kg, .init(valor: 125, estado: .propuesto))
        let r = Vivo.confirmar([:], s1.id, a)
        XCTAssertEqual(r[s1.id]?.reps, 8); XCTAssertEqual(r[s1.id]?.kg, 125)
        XCTAssertEqual(Vivo.anotacionDe(pasos, 0, r, medida: nil)!.kg, .init(valor: 125, estado: .declarado))
        let r2: Vivo.Registro = [s1.id: .init(reps: 8, kg: 127.5)]
        XCTAssertEqual(Vivo.anotacionDe(pasos, 2, r2, medida: nil)!.kg, .init(valor: 127.5, estado: .propuesto))
        XCTAssertEqual(Vivo.girar(s2, campo: .kg, actual: 127.5, dir: 1), 130)
    }

    // MARK: - El veredicto (P1, §4)

    func testUnTechoDelCoachPoneElBordeAlto() {
        let z = Vivo.ZonasCoach(techos: [138, 152, 165, 178, 195])
        let rodaje = paso(.rodaje, .trabajo, .init(tipo: .tiempo, prescrito: 2400, mide: .reloj)) { $0.objetivos = [.init(eje: .zona, min: 1, max: 1, papel: .principal), .init(eje: .ppm, min: nil, max: 142, papel: .techo)] }
        let l141 = lect { $0.ppm = 141; $0.hecho = 60 }
        XCTAssertEqual(Vivo.veredictoDelPaso(rodaje, l141, z, R), .dentro)
        XCTAssertEqual(Vivo.laminaDelPaso(rodaje, l141, z, R).banda?.veredicto, .dentro)
        let l145 = lect { $0.ppm = 145 }
        XCTAssertEqual(Vivo.veredictoDelPaso(rodaje, l145, z, R), .porEncima)
        let banda = Vivo.laminaDelPaso(rodaje, l145, z, R).banda
        XCTAssertEqual(banda?.veredicto, .porEncima); XCTAssertEqual(banda?.palabra?.marca, "▲")
        XCTAssertEqual(Vivo.veredictoPrincipal(rodaje, lect { $0.ppm = 100 }, z, R), .dentro)
    }

    func testUnTechoEnOtraMagnitudAvisaPorSuCuenta() {
        let z = Vivo.ZonasCoach(techos: [138, 152, 165, 178, 195])
        let tempo = paso(.tempo, .trabajo, .init(tipo: .tiempo, prescrito: 2400, mide: .reloj)) { $0.objetivos = [.init(eje: .ritmo, min: 250, max: 260, papel: .principal), .init(eje: .ppm, min: nil, max: 170, papel: .techo)] }
        let l = lect { $0.ritmo = 255; $0.ppm = 175 }
        XCTAssertEqual(Vivo.veredictoDelPaso(tempo, l, z, R), .porEncima)
        XCTAssertEqual(Vivo.veredictoPrincipal(tempo, l, z, R), .dentro)
        XCTAssertEqual(Vivo.laminaDelPaso(tempo, l, z, R).banda?.veredicto, .dentro)
        XCTAssertNil(Vivo.lineaPulso(tempo, lect { $0.ppm = 171 }, z, R).aviso)
        XCTAssertEqual(Vivo.lineaPulso(tempo, lect { $0.ppm = 173 }, z, R).aviso?.texto, "alto")
    }

    func testLaBandaJuzgaConLaHolguraDelMotor() {
        let z = Vivo.ZonasCoach(techos: [138, 152, 165, 178, 195])
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 245, max: 255, papel: .principal)]; $0.posicion = .init(serie: .init(n: 3, de: 6)) }
        XCTAssertEqual(Vivo.veredictoDelPaso(serie, lect { $0.ritmo = 243 }, z, R), .dentro)
        XCTAssertEqual(Vivo.laminaDelPaso(serie, lect { $0.ritmo = 243 }, z, R).banda?.veredicto, .dentro)
        XCTAssertEqual(Vivo.veredictoDelPaso(serie, lect { $0.ritmo = 241 }, z, R), .porEncima)
    }

    func testLasPalabras() {
        XCTAssertEqual(Vivo.fmtObjetivo(.init(eje: .pctRM, min: 65, max: 70, papel: .principal)), "65–70\u{00A0}%\u{00A0}RM")
        let fuerza = paso(.fuerza, .trabajo, .init(tipo: .tiempo, prescrito: 2400, mide: .reloj)) { $0.posicion = .init(serie: .init(n: 2, de: 4)) }
        XCTAssertEqual(Vivo.avisoDeCierre(fuerza), "Serie 2 cerrada")
        let tempo = paso(.tempo, .trabajo, .init(tipo: .tiempo, prescrito: 2400, mide: .reloj)) { $0.posicion = .init(serie: .init(n: 1, de: 3)) }
        XCTAssertEqual(Vivo.avisoDeCierre(tempo), "Tempo 1 cerrado")
        let ficha = Vivo.FichaFuerza(ejercicio: "x", carga: .corporal, esfuerzo: nil)
        let a2 = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 6, mide: .atleta)) { $0.nombre = "Box Jump"; $0.posicion = .init(serie: .init(n: 1, de: 4), slot: "A2"); $0.fuerza = ficha }
        XCTAssertEqual(Vivo.avisoDeCierre(a2), "A2 · serie 1 hecha")
        let bbj = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 80, mide: .atleta)) { $0.nombre = "Burpee Broad Jump" }
        XCTAssertEqual(Vivo.avisoDeCierre(bbj), "Estación hecha")
        let ergo = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 250, mide: .ergo)) { $0.posicion = .init(serie: .init(n: 3, de: 8)) }
        XCTAssertEqual(Vivo.avisoDeCierre(ergo), "Serie 3 cerrada")
    }

    // MARK: - La voz sabe de cada familia

    func testLaVoz() {
        let ficha = Vivo.FichaFuerza(ejercicio: "bs", carga: .rm(pctMin: 65, pctMax: 70, rmKg: 186.5), esfuerzo: .init(eje: .rir, min: 3, max: 3))
        let bs = paso(.fuerza, .trabajo, .init(tipo: .reps, prescrito: 8, mide: .atleta)) { $0.nombre = "Back Squat"; $0.posicion = .init(serie: .init(n: 2, de: 4), slot: "A1"); $0.fuerza = ficha }
        XCTAssertEqual(Vivo.vozInicio(bs), "A1, Back Squat. Serie 2 de 4: 8 repeticiones con 121 a 131 kilos, RIR 3.")
        XCTAssertEqual(Vivo.vozInicio(bs, kg: 125), "A1, Back Squat. Serie 2 de 4: 8 repeticiones con 125 kilos, RIR 3.")
        let bench = Vivo.Tarea(nombre: "Bench Press", dosis: .init(tipo: .reps, prescrito: 6, mide: .atleta), carga: .init(kg: 60), mide: .atleta)
        let emom = paso(.emom, .trabajo, .init(tipo: .tiempo, prescrito: 60, mide: .reloj)) { $0.posicion = .init(serie: .init(n: 3, de: 12)); $0.wod = .emom(tarea: bench, ciclo: [bench], ventanas: 12, ventanaS: 60) }
        XCTAssertEqual(Vivo.vozInicio(emom), "3 de 12. 6 Bench Press, 60 kilos.")
        let ski = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 250, mide: .ergo)) { $0.nombre = "SkiErg"; $0.objetivos = [self.split(125)]; $0.posicion = .init(serie: .init(n: 4, de: 8)) }
        XCTAssertEqual(Vivo.vozInicio(ski), "SkiErg, 4 de 8. Doscientos cincuenta metros a 2:05 el quinientos.")
        let tramo = paso(.ergo, .trabajo, .init(tipo: .tiempo, prescrito: 60, mide: .ergo)) { $0.nombre = "Row"; $0.objetivos = [.init(eje: .zona, min: 3, max: 3, papel: .principal)]; $0.posicion = .init(tramo: .init(n: 2, de: 3)) }
        XCTAssertEqual(Vivo.vozFinSerie(tramo, .init(n: 2, clase: .tramo, segundos: 60, metros: 260, ritmo: 230, ppm: 156, veredicto: .dentro, eje: .zona)), "Tramo 2: dentro.")
        let colocate = paso(.fuerza, .transicion, .init(tipo: .tiempo, prescrito: 5, mide: .reloj))
        var iso = bs; iso.nombre = "Isometría en puente de glúteo"
        XCTAssertEqual(Vivo.vozTransicion(colocate, siguiente: iso), "Colócate: isometría en puente de glúteo.")
        XCTAssertEqual(Vivo.enLetras(3950), "tres mil novecientos cincuenta")
    }

    func testUnaSolaNotacionDelObjetivo() {
        XCTAssertEqual(Vivo.textoObjetivo(.init(eje: .ritmo, min: 225, max: 235, papel: .principal)), "a 3:45–3:55")
        XCTAssertEqual(Vivo.textoObjetivo(.init(eje: .zona, min: 2, max: 2, papel: .principal)), "a Z2")
        XCTAssertEqual(Vivo.textoObjetivo(.init(eje: .rpe, min: 7, max: 7, papel: .principal)), "RPE 7")
        XCTAssertEqual(Vivo.textoObjetivo(.init(eje: .ppm, min: nil, max: 142, papel: .techo)), "máx 142\u{00A0}ppm")
        XCTAssertEqual(Vivo.textoObjetivo(.init(eje: .inclinacion, min: 1, max: 1, papel: .secundario)), "al 1\u{00A0}%")
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 225, max: 235, papel: .principal)]; $0.posicion = .init(serie: .init(n: 1, de: 6)) }
        let rec = paso(.recuperacion, .recuperacion, .init(tipo: .tiempo, prescrito: 90, mide: .reloj)) { $0.modoRecupera = .trote }
        var s2 = serie; s2.id = "s2"; s2.posicion = .init(serie: .init(n: 2, de: 6))
        let brief = Vivo.lineaBrief(Vivo.filasDePasos([serie, rec, s2])[0])
        XCTAssertEqual(brief.linea, "2 × 1000\u{00A0}m a 3:45–3:55")
        XCTAssertEqual(Vivo.hoyDe([serie, rec, s2])?.sub, "a 3:45–3:55 · r 90″")
    }

    func testLasPiezasQueSubieron() {
        let pull = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 25, mide: .atleta)) { $0.nombre = "Sled Pull"; $0.carga = .init(kg: 135) }
        XCTAssertEqual(Vivo.textoPasoCorto(pull), "Sled Pull · 25\u{00A0}m · 135\u{00A0}kg")
        let sled = paso(.estacion, .trabajo, .init(tipo: .distancia, prescrito: 50, mide: .atleta))
        XCTAssertEqual(Vivo.duracionEstimada(sled), 60)
        let run = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.objetivos = [.init(eje: .ritmo, min: 225, max: 235, papel: .principal)] }
        XCTAssertEqual(Vivo.duracionEstimada(run), 230)
        XCTAssertEqual(Vivo.girarDial(.init(rondas: 7, reps: nil), 1, porRonda: 30), .init(rondas: 7, reps: 1))
        XCTAssertEqual(Vivo.girarDial(.init(rondas: 7, reps: 29), 1, porRonda: 30), .init(rondas: 8, reps: 0))
        XCTAssertEqual(Vivo.girarDial(.init(rondas: 8, reps: 0), -1, porRonda: 30), .init(rondas: 7, reps: 29))
    }

    // MARK: - El héroe en el lienzo del iPhone

    func testElHeroeCabeEnElIphone() {
        let iphone = Vivo.EscalaHeroe(min: 72, max: 176, peso: 600, caja: 0.84)
        let t = Vivo.tallaHeroe("3:52", unidad: "/km", ancho: 358, altoMax: 200, escala: iphone)
        XCTAssertGreaterThan(t.cuerpo, Vivo.escalaMuneca.max)
        XCTAssertLessThanOrEqual(t.cuerpo, iphone.max)
        XCTAssertLessThanOrEqual(t.ancho, 358)
        let largo = Vivo.tallaHeroe("10:59:59", unidad: nil, ancho: 358, altoMax: 200, escala: iphone)
        XCTAssertLessThanOrEqual(largo.ancho, 358)
        XCTAssertGreaterThanOrEqual(largo.cuerpo, iphone.min - 1)
        XCTAssertLessThanOrEqual(Vivo.tallaHeroe("3:52", unidad: "/km", ancho: 186).cuerpo, Vivo.escalaMuneca.max)
        for (texto, unidad) in [("3:52", "/km"), ("10:59:59", nil), ("8 × 127,5", "kg"), ("1000", "m"), ("2:04", "/1000")] as [(String, String?)] {
            let x = Vivo.tallaHeroe(texto, unidad: unidad, ancho: 350, altoMax: 196 - 22 - 16, escala: iphone)
            XCTAssertLessThanOrEqual(x.ancho, 350, texto)
            XCTAssertGreaterThanOrEqual(x.cuerpo, 56, texto)
        }
    }

    // MARK: - Los enlaces y el vocabulario (kit-iphone-vivo.test.ts)

    func testLosEnlacesSeDerivanDeLasLecturas() {
        let movil = Vivo.Dispositivos(reloj: .sin, maquina: nil, pulsometro: .banda)
        let ski = paso(.ergo, .trabajo, .init(tipo: .distancia, prescrito: 250, mide: .ergo)) { $0.nombre = "SkiErg"; $0.maquina = .init(tipo: .ski) }
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps))
        var con = movil; con.maquina = .ski
        let ok = Vivo.enlacesDe(con, ski, lect { $0.split500 = 125 }).first { $0.clave == .maquina }!
        XCTAssertEqual(ok.texto, "Ski"); XCTAssertEqual(ok.estado, .ok); XCTAssertNil(ok.nota)
        let perdida = Vivo.enlacesDe(con, ski, lect { $0.viejos = [.split500, .hecho] }).first { $0.clave == .maquina }!
        XCTAssertEqual(perdida.texto, "Ski · sin señal"); XCTAssertEqual(perdida.nota, "sin señal del ski · toca para reconectar")
        let sin = Vivo.enlacesDe(movil, ski, lect()).first { $0.clave == .maquina }!
        XCTAssertEqual(sin.texto, "Conectar el ski"); XCTAssertEqual(sin.estado, .apagado); XCTAssertEqual(sin.nota, "sin el ski · lo dices tú")
        XCTAssertTrue(Vivo.usaGps(serie))
        var cinta = serie; cinta.entorno = .cinta
        XCTAssertFalse(Vivo.usaGps(cinta))
        XCTAssertEqual(Vivo.enlacesDe(movil, serie, lect { $0.gps = .buscando }).first { $0.clave == .gps }?.nota, "GPS · buscando señal")
        let chips = Vivo.enlacesDe(.init(reloj: .motor, maquina: .ski, pulsometro: .reloj), ski, lect { $0.ppm = nil; $0.viejos = [.split500] })
        XCTAssertEqual(chips.map(\.clave), [.reloj, .maquina, .pulso])
        XCTAssertEqual(chips[2].estado, .buscando)
        XCTAssertEqual(Vivo.notaEnlace(chips), "sin señal del ski · toca para reconectar")
    }

    func testElVocabularioCerrado() {
        XCTAssertEqual(Vivo.ClavePrimaria.serieHecha.texto, "Serie hecha")
        XCTAssertEqual(Vivo.ClavePrimaria.rondaHecha.texto, "+1 ronda")
        XCTAssertFalse(Vivo.ClavePrimaria.siguientePaso.esPrimaria)
        XCTAssertFalse(Vivo.ClavePrimaria.vuelta.esPrimaria)
        let textos = Vivo.ClavePrimaria.allCases.map(\.texto)
        XCTAssertEqual(Set(textos).count, textos.count)
        XCTAssertEqual(Vivo.claveDesdeEtiqueta("empezar ya"), .empezarYa)
        XCTAssertEqual(Vivo.claveDesdeEtiqueta("Sled Push hecho"), .hecho)
        XCTAssertEqual(Vivo.claveDesdeEtiqueta("lo que sea"), .siguientePaso)
        let serie = paso(.series, .trabajo, .init(tipo: .distancia, prescrito: 1000, mide: .gps)) { $0.posicion = .init(serie: .init(n: 3, de: 6)) }
        let r = Vivo.resumenParaTerminar(serie, sesionM: 5581, sesionErgoM: 1250, sesionT: 1627)
        XCTAssertEqual(r.titulo, "Serie 3/6 · 1000\u{00A0}m")
        XCTAssertEqual(r.lineas, ["5,58 km corridos", "1,25 km de máquina", "27:07 de sesión"])
        let util: Double = 390 - 40 - 66 - 16
        XCTAssertEqual(VivoCabeceraMedida.partesQueCaben(["Ronda 3/3", "Estación 1/3"], ancho: util), ["Ronda 3/3", "Estación 1/3"])
        let largo = ["Tanda 2/3", "Serie 4/6", "Ronda 2/5", "1000 m"]
        let caben = VivoCabeceraMedida.partesQueCaben(largo, ancho: util)
        XCTAssertLessThan(caben.count, largo.count)
        XCTAssertEqual(caben, Array(largo.prefix(caben.count)))
    }
}
