import XCTest
@testable import FAHYBRIK

// EL LENGUAJE DEL ENTRENO EN VIVO — lo que fija sus DECISIONES (contrato §10).
//
// Existen por lo mismo que `FormatoTests`: el 29-jul siete vistas en vivo
// correctas no se reconocían como la misma app porque cada una decidía por su
// cuenta el tamaño del sujeto, dónde caía y cuándo un número «va bien». Con una
// sola implementación, esto es lo que impide que vuelva a divergir — y salta aquí
// en vez de en la pantalla de un atleta corriendo.
//
// Se prueba el NÚCLEO, no el pintado: `LenguajeVivo.swift` es Foundation puro y
// compila también en el reloj, así que estas pruebas cubren muñeca y teléfono a la
// vez. Es justo lo que faltaba cuando los formateadores divergieron.

final class LenguajeVivoTests: XCTestCase {

    // MARK: - §10.3 · La banda del sujeto

    func testElAnclaDelSujetoSeDerivaDeLasFilasYNoSeEscribeAMano() {
        // 345 pt desde el borde de la pantalla en el iPhone 17 Pro (safe top 59) es
        // donde ya caía el numeral del rodaje, que es la vista que Alex aprobó.
        // Aquí se mide bajo el área segura: 345 − 59 = 286.
        XCTAssertEqual(BandaViva.centroSujeto, 286, accuracy: 0.001)
    }

    func testMoverUnaFilaMueveElAnclaDeFormaCoherente() {
        // El ancla NO es un número suelto que pueda contradecir a las filas: es su
        // suma. Si alguien cambia el cromo y el ancla no se mueve, hay dos números
        // diciendo cosas distintas y el sujeto empieza a bailar entre formatos.
        let suma = BandaViva.hueco + BandaViva.cromo + BandaViva.hueco
            + BandaViva.contexto + BandaViva.hueco + BandaViva.sujeto / 2
        XCTAssertEqual(BandaViva.centroSujeto, suma, accuracy: 0.001)
    }

    func testLaAccionNoPesaMasQueLaBandaDelSujeto() {
        // §10.5: el sujeto es lo que MIRAS, la acción lo que TOCAS. Si la franja de
        // acción se acerca al alto de la banda, la jerarquía se ha invertido.
        XCTAssertLessThan(BandaViva.accion, BandaViva.sujeto / 3)
    }

    // MARK: - §10.2 · El numeral, de alto y de ancho

    func testElNumeralEscalaConElAltoDisponible() {
        // 16 % de la banda del sujeto, que sobre el lienzo del iPhone 17 Pro da un
        // número que se lee de pie, a dos metros y con el móvil en el suelo.
        let t = EscalaNumeral.tamano(texto: "139", alto: 781, ancho: 378, escala: .sujeto)
        XCTAssertEqual(t, 125, accuracy: 0.5)
    }

    func testElNumeralNoBajaDelSueloNiPasaDelTecho() {
        let diminuto = EscalaNumeral.tamano(texto: "139", alto: 100, ancho: 378, escala: .sujeto)
        XCTAssertEqual(diminuto, EscalaNumeral.sujeto.minimo)

        let enorme = EscalaNumeral.tamano(texto: "139", alto: 4000, ancho: 378, escala: .sujeto)
        XCTAssertEqual(enorme, EscalaNumeral.sujeto.maximo)
    }

    func testUnaCifraCortaNoSeEnteraDeQueExisteElPresupuestoDeAncho() {
        // «139», «0:21» y «1:54» caben de sobra: el ancho no puede morderles.
        XCTAssertNil(EscalaNumeral.techoDeAncho(texto: "139", ancho: 378))
        XCTAssertNil(EscalaNumeral.techoDeAncho(texto: "1:54", ancho: 378))
    }

    func testLaPrescripcionLargaLaRECORTAElAnchoYNoElAlto() {
        // ESTE es el caso que costó una vista. «5 × 100» son siete avances de la
        // mono (0,6 em) = 525 pt sobre un lienzo de 378: sin presupuesto de ancho
        // se sale del teléfono, y la fuerza tuvo que partir la prescripción en dos
        // peldaños — con lo que «5 × 100» dejó de leerse como UNA cosa.
        let texto = "5 × 100"
        let alto = EscalaNumeral.tamano(texto: "139", alto: 781, ancho: 378, escala: .sujeto)
        let real = EscalaNumeral.tamano(texto: texto, alto: 781, ancho: 378, escala: .sujeto)
        XCTAssertLessThan(real, alto, "El ancho tiene que morder antes que el alto")

        // Y lo que sale de verdad cabe: siete glifos a 0,6 em no pasan del lienzo.
        let anchoOcupado = real * EscalaNumeral.avanceMono * CGFloat(texto.count)
        XCTAssertLessThanOrEqual(anchoOcupado, 378)
    }

