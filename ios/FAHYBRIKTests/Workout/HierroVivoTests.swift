import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL HIERRO EN VIVO (11-ago-2026) — el porte del hierro al lenguaje del §10.
//
// Los casos son los tres reales del corpus, verbatim de `prescription_json`:
//
//   · plantilla 503 · segmento 2714 — Back Squat 4×10 a 82,5 kg, descanso 1:30.
//   · bloque 392 «Fuerza inferior PESADA» — 6-6-4-4-3 al 75-85 %, 2:30. Es el que
//     rompe el modelo de una-medida-por-prescripción: cada serie tiene SU medida y
//     no hay ni un kilo escrito en ningún sitio.
//   · bloque 501 «6r Pull ups» — DOCE series (10-10-8-8-6-4-12-10-10-8-8-6), sin
//     carga y sin descanso. El ejercicio más largo de la base.
//
// Lo que se fija aquí es lo que no se puede comprobar mirando: que un porcentaje
// no acabe nunca escrito en kilos, que el riel decida su ventana con aritmética y
// no con una constante de gusto, que la cascada reserve contra el hueco REAL y que
// la cara PINTADA quepa en su cota.
final class HierroVivoTests: XCTestCase {

    /// El canvas del iPhone 17 Pro (puntos lógicos), el móvil de desarrollo.
    private static let lienzo = CGSize(width: 402, height: 874)
    /// El ancho que el marco deja dentro de su relleno.
    private static let anchoUtil: CGFloat = 402 - 2 * BandaViva.hueco
    /// EL HUECO DE APOYOS, derivado del reparto del marco igual que lo deriva el
    /// doble: el lienzo útil menos cromo, contexto, banda del sujeto y acción con
    /// sus huecos y su relleno. Es la cota contra la que se mide la cara pintada.
    private static var huecoApoyos: CGFloat {
        let util = lienzo.height - 59 - 34   // safe areas del 17 Pro
        return util - (BandaViva.cromo + BandaViva.contexto + BandaViva.sujeto
                       + BandaViva.accion + 6 * BandaViva.hueco)
    }

    // MARK: - La carga, en sus cuatro escrituras (el eje entero del modelo)

    /// UN PORCENTAJE NO ES UN PESO, y jamás se convierte: la app no tiene el 1RM
    /// medido de este atleta para este ejercicio, así que resolver «75 % de tu
    /// máximo» sería mandarlo a levantar un peso que nadie ha pesado (§7).
    ///
    /// Y tampoco entra en la cifra: «6 × 75-85» se lee como kilos. Baja al segundo
    /// peldaño con su unidad ENTERA, que es la única forma de que no mienta.
    func testElPorcentajeNoBajaNuncaAKilos() {
        let d = Formato.dosisDeSerie(reps: 6, carga: .porcentaje(min: 75, max: 85))
        XCTAssertEqual(d?.sujeto?.cifra, "6")
        XCTAssertEqual(d?.sujeto?.unidad, Vocab.reps)
        XCTAssertEqual(d?.segundo?.cifra, "75-85")
        XCTAssertEqual(d?.segundo?.unidad, Vocab.porcentajeDeTuMaximo)
        // Ni «kg» ni un número de kilos inventado en ninguna parte de la dosis.
        let escrito = [d?.sujeto?.linea, d?.segundo?.linea, d?.pieDeCarga]
            .compactMap { $0 }.joined(separator: " ")
        XCTAssertFalse(escrito.contains("kg"), "un porcentaje escrito en kilos es un peso inventado: \(escrito)")
        XCTAssertTrue(escrito.contains("75-85"))
    }

    /// Un techo que no supera al suelo NO abre banda y no se escribe como si lo
    /// hiciera: «80 %», no «80-80 %».
    func testUnTechoQueNoSuperaAlSueloNoAbreBanda() {
        XCTAssertEqual(Formato.dosisDeSerie(reps: 5, carga: .porcentaje(min: 80, max: nil))?.segundo?.cifra, "80")
        XCTAssertEqual(Formato.dosisDeSerie(reps: 5, carga: .porcentaje(min: 80, max: 80))?.segundo?.cifra, "80")
        XCTAssertEqual(Formato.dosisDeSerie(reps: 5, carga: .porcentaje(min: 80, max: 70))?.segundo?.cifra, "80")
    }

