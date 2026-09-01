import XCTest
@testable import FAHYBRIK

// LA GRÁFICA DE ZONAS, CONTADA — todo lo que esta pantalla puede equivocar.
//
// Espejo de `web/lib/zones/chart.spec.ts`: si las dos cuentas divergen, el coach
// marca un tramo sobre una forma y el atleta abre otra. Aquí se prueba la
// aritmética (los huecos, la pila, la rejilla, dónde cae un rango) sin levantar
// una vista, que es justo lo que la separa del dibujo.
final class GraficaDeZonasTests: XCTestCase {

    private static let lunes = "2026-02-23"

    private func semana(_ i: Int, z1: Int = 0, z2: Int = 0, z3: Int = 0,
                        z4: Int = 0, z5: Int = 0, sinZona: Int = 0,
                        total: Int? = nil) -> SemanaEnZonas {
        SemanaEnZonas(
            weekStart: Semanas.mas(Self.lunes, i),
            z1S: z1, z2S: z2, z3S: z3, z4S: z4, z5S: z5, noHrS: sinZona, totalS: total
        )
    }

    private func grafica(
        semanas: [SemanaEnZonas], ventana: Int = 6, rangos: [RangoDeZonas] = []
    ) -> GraficaDeZonas {
        GraficaDeZonas(
            weekStart: Self.lunes, weeks: ventana, modality: nil,
            weeksData: semanas, anchor: nil, ranges: rangos
        )
    }

    // MARK: - El eje, con sus huecos

    /// La ventana manda: seis semanas son seis celdas aunque el motor sólo haya
    /// medido dos. Las otras cuatro son AUSENCIA, y eso se dibuja.
    func test_celdas_laVentanaEnteraConLasQueFaltanComoHueco() {
        let g = grafica(semanas: [semana(0, z2: 3_600), semana(3, z2: 1_800)])
        let celdas = g.celdas
        XCTAssertEqual(celdas.count, 6)
        XCTAssertEqual(celdas.map { $0.semana != nil }, [true, false, false, true, false, false])
        XCTAssertEqual(celdas.first?.weekStart, Self.lunes)
        XCTAssertEqual(celdas.last?.weekStart, Semanas.mas(Self.lunes, 5))
        XCTAssertEqual(g.semanasSinDato, 4)
    }

    /// Una semana medida FUERA de la ventana declarada estira el eje. Ningún dato
    /// servido se cae del dibujo por un desfase de calendario entre los dos lados.
    func test_celdas_seEstiranParaNoPerderUnDatoServido() {
        let g = grafica(semanas: [semana(-2, z1: 600), semana(7, z1: 600)], ventana: 6)
        let celdas = g.celdas
        XCTAssertEqual(celdas.first?.weekStart, Semanas.mas(Self.lunes, -2))
        XCTAssertEqual(celdas.last?.weekStart, Semanas.mas(Self.lunes, 7))
        XCTAssertEqual(celdas.count, 10)
        XCTAssertEqual(celdas.filter { $0.semana != nil }.count, 2)
    }

    /// Sin una sola semana medida no hay BARRAS, y entonces la gráfica se dice
    /// con palabras (no se esconde, y no se dibuja un eje vacío).
    func test_sinUnaSolaSemanaMedida_laGraficaEstaVacia() {
        XCTAssertTrue(grafica(semanas: []).estaVacia)
        XCTAssertFalse(grafica(semanas: [semana(1, z3: 60)]).estaVacia)
    }

    /// Los dos motivos de una gráfica en blanco son distintos y hacen falta los
    /// dos. Nunca «no entrenaste»: eso no lo sabemos.
    func test_vacio_diceElMotivoQueEs() {
        let sinUmbral = grafica(semanas: [])
        XCTAssertEqual(
            PalabrasDeZonas.vacio(sinUmbral),
            "Todavía no sabemos tu umbral, así que tu tiempo no se puede repartir en zonas."
        )

        var conUmbral = sinUmbral
        conUmbral.anchor = AnclaDeZonas(source: "lthr_measured", lthrBpm: 168)
        XCTAssertEqual(
            PalabrasDeZonas.vacio(conUmbral),
            "De estas semanas todavía no hay entrenos con pulso."
        )
    }