    func testDynamicTypeCreceElNumeroPeroLaCajaSigueMandando() {
        // §4 manda escalar los números con el ajuste de texto del sistema; §10.2
        // manda que quepan. Cuando chocan gana la caja: un numeral recortado se lee
        // peor que uno que no creció.
        let normal = EscalaNumeral.tamano(texto: "5 × 100", alto: 781, ancho: 378, escala: .sujeto)
        let accesible = EscalaNumeral.tamano(texto: "5 × 100", alto: 781, ancho: 378,
                                             escala: .sujeto, escalaTipografica: 2)
        XCTAssertEqual(normal, accesible, accuracy: 0.001)

        // Sin presión de ancho, en cambio, el número SÍ crece.
        let corto = EscalaNumeral.tamano(texto: "139", alto: 500, ancho: 378, escala: .sujeto)
        let cortoAccesible = EscalaNumeral.tamano(texto: "139", alto: 500, ancho: 378,
                                                  escala: .sujeto, escalaTipografica: 1.4)
        XCTAssertGreaterThan(cortoAccesible, corto)
    }

    func testElTrabajoEsMasPequenoQueElSujetoPeroSigueSiendoUnInstrumento() {
        // §10.6: el trabajo es lo SEGUNDO más importante, no servicio en gris.
        let sujeto = EscalaNumeral.tamano(texto: "0:25", alto: 781, ancho: 378, escala: .sujeto)
        let trabajo = EscalaNumeral.tamano(texto: "10 de 12", alto: 781, ancho: 378, escala: .segundo)
        XCTAssertLessThan(trabajo, sujeto)
        XCTAssertGreaterThanOrEqual(trabajo, EscalaNumeral.segundo.minimo)
    }

    // MARK: - El delta contra el objetivo

    private func delta(_ v: Double, _ sentido: SentidoDelta = .menos) -> Delta {
        Delta(valor: v, unidad: "s", sentido: sentido,
              sufijo: Vocab.vsObjetivo, textoNulo: "en el objetivo")
    }

    func testEnRitmoMenosEsMejor() {
        XCTAssertEqual(delta(-3).juicio, .mejor)
        XCTAssertEqual(delta(+3).juicio, .peor)
    }

    func testEnVatiosMasEsMejor() {
        // La MISMA cifra, el juicio contrario: por eso el sentido es un dato de la
        // comparación y no algo que cada pantalla decida por su cuenta.
        XCTAssertEqual(delta(+12, .mas).juicio, .mejor)
        XCTAssertEqual(delta(-12, .mas).juicio, .peor)
    }

    func testUnaDiferenciaDespreciableSeDiceConPalabrasNoConUnCero() {
        // «+0 s» sugiere una precisión que no existe y se lee como un error.
        let nulo = delta(0.2)
        XCTAssertEqual(nulo.juicio, .igual)
        XCTAssertEqual(nulo.texto, "en el objetivo")
        XCTAssertFalse(nulo.esCifra, "«en el objetivo» no es una cifra y no se monoespacia (§4)")
    }

    func testElDeltaSiempreDiceContraQueSeCompara() {
        // Un delta sin referente es un número que miente por omisión.
        XCTAssertEqual(delta(-3).sufijo, "vs objetivo")
        XCTAssertTrue(delta(-3).esCifra)
    }

    // MARK: - El trabajo (§10.6)

    func testElTrabajoSoloEsContableConLasDosMitades() {
        let entero = Trabajo(nombre: "Calorías", hecho: 10, objetivo: 12, unidad: "cal")
        XCTAssertTrue(entero.esContable)
        XCTAssertEqual(entero.cifra, "10 de 12")
    }

    func testSinContadorNoSeFingeUnCero() {
        // §7: lo que no se sabe no se pinta. «10 de ?» no es información, y «0 de 12»
        // cuando nadie está contando es peor: parece un dato medido.
        let sinObjetivo = Trabajo(nombre: "Wall balls", hecho: 10, objetivo: nil, unidad: "reps")
        XCTAssertFalse(sinObjetivo.esContable)
        XCTAssertNil(sinObjetivo.cifra)

        let sinNada = Trabajo(nombre: "Remo", hecho: nil, objetivo: nil, unidad: nil)
        XCTAssertNil(sinNada.cifra)
    }