    /// «10 × 82,5» + «kg» es UNA cosa y así se lee: repeticiones y luego carga, que
    /// es como se piensa una serie. No se parte en dos peldaños — eso invertiría la
    /// jerarquía y de que quepa se encarga el presupuesto de ancho del numeral.
    func testLosKilosSonUnaSolaCifraConLasRepeticiones() {
        let d = Formato.dosisDeSerie(reps: 10, carga: .kg(82.5))
        XCTAssertEqual(d?.sujeto?.cifra, "10 \(Formato.signoPor) 82,5")
        XCTAssertEqual(d?.sujeto?.unidad, "kg")
        XCTAssertNil(d?.segundo, "los kilos no bajan de peldaño: caben en la cifra")
        XCTAssertNil(d?.pieDeCarga)
    }

    /// UNO POR MANO es la cuarta escritura, y sale del MODELO (`Target.kg` trae
    /// `implement_count`), no del ejemplo que se tenía delante. Baja al segundo
    /// peldaño porque «10 × 2×32» son dos signos de multiplicar con dos
    /// significados distintos en la misma cifra, y así no se lee.
    func testUnoPorManoBajaAlSegundoPeldano() {
        let d = Formato.dosisDeSerie(reps: 10, carga: .kg(32, implementos: 2))
        XCTAssertEqual(d?.sujeto?.cifra, "10")
        XCTAssertEqual(d?.segundo?.cifra, "2\(Formato.signoPor)32")
        XCTAssertEqual(d?.segundo?.unidad, "kg")
        // Un solo implemento no pinta multiplicador y vuelve a ser una sola cifra.
        let uno = Formato.dosisDeSerie(reps: 10, carga: .kg(32, implementos: 1))
        XCTAssertEqual(uno?.sujeto?.cifra, "10 \(Formato.signoPor) 32")
        XCTAssertNil(uno?.segundo)
    }

    /// El peso corporal no es un número: no ocupa peldaño y se dice abajo.
    func testElPesoCorporalNoOcupaPeldano() {
        let d = Formato.dosisDeSerie(reps: 12, carga: .corporal)
        XCTAssertEqual(d?.sujeto?.cifra, "12")
        XCTAssertNil(d?.segundo)
        XCTAssertEqual(d?.pieDeCarga, Vocab.pesoCorporal)
    }

    /// LAS DEGRADACIONES, que son del modelo y no del layout: sin carga la dosis son
    /// las repeticiones; sin repeticiones —el `Reverse Lunge` real del coach llega
    /// con 30 kg y ninguna— la carga sola; sin ninguna de las dos, NADA (§7: no se
    /// finge un cero, y entonces el sujeto pasa a ser el nombre del ejercicio).
    func testLasDegradacionesNoInventanNiUnCero() {
        XCTAssertEqual(Formato.dosisDeSerie(reps: 8, carga: nil)?.sujeto?.cifra, "8")
        XCTAssertEqual(Formato.dosisDeSerie(reps: nil, carga: .kg(30))?.sujeto?.cifra, "30")
        XCTAssertNil(Formato.dosisDeSerie(reps: nil, carga: nil))
        // Peso corporal sin repeticiones: no hay cifra, pero la carga SÍ se sabe y
        // se dice — el nombre manda arriba y «peso corporal» queda debajo.
        let corporal = Formato.dosisDeSerie(reps: nil, carga: .corporal)
        XCTAssertNil(corporal?.sujeto)
        XCTAssertEqual(corporal?.pieDeCarga, Vocab.pesoCorporal)
    }

    /// La BANDA de repeticiones se enseña entera: enseñar solo el suelo le esconde
    /// al atleta media prescripción.
    func testLaBandaDeRepeticionesSeEnsenaEntera() {
        XCTAssertEqual(Formato.dosisDeSerie(reps: 12, repsMax: 15, carga: .kg(60))?.sujeto?.cifra,
                       "12-15 \(Formato.signoPor) 60")
        XCTAssertEqual(Formato.dosisDeSerie(reps: 12, repsMax: 12, carga: nil)?.sujeto?.cifra, "12")
    }