    /// Y siempre se dice QUÉ periodo miró el coach: sin dibujo, el atleta no
    /// tiene de dónde sacarlo.
    func test_ventana_situaElPeriodoAunqueNoHayaNadaQueDibujar() {
        XCTAssertEqual(PalabrasDeZonas.ventana(grafica(semanas: [])), "23 feb a 30 mar")
        let unaSemana = GraficaDeZonas(weekStart: Self.lunes, weeks: 1, modality: nil,
                                       weeksData: [], anchor: nil, ranges: [])
        XCTAssertEqual(PalabrasDeZonas.ventana(unaSemana), "23 feb")
    }

    /// Una semana medida a cero SÍ es una semana medida (descansó), pero no
    /// levanta barra. Es el otro lado del hueco: se sabe, y fue nada.
    func test_semanaMedidaACero_noEsLoMismoQueUnHueco() {
        let g = grafica(semanas: [semana(0)])
        XCTAssertEqual(g.celdas.first?.semana?.segundos, 0)
        XCTAssertTrue(g.celdas.first?.semana?.pila.isEmpty == true)
        // Ninguna barra que dibujar en toda la ventana: no hay gráfica.
        XCTAssertTrue(g.estaVacia)
    }

    // MARK: - La pila de una barra

    /// El orden es FIJO, Z1 abajo y el hueco arriba: una pila que se reordenara
    /// por tamaño no se podría comparar con la semana de al lado.
    func test_pila_ordenFijoYAcumulada() {
        let s = semana(0, z1: 600, z2: 1_200, z4: 300, sinZona: 900)
        let pila = s.pila
        XCTAssertEqual(pila.map(\.banda), [.z1, .z2, .z4, .sinZona])
        XCTAssertEqual(pila.map(\.segundos), [600, 1_200, 300, 900])
        XCTAssertEqual(pila.map(\.desde), [0, 600, 1_800, 2_100])
        XCTAssertEqual(pila.map(\.hasta), [600, 1_800, 2_100, 3_000])
        // Las zonas sin tiempo no ocupan sitio en la barra.
        XCTAssertFalse(pila.contains { $0.banda == .z3 })
    }

    /// La barra se levanta de sus franjas y NO de `total_s`. Si el motor sumara
    /// distinto, la barra y su rótulo dirían dos cosas del mismo dato.
    func test_altoDeLaBarra_saleDeSusFranjasYNoDelTotalDelServidor() {
        let s = semana(0, z1: 600, z2: 600, total: 9_999)
        XCTAssertEqual(s.segundos, 1_200)
        XCTAssertEqual(s.totalS, 9_999)
    }

    /// Un negativo es un dato imposible: se lee como que no está, no como que
    /// resta tiempo de la semana.
    func test_segundosNegativos_seLeenComoAusencia() {
        let s = SemanaEnZonas(weekStart: Self.lunes, z1S: -600, z2S: 1_200)
        XCTAssertEqual(s.segundos(.z1), 0)
        XCTAssertEqual(s.segundos, 1_200)
    }

    // MARK: - La rejilla

    func test_escala_marcasEnHorasLimpiasYComoMuchoCinco() {
        // Seis horas y media: la rejilla cae de dos en dos horas.
        let escala = EscalaDeZonas(techo: 6 * 3600 + 1_800)
        XCTAssertEqual(escala.techo, 6 * 3600 + 1_800)
        XCTAssertEqual(escala.marcas, [0, 2 * 3600, 4 * 3600, 6 * 3600])
        XCTAssertLessThanOrEqual(escala.marcas.count, 5)

        // Una semana corta no salta a horas: se queda en cuartos.
        XCTAssertEqual(EscalaDeZonas(techo: 40 * 60).marcas, [0, 15 * 60, 30 * 60])

        // Y el techo es la semana más alta, no un número redondo por encima: así
        // la barra más alta llega al borde y la comparación usa todo el alto.
        let g = grafica(semanas: [semana(0, z2: 3_600), semana(1, z2: 7_200)])
        XCTAssertEqual(g.techo, 7_200)
        XCTAssertEqual(EscalaDeZonas(techo: g.techo).fraccion(7_200), 1)
        XCTAssertEqual(EscalaDeZonas(techo: g.techo).fraccion(3_600), 0.5)
    }

    /// Una gráfica sin nada medido no divide por cero ni inventa una escala.
    func test_escala_conTechoCero_noSeRompe() {
        let escala = EscalaDeZonas(techo: 0)
        XCTAssertEqual(escala.marcas, [0])
        XCTAssertEqual(escala.fraccion(1_000), 1)
    }

    // MARK: - Los rangos del coach