    // MARK: - La serie de fuerza, contra el presupuesto de ancho

    func testLaSerieREALDelCoachCabeSinPartirseEnDos() {
        // ESTE es el caso que rompió la familia del hierro: el 4×5 @ 100 kg real
        // del plan. Se mide sobre lo que devuelve el CANÓNICO, no sobre un string
        // escrito a mano en la prueba — si mañana alguien mete un espacio más en
        // `Formato.serie`, el numeral deja de caber y hay que enterarse AQUÍ.
        let cifra = try! XCTUnwrap(Formato.serie(reps: 5, cargaKg: 100)?.cifra)
        let tamano = EscalaNumeral.tamano(texto: cifra, alto: 781, ancho: 378, escala: .sujeto)
        let anchoOcupado = tamano * EscalaNumeral.avanceMono * CGFloat(cifra.count)
        XCTAssertLessThanOrEqual(anchoOcupado, 378,
                                 "La serie se sale del teléfono: partirla en dos peldaños invertiría la jerarquía")
        // Y sigue siendo un instrumento, no una nota al pie.
        XCTAssertGreaterThanOrEqual(tamano, EscalaNumeral.sujeto.minimo)
    }

    func testUnaSerieSinCargaNiSeEnteraDelPresupuestoDeAncho() {
        // «12 reps» → la cifra es «12», dos glifos: el ancho no puede morderle, y
        // por eso el peso corporal se lee tan grande como el §10.2 permite.
        let cifra = try! XCTUnwrap(Formato.serie(reps: 12, cargaKg: nil)?.cifra)
        XCTAssertNil(EscalaNumeral.techoDeAncho(texto: cifra, ancho: 378))
    }

    // MARK: - El trabajo sin nadie que lo cuente (§10.6)

    func testUnEmomDiceLaDOSISCuandoNadieCuentaLasRepeticiones() {
        // El hueco que salió al aplicar el §10.6 al EMOM: `Trabajo` sabía decir el
        // CONTADOR («10 de 12») y no sabía decir la DOSIS. En un EMOM nadie cuenta
        // burpees, y sin esto la banda se quedaba con el nombre del movimiento
        // solo — menos de lo que el atleta tiene delante.
        let t = Trabajo(nombre: "Burpees", hecho: nil, objetivo: nil, unidad: nil, dosis: "10 reps")
        XCTAssertFalse(t.esContable)
        XCTAssertNil(t.cifra, "No hay contador y no se finge uno")
        XCTAssertEqual(t.segundoPeldano, "10 reps", "La dosis SÍ se sabe, y se dice (§7)")
    }

    func testConContadorLaDosisSobra() {
        // «12 cal» debajo de «10 de 12» es la misma frase dicha dos veces.
        let t = Trabajo(nombre: "Calorías", hecho: 10, objetivo: 12, unidad: "cal", dosis: "12 cal")
        XCTAssertEqual(t.segundoPeldano, "10 de 12")
    }

    func testSinContadorYSinDosisNoSePintaNada() {
        // Un cronómetro pelado no tiene qué nombrar: ni un cero, ni un guion.
        let t = Trabajo(nombre: "Entreno libre", hecho: nil, objetivo: nil, unidad: nil)
        XCTAssertNil(t.segundoPeldano)
    }

    // MARK: - La grafía nueva que estas piezas estrenan (§2.1)

    func testLaGrafiaDelTrabajoSeLeeComoSePiensa() {
        // «de» y no «/»: la barra ya significa otra cosa en esta app («4:15/km»).
        XCTAssertEqual(Formato.trabajo(hecho: 10, objetivo: 12), "10 de 12")
        XCTAssertEqual(Formato.trabajo(hecho: 0, objetivo: 5), "0 de 5")
    }

    func testElDeltaLlevaElMenosTipograficoNoElGuionDelTeclado() {
        // A 22 pt en mono el guion se lee como separador y «-3 s» parece un rango.
        XCTAssertEqual(Formato.delta(2, "s"), "+2 s")
        XCTAssertEqual(Formato.delta(-3, "s"), "\u{2212}3 s")
        XCTAssertFalse(Formato.delta(-3, "s").contains("-"))
        XCTAssertEqual(Formato.delta(12, "W"), "+12 W")
    }

    func testElDeltaRedondeaPorqueEnVivoNoSeLeenDecimales() {
        XCTAssertEqual(Formato.delta(2.4, "s"), "+2 s")
        XCTAssertEqual(Formato.delta(-2.6, "s"), "\u{2212}3 s")
    }
}