    /// El puente desde el cable: `prescribedLoadKg` contesta «¿cuántos kilos?» y por
    /// eso da nil en un 75-85 % —correcto para el registro y falso para la pantalla—,
    /// mientras `prescribedCarga` devuelve la forma en que el coach lo escribió.
    func testElPuenteDesdeElCableTraeLasTresFormas() {
        func set(_ t: Target) -> PrescriptionSet {
            PrescriptionSet(measure: .reps(5), target: t, modality: nil, restS: nil, tempo: nil, note: nil)
        }
        XCTAssertEqual(set(.kg(value: 82.5, min: nil, max: nil)).prescribedCarga, .kg(82.5, implementos: nil))
        XCTAssertEqual(set(.percentRM(value: nil, min: 75, max: 85)).prescribedCarga,
                       .porcentaje(min: 75, max: 85))
        XCTAssertEqual(set(.bodyweight).prescribedCarga, .corporal)
        XCTAssertNil(set(.percentRM(value: nil, min: 75, max: 85)).prescribedLoadKg,
                     "un porcentaje no tiene kilos que apuntar")
        // Lo que NO es carga no se cuela como carga: RPE, RIR y ppm viven en su eje.
        XCTAssertNil(set(.rir(value: 2, min: nil, max: nil)).prescribedCarga)
        XCTAssertNil(set(.rpe(value: 8, min: nil, max: nil)).prescribedCarga)
        XCTAssertNil(set(.hrBpm(value: 150, min: nil, max: nil)).prescribedCarga)
    }

    // MARK: - CERO GUIONES LARGOS, verificado por punto de código

    /// LA REGLA DURA: en el texto que ve el usuario no hay guiones largos (U+2014).
    /// Delatan que lo escribió una IA, y se comprueba por CODE POINT y no a ojo —
    /// un em dash y un guion normal se distinguen en la fuente del editor y no en
    /// una revisión rápida.
    ///
    /// Se comprueba sobre TODO lo que esta pantalla emite: las cuatro escrituras de
    /// carga, el vocabulario que usa y la frase de la velocidad. El guion que sí
    /// aparece es el normal (U+002D), el de la banda de reps y de la banda de %RM.
    func testNingunaCadenaDelHierroLlevaGuionLargo() {
        let emDash: Character = "\u{2014}"
        let enDash: Character = "\u{2013}"

        var emitidas: [String] = [
            Vocab.velocidad, Vocab.pesoCorporal, Vocab.porcentajeDeTuMaximo,
            Vocab.serie, Vocab.descanso, Vocab.pausa, Vocab.fc, Vocab.ppm, Vocab.reps,
            Vocab.rirTraducido(0), Vocab.rirTraducido(2),
        ]
        let cargas: [Formato.CargaDeSerie?] = [
            .kg(82.5), .kg(32, implementos: 2), .porcentaje(min: 75, max: 85),
            .porcentaje(min: 80, max: nil), .corporal, nil,
        ]
        for carga in cargas {
            for (reps, techo) in [(10, nil), (12, 15), (nil, nil)] as [(Int?, Int?)] {
                guard let d = Formato.dosisDeSerie(reps: reps, repsMax: techo, carga: carga) else { continue }
                emitidas += [d.sujeto?.linea, d.segundo?.linea, d.pieDeCarga].compactMap { $0 }
            }
        }
        emitidas.append(Formato.rango(75, 85))
        // La frase de la lectura de velocidad, con su banda real.
        let r = lectura(0.38, confianza: 0.74, perdida: 31)
        emitidas.append("Tu última repetición fue \(r.band.label.lowercased()): "
                        + "\(r.mpsText) m/s, un 31 % menos que la primera de la serie.")

        for texto in emitidas {
            XCTAssertFalse(texto.contains(emDash),
                           "guion largo (U+2014) en «\(texto)»: lo ve el atleta y delata IA")
            XCTAssertFalse(texto.contains(enDash),
                           "guion medio (U+2013) en «\(texto)»: el rango de esta pantalla usa el normal")
        }
        // Y el positivo, para que el test no pase por no comprobar nada: la banda de
        // %RM y la de reps SÍ llevan guion, y es el normal.
        XCTAssertTrue(Formato.rango(75, 85).contains("\u{002D}"))
        XCTAssertEqual(Formato.dosisDeSerie(reps: 12, repsMax: 15, carga: nil)?.sujeto?.cifra, "12-15")
    }

    // MARK: - La ventana del riel — aritmética, no una constante de gusto

    /// El umbral no se elige: es el primero que no cabe a lo ancho del marco REAL.
    /// Con el lienzo del 17 Pro caben cuatro peldaños con su dosis, así que la
    /// ventana empieza en la quinta serie — que es el 49 % del corpus (37 de 75).
    func testElUmbralDeLaVentanaSaleDelAnchoDelMarco() {
        XCTAssertEqual(VentanaDeSeries.caben(ancho: Self.anchoUtil), 4,
                       "con \(Int(Self.anchoUtil)) pt caben cuatro peldaños de \(Int(VentanaDeSeries.anchoPeldanoPt))")
        // Nunca por debajo de la ventana: con tres no hay nada que decidir.
        XCTAssertEqual(VentanaDeSeries.caben(ancho: 100), VentanaDeSeries.ventana)
        XCTAssertEqual(VentanaDeSeries.caben(ancho: 0), VentanaDeSeries.ventana)
    }