    func test_rangos_seAlineanConLasSemanasDeArriba() {
        let g = grafica(
            semanas: [semana(0, z2: 600), semana(5, z2: 600)],
            rangos: [
                RangoDeZonas(label: "Sierra", tone: "atencion",
                             weekStart: Self.lunes, weekEnd: Semanas.mas(Self.lunes, 2)),
                RangoDeZonas(label: "La base sube", tone: "bien",
                             weekStart: Semanas.mas(Self.lunes, 3),
                             weekEnd: Semanas.mas(Self.lunes, 5)),
            ]
        )
        let rangos = g.rangosDibujados
        XCTAssertEqual(rangos.map(\.desde), [0, 3])
        XCTAssertEqual(rangos.map(\.hasta), [2, 5])
        XCTAssertEqual(rangos.map(\.celdas), [3, 3])
        XCTAssertEqual(rangos.map(\.tono), [.atencion, .bien])
    }

    /// El que pisa la ventana a medias SE RECORTA, y el que no la pisa no se
    /// dibuja: la banda es un eje, no un resumen de todo lo que él marcó.
    func test_rangos_seRecortanALaVentanaYLosDeFueraNoSePintan() {
        let g = grafica(
            semanas: [semana(1, z2: 600)],
            rangos: [
                RangoDeZonas(label: "Viene de antes", tone: "neutro",
                             weekStart: Semanas.mas(Self.lunes, -8),
                             weekEnd: Semanas.mas(Self.lunes, 1)),
                RangoDeZonas(label: "Todavía no ha pasado", tone: "bien",
                             weekStart: Semanas.mas(Self.lunes, 40),
                             weekEnd: Semanas.mas(Self.lunes, 45)),
            ]
        )
        let rangos = g.rangosDibujados
        XCTAssertEqual(rangos.count, 1)
        XCTAssertEqual(rangos.first?.etiqueta, "Viene de antes")
        XCTAssertEqual(rangos.first?.desde, 0)
        XCTAssertEqual(rangos.first?.hasta, 1)
    }

    /// Un tono que este binario no conozca se lee neutro y el rango SE QUEDA:
    /// perder el tono es perder un color; tirar el rango es perder lo que el
    /// coach dijo de esas semanas.
    func test_tonoDesconocido_seLeeNeutroYNoTiraElRango() {
        XCTAssertEqual(TonoDeRango(cable: "atencion"), .atencion)
        XCTAssertEqual(TonoDeRango(cable: "urgentisimo"), .neutro)
        XCTAssertEqual(TonoDeRango(cable: nil), .neutro)

        let g = grafica(
            semanas: [semana(0, z2: 600)],
            rangos: [RangoDeZonas(label: "Ojo", tone: "rojo-fuego",
                                  weekStart: Self.lunes, weekEnd: Self.lunes)]
        )
        XCTAssertEqual(g.rangosDibujados.map(\.tono), [.neutro])
    }

    // MARK: - Las palabras

    func test_rato_seEscribeConLaGrafiaDeLaCasa() {
        XCTAssertEqual(PalabrasDeZonas.rato(0), "0")
        XCTAssertEqual(PalabrasDeZonas.rato(45 * 60), "45 min")
        XCTAssertEqual(PalabrasDeZonas.rato(2 * 3600), "2 h")
        XCTAssertEqual(PalabrasDeZonas.rato(6 * 3600 + 35 * 60), "6 h 35")
        // Por debajo del minuto no se escribe «0 min»: es un rato mal medido.
        XCTAssertEqual(PalabrasDeZonas.rato(20), "1 min")
    }

    func test_desglose_diceLoMismoQueSeVe() {
        let celda = CeldaDeSemana(
            weekStart: Self.lunes,
            semana: semana(0, z1: 1_800, z2: 3_600, sinZona: 600)
        )
        XCTAssertEqual(
            PalabrasDeZonas.desglose(celda),
            "Semana del 23 de febrero: 1 h 40 en total. Z1 30 min, Z2 1 h, Sin zona 10 min"
        )
    }

    func test_desglose_deUnaSemanaSinDato_loDice() {
        let hueco = CeldaDeSemana(weekStart: Self.lunes, semana: nil)
        XCTAssertEqual(PalabrasDeZonas.desglose(hueco), "Semana del 23 de febrero: sin datos")
    }