    /// Con cuatro series se pintan las CUATRO: es el caso de la captura y no hay
    /// nada que colapsar.
    func testConCuatroSeriesSePintanLasCuatro() {
        XCTAssertEqual(VentanaDeSeries.visibles(total: 4, activa: 1, caben: 4), [0, 1, 2, 3])
    }

    /// Desde la quinta es VENTANA de tres pegada al cursor: la cerrada de antes, la
    /// que haces, la que viene. Con esas tres, las dos preguntas del que está
    /// levantando («cómo fue la última», «cambia la siguiente») siguen contestadas.
    func testDesdeLaQuintaElRielEsVentanaDeTres() {
        // La pirámide real 6-6-4-4-3, con el atleta en la tercera.
        XCTAssertEqual(VentanaDeSeries.visibles(total: 5, activa: 2, caben: 4), [1, 2, 3])
    }

    /// En los EXTREMOS la ventana se DESPLAZA en vez de encogerse, o la primera y la
    /// última serie tendrían dos peldaños en vez de tres.
    func testEnLosExtremosLaVentanaSeDesplazaNoSeEncoge() {
        // Las doce series del bloque 501, al principio y al final.
        XCTAssertEqual(VentanaDeSeries.visibles(total: 12, activa: 0, caben: 4), [0, 1, 2])
        XCTAssertEqual(VentanaDeSeries.visibles(total: 12, activa: 11, caben: 4), [9, 10, 11])
        XCTAssertEqual(VentanaDeSeries.visibles(total: 12, activa: 5, caben: 4), [4, 5, 6])
        // Y con menos series que la ventana, todas — sin repetir ni inventar huecos.
        XCTAssertEqual(VentanaDeSeries.visibles(total: 2, activa: 0, caben: 4), [0, 1])
        XCTAssertEqual(VentanaDeSeries.visibles(total: 0, activa: 0, caben: 4), [])
    }

    // MARK: - La cascada de apoyos — se reserva contra el hueco, no contra un frame

    func testLaCascadaReservaEnOrdenYLaPrimeraNoPagaHueco() {
        var p = PresupuestoApoyos(alto: 100, ancho: 378, hueco: 8)
        XCTAssertTrue(p.cabe(60), "la primera no paga hueco: 60 en 100")
        XCTAssertEqual(p.gastado, 60)
        XCTAssertTrue(p.cabe(32), "60 + 8 de hueco + 32 = 100, justo")
        XCTAssertFalse(p.cabe(1), "el hueco está lleno")
        XCTAssertEqual(p.gastado, 100, "lo que no cabe no gasta")
    }

    /// LO OBLIGATORIO NO COMPITE: una función (el riel, que es la única puerta al
    /// ajuste de una serie) entra aunque el hueco no dé, igual que `ViewThatFits`
    /// pinta su último candidato quepa o no. Y se apunta, para que las de detrás
    /// sepan la verdad del hueco en vez de repartirse un sitio que ya no existe.
    func testLoObligatorioEntraAunqueNoQuepaYLasDeDetrasSeEnteran() {
        var p = PresupuestoApoyos(alto: 40, ancho: 378, hueco: 8)
        XCTAssertTrue(p.cabe(62, obligatorio: true), "una función no se recorta")
        XCTAssertEqual(p.gastado, 62)
        XCTAssertLessThan(p.libre, 0)
        XCTAssertFalse(p.cabe(10), "con el hueco ya desbordado no entra nada opcional")
    }

    // MARK: - La velocidad — dos ausencias que no son la misma

    /// SIN SENSOR la celda NO EXISTE: prometer una medida que no va a llegar es la
    /// otra forma de mentir (§7).
    func testSinSensorLaCeldaDeVelocidadNoExiste() {
        XCTAssertEqual(VelocidadDeLaSerie.resolver(vivo: nil, cerrada: nil, sensorPuesto: false),
                       .sinSensor)
        // Ni siquiera con una lectura en la mano: si el sensor no está puesto, esa
        // lectura no es de este entreno.
        XCTAssertEqual(VelocidadDeLaSerie.resolver(vivo: lectura(0.49, confianza: 0.78),
                                                   cerrada: nil, sensorPuesto: false),
                       .sinSensor)
    }

    /// CON SENSOR Y POCA CONFIANZA la celda existe y dice que no se fía, SIN cifra:
    /// un «rojo con aplomo» sobre una medida que no se sostiene es peor que no medir.
    func testConSensorYPocaConfianzaLaCeldaLoDiceSinCifra() {
        // El caso del fondo lastrado: el estimador lee peor un dip que una sentadilla.
        let dudosa = lectura(0.34, confianza: 0.31)
        XCTAssertEqual(VelocidadDeLaSerie.resolver(vivo: nil, cerrada: dudosa, sensorPuesto: true),
                       .pocaConfianza)
        XCTAssertNil(VelocidadDeLaSerie.resolver(vivo: nil, cerrada: dudosa, sensorPuesto: true).reading,
                     "sin confianza no se pinta cifra")
        // Sensor puesto y todavía nada medido no es lo mismo que no fiarse.
        XCTAssertEqual(VelocidadDeLaSerie.resolver(vivo: nil, cerrada: nil, sensorPuesto: true),
                       .aunNo)
    }

    /// La lectura VIVA manda sobre la de la serie cerrada: una lectura de hace tres
    /// minutos no describe la barra de ahora.
    func testLaLecturaVivaMandaSobreLaDeLaSerieCerrada() {
        let viva = lectura(0.62, confianza: 0.80)
        let vieja = lectura(0.38, confianza: 0.74)
        let r = VelocidadDeLaSerie.resolver(vivo: viva, cerrada: vieja, sensorPuesto: true)
        XCTAssertEqual(r.reading?.metersPerSecond, 0.62)
        // Y descansando, cuando la serie en vuelo ya no existe, se lee la cerrada.
        let descansando = VelocidadDeLaSerie.resolver(vivo: nil, cerrada: vieja, sensorPuesto: true)
        XCTAssertEqual(descansando.reading?.metersPerSecond, 0.38)
    }

    /// Lo que el motor estampó al cerrar la serie (`confirmSet` → `stampVelocity`)
    /// se lee tal cual, con su banda resuelta por el dominio compartido.
    func testLaLecturaDeUnaSerieCerradaSaleDeLoEstampado() {
        var rec = SetRecord(setIndex: 1, repsPrescribed: 10, repsActual: nil,
                            loadPrescribedKg: 82.5, loadActualKg: nil, rpe: nil, rir: nil,
                            status: "done", confirmed: true, tempo: nil, restS: 90)
        rec.meanVelocityFirstMs = 0.55
        rec.meanVelocityLastMs = 0.38
        rec.velocityLossPct = 31
        rec.velocityConfidence = 0.74
        let r = VelocidadDeLaSerie.deSerieCerrada(rec)
        XCTAssertEqual(r?.metersPerSecond, 0.38)
        // 0,38 m/s cae por debajo del corte de «media» (0,40) → LENTA. Es justo lo
        // que cuenta el escenario del doble: la serie 2 salió lenta, y por eso el
        // atleta baja de 82,5 a 77,5 en la 3.
        XCTAssertEqual(r?.band, .orange)
        XCTAssertEqual(r?.band.label.lowercased(), "lenta")
        XCTAssertEqual(r?.lossPct, 31)
        // Una serie sin medida no inventa una lectura de cero.
        var sin = rec
        sin.meanVelocityLastMs = nil
        XCTAssertNil(VelocidadDeLaSerie.deSerieCerrada(sin))
    }

    private func lectura(_ ms: Double, confianza: Double, perdida: Double? = nil) -> VelocityLiveReading {
        VelocityLiveReading(metersPerSecond: ms,
                            band: VelocityBand.from(velocityMs: ms, confidence: confianza),
                            lossPct: perdida,
                            confidence: confianza)
    }

    // MARK: - Fixtures: los tres ejercicios reales del corpus