    func test_semanasSinDato_seDicenEnSuNumero() {
        XCTAssertNil(PalabrasDeZonas.semanasSinDato(0))
        XCTAssertEqual(PalabrasDeZonas.semanasSinDato(1), "1 semana sin dato")
        XCTAssertEqual(PalabrasDeZonas.semanasSinDato(4), "4 semanas sin dato")
    }

    /// El ancla dice el número Y de dónde sale. Una banda estimada que se lee
    /// como medida es cómo un número que nadie midió acaba siendo una prueba.
    func test_ancla_dicelaEvidenciaYNoSoloElNumero() {
        XCTAssertEqual(
            PalabrasDeZonas.ancla(AnclaDeZonas(source: "lthr_measured", lthrBpm: 168)),
            "Sobre tu umbral de 168 ppm, medido en tu test de umbral"
        )
        XCTAssertEqual(
            PalabrasDeZonas.ancla(AnclaDeZonas(source: "from_age", lthrBpm: 154)),
            "Sobre tu umbral de 154 ppm, estimado por tu edad"
        )
    }

    /// La frase del SERVIDOR manda siempre: la app no puede tener su propia
    /// versión de algo que ya está escrito en el otro lado.
    func test_ancla_prefiereLaFraseDelServidor() {
        let ancla = AnclaDeZonas(source: "lthr_measured", lthrBpm: 168,
                                 sourceLabel: "Medido en tu test de umbral de julio")
        XCTAssertEqual(
            PalabrasDeZonas.ancla(ancla),
            "Sobre tu umbral de 168 ppm, medido en tu test de umbral de julio"
        )
    }

    /// Un origen que no se conozca no inventa una frase: se queda el número, que
    /// sigue siendo cierto.
    func test_ancla_conOrigenDesconocido_dejaSoloElNumero() {
        XCTAssertEqual(
            PalabrasDeZonas.ancla(AnclaDeZonas(source: "from_lab_test", lthrBpm: 172)),
            "Sobre tu umbral de 172 ppm"
        )
    }

    // MARK: - Aritmética de semanas

    func test_semanas_sumanYSeCuentanSobreElCalendario() {
        XCTAssertEqual(Semanas.mas("2026-02-23", 1), "2026-03-02")
        XCTAssertEqual(Semanas.mas("2026-02-23", 23), "2026-08-03")
        XCTAssertEqual(Semanas.mas("2026-02-23", -1), "2026-02-16")
        XCTAssertEqual(Semanas.entre("2026-02-23", "2026-08-03"), 23)
        XCTAssertEqual(Semanas.entre("2026-08-03", "2026-02-23"), -23)
        // El cambio de hora de marzo no puede comerse ni sumar una semana.
        XCTAssertEqual(Semanas.entre("2026-03-23", "2026-04-06"), 2)
    }

    /// Una fecha ilegible no tumba nada: se queda como está y el eje sigue.
    func test_semanas_conFechaIlegible_noInventan() {
        XCTAssertEqual(Semanas.mas("mañana", 3), "mañana")
        XCTAssertEqual(Semanas.entre("mañana", "2026-02-23"), 0)
    }

    // MARK: - El escenario entero

    /// Los seis meses de ejemplo, tal y como se dibujan: veinticuatro semanas, una
    /// sin dato, y los dos tramos que el coach marcó encima.
    func test_escenarioDeSeisMeses_veinticuatroSemanasConSuHuecoYSusDosRangos() {
        let g = EscenariosComunicados.graficaDeZonas
        XCTAssertEqual(g.celdas.count, 24)
        XCTAssertEqual(g.semanasSinDato, 1)
        XCTAssertNil(g.celdas[12].semana)
        XCTAssertFalse(g.estaVacia)

        let rangos = g.rangosDibujados
        XCTAssertEqual(rangos.map(\.desde), [0, 14])
        XCTAssertEqual(rangos.map(\.hasta), [9, 23])
        XCTAssertEqual(rangos.map(\.tono), [.atencion, .bien])

        // La historia se lee sola: la sierra vive arriba y la base crece abajo.
        let sierra = g.celdas[0].semana!
        let base = g.celdas[23].semana!
        XCTAssertGreaterThan(sierra.segundos(.z5), sierra.segundos(.z1))
        XCTAssertGreaterThan(base.segundos(.z2), base.segundos(.z5))
        // Y el gris encoge, porque por el camino conectó el reloj.
        XCTAssertGreaterThan(sierra.segundos(.sinZona), base.segundos(.sinZona))
    }
}