    private func sesionDeFuerza(series: [Int],
                                carga: Target?,
                                descansoS: Int? = 90,
                                cerradas: Int = 0,
                                bloque: String = "Fuerza inferior pesada",
                                titulo: String = "Back Squat") -> WorkoutSession {
        let sets = series.enumerated().map { i, reps in
            PrescriptionSet(measure: .reps(reps), target: carga, modality: nil,
                            // La ÚLTIMA serie no lleva descanso: no se descansa
                            // después de la última, y la base lo escribe así.
                            restS: i == series.count - 1 ? nil : descansoS,
                            tempo: nil, note: nil)
        }
        let p = Prescription(scheme: .sets, modality: nil, sets: sets,
                             rounds: nil, workS: nil, restS: nil, totalS: nil,
                             target: .rir(value: 2, min: nil, max: nil),
                             note: nil, start: nil, increment: nil)
        let tramo = WorkoutSegment(order: 1, title: titulo, kind: .strength,
                                   targetReps: series.first, loadKg: nil,
                                   blockTitle: bloque, blockPosition: 1,
                                   prescription: p)
        let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                               estimatedDurationSeconds: 1200, blockContext: bloque,
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan, hrZones: nil)
        s.primeSetsIfNeeded()
        for i in 0..<cerradas { s.confirmSet(i) }
        return s
    }

    /// `template_segments` 2714 · plantilla 503: 4×10 a 82,5 kg con 1:30.
    private func squat4x10(cerradas: Int = 1) -> WorkoutSession {
        sesionDeFuerza(series: [10, 10, 10, 10],
                       carga: .kg(value: 82.5, min: nil, max: nil),
                       cerradas: cerradas)
    }

    /// `blocks` 392: 6-6-4-4-3 al 75-85 % con 2:30. Ni un kilo escrito.
    private func squatPiramide(cerradas: Int = 2) -> WorkoutSession {
        sesionDeFuerza(series: [6, 6, 4, 4, 3],
                       carga: .percentRM(value: nil, min: 75, max: 85),
                       descansoS: 150, cerradas: cerradas)
    }

    /// `blocks` 501: doce series, sin carga y sin descanso.
    private func dip12(cerradas: Int = 6) -> WorkoutSession {
        sesionDeFuerza(series: [10, 10, 8, 8, 6, 4, 12, 10, 10, 8, 8, 6],
                       carga: nil, descansoS: nil, cerradas: cerradas,
                       bloque: "Fuerza superior", titulo: "Weighted dip")
    }

    // MARK: - LA CARA QUE SE PINTA CABE EN SU COTA

    @MainActor
    private func mideApoyos(_ s: WorkoutSession) -> CGFloat {
        let hud = FuerzaVivoView(session: s, accionTitulo: "HECHO", alTocarAccion: {}) { EmptyView() }
        let presupuesto = PresupuestoApoyos(alto: Self.huecoApoyos, ancho: Self.anchoUtil)
        let vista = VStack(spacing: Theme.Spacing.s) { hud.apoyos(presupuesto) }
        return UIHostingController(rootView: AnyView(vista.environment(\.colorScheme, .dark)))
            .sizeThatFits(in: CGSize(width: Self.anchoUtil, height: .greatestFiniteMagnitude)).height
    }

    /// LA CARA DE TRABAJO: riel + fila + el chip de lo siguiente. Se mide con una
    /// serie CERRADA porque es el estado que de verdad se pinta —la media, el chip,
    /// la marca de la cerrada existen— y medir el estado virgen fue lo que dejó al
    /// contador de rondas derramándose 538 pt en un hueco de 393.
    @MainActor
    func testLaCaraDeTrabajoCabeEnElHuecoDeApoyos() {
        let alto = mideApoyos(squat4x10())
        XCTAssertLessThanOrEqual(alto, Self.huecoApoyos + 1,
            "los apoyos piden \(Int(alto)) pt y el marco deja \(Int(Self.huecoApoyos)): "
            + "lo que no cabe no se recorta, EMPUJA la franja de acción fuera")
    }

    /// LA CARA DE DESCANSO: la misma, más la frase de la pérdida de velocidad. Es la
    /// que más piezas tiene a la vez, así que es la cota que manda.
    @MainActor
    func testLaCaraDeDescansoConLaFraseDeVelocidadCabe() {
        let s = squat4x10(cerradas: 0)
        s.primeSetsIfNeeded()
        // Se cierra la serie con velocidad estampada: `confirmSet` arranca el
        // descanso, así que este es el instante exacto de la cara de descanso.
        s.setRecords[0].meanVelocityFirstMs = 0.55
        s.setRecords[0].meanVelocityLastMs = 0.38
        s.setRecords[0].velocityLossPct = 31
        s.setRecords[0].velocityConfidence = 0.74
        s.confirmSet(0)
        XCTAssertGreaterThan(s.restRemainingSeconds, 0, "el motor abre el descanso al cerrar")
        let alto = mideApoyos(s)
        XCTAssertLessThanOrEqual(alto, Self.huecoApoyos + 1,
            "la cara de descanso pide \(Int(alto)) pt sobre \(Int(Self.huecoApoyos))")
    }

    /// LA PIRÁMIDE y las DOCE SERIES: el riel es ventana y paga su cabecera. El alto
    /// de la cara no puede depender del número de series — eso es lo que se fija.
    @MainActor
    func testLaCaraNoCreceConElNumeroDeSeries() {
        let cuatro = mideApoyos(squat4x10())
        let cinco = mideApoyos(squatPiramide())
        let doce = mideApoyos(dip12())
        XCTAssertLessThanOrEqual(cinco, Self.huecoApoyos + 1, "la pirámide pide \(Int(cinco)) pt")
        XCTAssertLessThanOrEqual(doce, Self.huecoApoyos + 1, "las doce piden \(Int(doce)) pt")
        // La ventana cuesta su cabecera y nada más: doce series no piden más alto
        // que cinco, porque las dos pintan tres peldaños.
        XCTAssertEqual(cinco, doce, accuracy: 1,
                       "cinco y doce series pintan la misma cara: tres peldaños y su cabecera")
        XCTAssertGreaterThan(cinco, cuatro,
                             "cinco series pagan la cabecera que cuatro no pagan")
    }

    /// Y LA PANTALLA ENTERA, con el hierro dentro de la puerta del bloque: lo que se
    /// salga por abajo es el botón que cierra la serie.
    @MainActor
    func testLaPantallaDelHierroCabeEnElMovil() {
        let s = squatPiramide()
        s.start()
        let host = UIHostingController(rootView:
            ActiveWorkoutView(session: s, onFinish: {}, onExit: {})
                .environment(\.colorScheme, .dark))
        host.view.frame = CGRect(origin: .zero, size: Self.lienzo)
        host.view.layoutIfNeeded()
        let alto = host.sizeThatFits(in: Self.lienzo).height
        XCTAssertLessThanOrEqual(alto, Self.lienzo.height + 1,
                                 "la pantalla pide \(Int(alto)) pt en un móvil de \(Int(Self.lienzo.height))")
        s.stop()
    }

    // MARK: - El reparto, contra huecos apretados

    /// EL RIEL NO SE RECORTA aunque el hueco venga de un cromo extremo (dobles), y
    /// lo que cae es lo de más abajo en la prioridad: el chip de lo siguiente
    /// primero, que es contexto que se puede mirar al acabar.
    @MainActor
    func testEnUnHuecoApretadoCaeLoSiguienteYElRielSeQueda() {
        let hud = FuerzaVivoView(session: squat4x10(), accionTitulo: "HECHO", alTocarAccion: {}) { EmptyView() }
        let holgado = hud.reparto(PresupuestoApoyos(alto: Self.huecoApoyos, ancho: Self.anchoUtil))
        XCTAssertTrue(holgado.riel)
        XCTAssertTrue(holgado.fila)

        // El cromo de dobles deja ~120 pt: no caben riel Y fila.
        let apretado = hud.reparto(PresupuestoApoyos(alto: 120, ancho: Self.anchoUtil))
        XCTAssertTrue(apretado.riel, "el riel es la única puerta al ajuste: no se recorta")
        XCTAssertFalse(apretado.siguiente, "lo siguiente es lo primero que cae")

        // Y en el peor hueco imaginable, el riel sigue estando.
        let suelo = hud.reparto(PresupuestoApoyos(alto: 20, ancho: Self.anchoUtil))
        XCTAssertTrue(suelo.riel)
        XCTAssertFalse(suelo.fila)
    }

    // MARK: - Las tres caras, renderizadas
    //
    // En el simulador no hay reloj, ni sensor, ni un entreno de verdad al que
    // entrar: estos renders son la única forma de VER las tres caras. Con
    // `FAHYBRIK_CAPTURAS=<dir>` escriben el PNG (mismo mecanismo que los renders del
    // histórico de salud); sin la variable solo comprueban que la cara se pinta.

    @MainActor
    private func lienzoCompleto(_ s: WorkoutSession) -> some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            Ambiente(zona: s.liveZone)
            FuerzaVivoView(session: s, accionTitulo: "HECHO", alTocarAccion: {}) {
                HStack {
                    Image(systemName: "xmark").foregroundStyle(Theme.Color.muted)
                    Text("‖").foregroundStyle(Theme.Color.muted)
                    Spacer()
                    MonoText(text: "BACK SQUAT", size: 11, color: Theme.Color.muted)
                }
            }
        }
        .environment(\.colorScheme, .dark)
    }

    /// LA CARA DE TRABAJO — la dosis manda, el reloj arriba, la velocidad abre la fila.
    @MainActor
    func testRenderCaraDeTrabajo() {
        let s = squat4x10()
        s.liveHRBpm = 142
        s.setRecords[1].meanVelocityLastMs = 0.49
        s.setRecords[1].velocityConfidence = 0.78
        XCTAssertNotNil(render(lienzoCompleto(s), nombre: "hierro-1-serie"))
    }

    /// LA CARA DE DESCANSO — tinta normal, barra drenando arriba, frase de la pérdida.
    @MainActor
    func testRenderCaraDeDescanso() {
        let s = squat4x10(cerradas: 0)
        s.liveHRBpm = 128
        s.setRecords[0].meanVelocityFirstMs = 0.55
        s.setRecords[0].meanVelocityLastMs = 0.38
        s.setRecords[0].velocityLossPct = 31
        s.setRecords[0].velocityConfidence = 0.74
        s.confirmSet(0)
        XCTAssertGreaterThan(s.restRemainingSeconds, 0)
        XCTAssertNotNil(render(lienzoCompleto(s), nombre: "hierro-2-descanso"))
    }

    /// EL EJERCICIO HECHO — con todas cerradas el sujeto es el NOMBRE, no un «SERIE
    /// 4 DE 4» que se lee como si quedara por hacer.
    @MainActor
    func testRenderEjercicioHecho() {
        let s = squat4x10(cerradas: 4)
        s.dismissRest()
        XCTAssertNil(s.pendingSetIndex)
        XCTAssertNotNil(render(lienzoCompleto(s), nombre: "hierro-4-hecho"))
    }

    /// LA PIRÁMIDE — cinco series desiguales, carga en %RM y el riel como ventana.
    @MainActor
    func testRenderPiramideConVentana() {
        let s = squatPiramide()
        s.liveHRBpm = 138
        XCTAssertNotNil(render(lienzoCompleto(s), nombre: "hierro-3-piramide"))
    }

    @discardableResult @MainActor
    private func render<V: View>(_ vista: V, nombre: String) -> UIImage? {
        let host = UIHostingController(rootView: vista)
        host.view.bounds = CGRect(origin: .zero, size: Self.lienzo)
        host.view.layoutIfNeeded()
        let imagen = UIGraphicsImageRenderer(size: host.view.bounds.size).image { _ in
            host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        if let dir = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"] {
            try? imagen.pngData()?.write(to: URL(fileURLWithPath: dir)
                .appendingPathComponent("\(nombre).png"))
        }
        return imagen
    }

    // MARK: - El motor, intacto

    /// El toque cierra la SERIE (no el ejercicio) y abre el descanso con el descanso
    /// de ESA serie. Y la última no abre ninguno: no se descansa después de la
    /// última, y la prescripción real lo escribe así.
    func testCerrarUnaSerieAbreSuDescansoYLaUltimaNoAbreNinguno() {
        let s = squat4x10(cerradas: 0)
        XCTAssertEqual(s.pendingSetIndex, 0)
        s.confirmSet(0)
        XCTAssertEqual(s.restRemainingSeconds, 90, accuracy: 0.5)
        XCTAssertEqual(s.pendingSetIndex, 1, "quedan tres series: el ejercicio sigue vivo")
        s.dismissRest()
        s.confirmSet(1); s.dismissRest()
        s.confirmSet(2); s.dismissRest()
        s.confirmSet(3)
        XCTAssertEqual(s.restRemainingSeconds, 0, "la última serie no lleva descanso")
        XCTAssertNil(s.pendingSetIndex, "todas cerradas")
    }

    /// AJUSTAR SIGUE SIENDO POSIBLE en cualquier serie, incluida una ya cerrada: es
    /// lo único que el motor sabe hacer de «deshacer» en el hierro, y un rediseño
    /// que quita una función y se llama mejora es lo que el deshacer de la cara por
    /// rondas tuvo prohibido.
    func testLaCargaAjustadaSeHeredaYLaCerradaConservaLaSuya() {
        let s = squat4x10(cerradas: 2)
        s.setSetLoadCascade(2, 77.5)
        XCTAssertEqual(s.setRecords[0].loadActualKg, 82.5, "la hecha conserva su peso real")
        XCTAssertEqual(s.setRecords[2].loadActualKg, 77.5)
        XCTAssertEqual(s.setRecords[3].loadActualKg, 77.5, "las que faltan lo heredan")
        XCTAssertEqual(s.setRecords[2].status, "scaled", "y se marca en ámbar en el riel")
    }
}
