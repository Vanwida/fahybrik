import XCTest
@testable import FAHYBRIK

// EL CONTRATO DE LECTURAS, PROBADO POR DONDE SE ROMPE.
//
// Los motores (carga, capacidad, recuperación) viven en `shared/domain/analytics`
// y ya están probados allí: repetirlos aquí sería probar el servidor desde el
// móvil. Lo que sí es nuestro son las dos promesas de las que depende la pantalla
// entera, y las dos se prueban enteras:
//
//  1 · **UNA LECTURA NUEVA APARECE SOLA.** El dibujo sale de la FORMA del dato
//      —hay serie, hay reparto, el reparto reparte— y nunca de un `id`. Si alguien
//      mete un `switch` sobre ids, estas pruebas siguen pasando pero la promesa
//      muere; lo que sí fijan es que cada combinación del modelo tiene su forma.
//
//  2 · **UN VALOR NUEVO DEL SERVIDOR NO TUMBA LA PANTALLA.** Grupo, unidad,
//      estado, paso, tono y falta decodifican a su caso desconocido en vez de
//      lanzar. Un enum ampliado en el servidor dejaría al atleta con la pantalla
//      en blanco, que es el fallo opuesto y peor.
//
// Y la GRAFÍA se barre sobre el enum ENTERO, no sobre lo que hoy se sirve: el
// inventario lo da el modelo, no el ejemplo que se tenía delante.
final class LecturasTests: XCTestCase {

    private func decodifica(_ json: String) throws -> AnaliticasAtleta {
        try APIClient.makeJSONDecoder().decode(AnaliticasAtleta.self, from: Data(json.utf8))
    }

    private func decodificaLectura(_ json: String) throws -> LecturaAnalitica {
        try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: Data(json.utf8))
    }

    // MARK: - El payload entero, tal y como lo sirve el servidor

    /// LA PRUEBA QUE CAZA UN NOMBRE DE CAMPO MAL LEÍDO. El cuerpo va en snake_case
    /// y el decodificador lo convierte; una sola clave que no cuadre tira el
    /// payload entero, y en pantalla eso se ve como «no hay analíticas» sin más
    /// pista. Este fixture reproduce la forma exacta de `AnaliticasAtleta`
    /// (`web/lib/athlete/analytics/lecturas.ts`), campo a campo.
    func testDecodificaElPayloadCompletoDelServidor() throws {
        let a = try decodifica(Self.payloadCompleto)

        XCTAssertEqual(a.athleteId, "67")
        XCTAssertEqual(a.ventana.semanas, 12)
        XCTAssertEqual(a.ventana.dias, 84)
        XCTAssertEqual(a.ventana.desde, "2026-05-23")
        XCTAssertEqual(a.metodo.acrLow, 0.8)
        XCTAssertEqual(a.metodo.acrHigh, 1.3)
        XCTAssertEqual(a.historia.semanas, 28)
        XCTAssertFalse(a.historia.cubreTodo)
        // La ventana se DECLARA: doce semanas y dos años se dibujan igual de
        // largas, y sin decirlo la curva miente por omisión.
        XCTAssertEqual(a.ventanaEs, "12 semanas")
        XCTAssertEqual(a.lecturas.count, 5)
        XCTAssertEqual(a.hechos.count, 1)

        let fondo = try XCTUnwrap(a.lecturas.porId("carga.fondo"))
        XCTAssertEqual(fondo.grupo, .carga)
        XCTAssertEqual(fondo.tituloEs, "Fondo")
        XCTAssertEqual(fondo.estado, .medida)
        XCTAssertEqual(fondo.dato?.valor, 62.4)
        XCTAssertEqual(fondo.dato?.unidad, .tss)
        XCTAssertEqual(fondo.serie?.paso, .dia)
        XCTAssertEqual(fondo.serie?.puntos.count, 4)
        XCTAssertEqual(fondo.cobertura.diasVentana, 84)
        XCTAssertEqual(fondo.procedencia.de, "banister_ctl")
        XCTAssertTrue(fondo.procedencia.medida)

        let hrv = try XCTUnwrap(a.lecturas.porId("recuperacion.variabilidad"))
        XCTAssertEqual(hrv.dato?.referencia?.valor, 55)
        XCTAssertEqual(hrv.dato?.referencia?.delta, -7)
        XCTAssertEqual(hrv.dato?.referencia?.de, "basal_60_14d")
        XCTAssertEqual(hrv.procedencia.proveedor, "garmin")

        let hecho = try XCTUnwrap(a.hechos.first)
        XCTAssertEqual(hecho.id, "cruce.subida_sin_descanso")
        XCTAssertEqual(hecho.tono, .aviso)
        XCTAssertEqual(hecho.pideEs, "")
        XCTAssertEqual(hecho.de, ["carga.fondo", "recuperacion.sueno"])
    }

    /// UN HUECO ES UN HUECO. `v` a nulo es un día que nadie midió y llega nulo,
    /// nunca colapsado a cero: un cero afirma «durmió cero horas».
    func testUnHuecoDeLaSerieLlegaNuloYNoCero() throws {
        let a = try decodifica(Self.payloadCompleto)
        let sueno = try XCTUnwrap(a.lecturas.porId("recuperacion.sueno"))
        XCTAssertEqual(sueno.serie?.puntos.map(\.v), [7.2, nil, 6.4])
    }

    // MARK: - Lo que NO puede tumbar la pantalla

    /// Un grupo nuevo en el servidor decodifica, y la vista lo ignora. Si lanzara,
    /// el atleta perdería la pantalla entera por una lectura que ni siquiera se
    /// iba a dibujar.
    func testUnGrupoDesconocidoNoTumbaElPayload() throws {
        let l = try decodificaLectura(Self.lectura(grupo: "hidratacion"))
        XCTAssertEqual(l.grupo, .desconocido)
        XCTAssertNil(l.grupo.etiqueta, "sin etiqueta no hay bloque que dibujar")
    }

    /// Una unidad que este binario no sabe escribir: la lectura existe, pero no se
    /// pinta. Un número sin unidad miente por omisión.
    func testUnaUnidadDesconocidaSeDecodificaYLaLecturaSeCalla() throws {
        let l = try decodificaLectura(Self.lectura(unidad: "vatios"))
        XCTAssertEqual(l.dato?.unidad, .desconocida)
        XCTAssertEqual(l.forma, .muda)
    }

    func testUnEstadoUnPasoYUnTonoDesconocidosNoLanzan() throws {
        let estado = try decodificaLectura(Self.lectura(estado: "en_revision"))
        XCTAssertEqual(estado.estado, .desconocido)
        XCTAssertEqual(estado.forma, .muda)

        let paso = try decodificaLectura(Self.lectura(paso: "mes"))
        XCTAssertEqual(paso.serie?.paso, .desconocido)
        XCTAssertEqual(paso.forma, .cifra, "sin paso legible la serie no se dibuja, la cifra sí")

        let hecho = try APIClient.makeJSONDecoder().decode(
            Hecho.self,
            from: Data(#"{"id":"x","frase_es":"f","pide_es":null,"de":[],"tono":"urgente"}"#.utf8)
        )
        XCTAssertEqual(hecho.tono, .desconocido)
    }

    /// LA RAZÓN QUE FALTABA. El contrato de analíticas emite `dispositivo` en casi
    /// todas las lecturas de recuperación, y este cliente lanzaba con ella: un
    /// atleta sin reloj no habría visto la pantalla en absoluto.
    func testLaFaltaPorDispositivoSeDecodificaYNoSeCalla() throws {
        let l = try decodificaLectura(Self.lectura(estado: "sin_dato", falta: #"{"por":"dispositivo"}"#))
        XCTAssertEqual(l.cobertura.falta, .dispositivo)
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.dispositivo))
        XCTAssertNil(ProgresoDeCarrera.salidaDe(.dispositivo), "conectar el reloj vive en Perfil")
        XCTAssertEqual(ProgresoDeCarrera.notaDe(.dispositivo), "Se llena solo con tu reloj conectado.")
        XCTAssertEqual(l.forma, .apagada)
    }

    /// Una razón nueva se trata como silencio: no se puede decir por qué falta ni
    /// ofrecer salida, y un candado sin motivo es el hueco mudo que este
    /// vocabulario existe para no enseñar.
    func testUnaFaltaDesconocidaCallaLaLectura() throws {
        let l = try decodificaLectura(Self.lectura(estado: "sin_dato", falta: #"{"por":"lo_que_sea"}"#))
        XCTAssertEqual(l.cobertura.falta, .desconocida)
        XCTAssertTrue(ProgresoDeCarrera.seCalla(.desconocida))
        XCTAssertEqual(l.forma, .muda)
    }

    /// Un `sin_dato` SIN falta declarada tampoco se pinta: un hueco mudo es
    /// exactamente lo que el contrato existe para no enseñar.
    func testUnSinDatoSinFaltaNoSePinta() throws {
        let l = try decodificaLectura(Self.lectura(estado: "sin_dato", falta: "null"))
        XCTAssertEqual(l.forma, .muda)
    }

    // MARK: - La forma sale del dato, nunca del id

    func testLaFormaSaleDeLaCombinacionDeDatoSerieYReparto() throws {
        XCTAssertEqual(try decodificaLectura(Self.lectura()).forma, .cifraYSerie)
        XCTAssertEqual(try decodificaLectura(Self.lectura(serie: "null")).forma, .cifra)

        let barra = try decodificaLectura(Self.lectura(serie: "null", reparto: Self.repartoProporcional))
        XCTAssertEqual(barra.forma, .cifraYBarra)
        XCTAssertTrue(try XCTUnwrap(barra.reparto).esProporcional)

        let filas = try decodificaLectura(Self.lectura(serie: "null", reparto: Self.repartoSinPorcentaje))
        XCTAssertEqual(filas.forma, .cifraYFilas)
        XCTAssertFalse(try XCTUnwrap(filas.reparto).esProporcional)
    }

    /// UN PUNTO NO ES UNA TENDENCIA, y un hueco no cuenta como punto: con una sola
    /// noche medida la curva no se dibuja, pero la cifra se queda. Interpolar sobre
    /// el hueco para llegar a dos puntos sería inventar el dato que falta.
    func testUnaSerieConUnSoloValorNoEsCurva() throws {
        let l = try decodificaLectura(Self.lectura(serie: #"{"unidad":"tss","paso":"dia","puntos":[{"t":"2026-08-11","v":62},{"t":"2026-08-12","v":null}]}"#))
        XCTAssertEqual(l.forma, .cifra)
    }

    /// El id sirve para RECONOCER una lectura (un hecho cita sus ids), nunca para
    /// decidir cómo se dibuja: dos lecturas con el mismo dato tienen la misma forma
    /// aunque se llamen distinto.
    func testDosIdsDistintosConElMismoDatoTienenLaMismaForma() throws {
        let a = try decodificaLectura(Self.lectura(id: "carga.fondo"))
        let b = try decodificaLectura(Self.lectura(id: "grupo.nuevo.que.no.existe"))
        XCTAssertEqual(a.forma, b.forma)
    }

    /// Un hueco DECLARADO no retira el número: retira el veredicto. Es la misma
    /// regla que ya gobierna la pantalla de carrera, y por eso una lectura medida
    /// puede traer falta.
    func testUnaLecturaMedidaConFaltaSigueSiendoMedida() throws {
        let l = try decodificaLectura(Self.lectura(falta: #"{"por":"historia","llevas":12,"hacen":42}"#))
        XCTAssertEqual(l.estado, .medida)
        XCTAssertEqual(l.forma, .cifraYSerie)
        XCTAssertEqual(l.cobertura.falta, .historia(llevas: 12, hacen: 42))
    }

    // MARK: - La grafía: el enum ENTERO, no lo que hoy se sirve

    /// Toda unidad del contrato se sabe escribir. Es la prueba que impide que una
    /// unidad nueva entre en el modelo y desaparezca en silencio de la pantalla.
    func testTodaUnidadDelContratoSeSabeEscribir() {
        for unidad in UnidadLectura.allCases where unidad != .desconocida {
            XCTAssertNotNil(
                GrafiaDeLectura.escribe(42, unidad),
                "la unidad \(unidad.rawValue) no tiene grafía y su lectura no se pintaría"
            )
        }
        XCTAssertNil(GrafiaDeLectura.escribe(42, .desconocida))
    }

    /// CERO JERGA. La clave del cable es `bpm` y `tss`; la palabra del atleta es
    /// «ppm» y «carga». Si esto se rompe, la app le habla en vocabulario de motor.
    func testLasUnidadesSeEscribenEnElIdiomaDelAtleta() {
        XCTAssertEqual(GrafiaDeLectura.escribe(48, .bpm)?.unidad, Vocab.ppm)
        XCTAssertEqual(GrafiaDeLectura.escribe(62, .tss)?.unidad, "carga")
        XCTAssertEqual(GrafiaDeLectura.escribe(7, .tssSemana)?.unidad, "carga/sem")
        XCTAssertNotEqual(GrafiaDeLectura.escribe(48, .bpm)?.unidad, "bpm")
    }

    /// UNA VELOCIDAD SE LE ESCRIBE AL CORREDOR COMO RITMO: nadie sostiene «3,42
    /// m/s», sostiene 4:52 el kilómetro. Y la unidad va PEGADA, como manda la
    /// grafía canónica del ritmo — partirla sería su tercera escritura.
    func testLaVelocidadCriticaSeEscribeComoRitmo() throws {
        let escrito = try XCTUnwrap(GrafiaDeLectura.escribe(1000.0 / 292.0, .mS))
        XCTAssertEqual(escrito.cifra, "4:52/km")
        XCTAssertNil(escrito.unidad)
        XCTAssertNil(GrafiaDeLectura.escribe(0, .mS), "una velocidad nula no es un ritmo")
    }

    /// El ritmo de subida es la única magnitud SIGNADA del contrato: bajar el fondo
    /// es tan legítimo como subirlo, y el signo se escribe con el menos tipográfico.
    func testElRitmoDeSubidaLlevaSuSignoConElMenosTipografico() {
        XCTAssertEqual(GrafiaDeLectura.escribe(7, .tssSemana)?.cifra, "+7")
        XCTAssertEqual(GrafiaDeLectura.escribe(-3, .tssSemana)?.cifra, "\u{2212}3")
        XCTAssertEqual(Formato.conSigno(-3), "\u{2212}3")
        XCTAssertFalse(GrafiaDeLectura.escribe(-3, .tssSemana)!.cifra.contains("-"),
                       "el guion del teclado se lee como separador en la mono grande")
    }

    /// El cociente lleva DOS decimales: a uno solo, las bandas del coach (0,80 y
    /// 1,30) dejarían de distinguirse de lo que hay entre ellas.
    func testElCocienteSeEscribeConDosDecimalesYComa() {
        XCTAssertEqual(GrafiaDeLectura.escribe(1.1234, .ratio)?.cifra, "1,12")
        XCTAssertEqual(GrafiaDeLectura.escribe(1, .ratio)?.cifra, "1,00")
    }

    /// Un rato de entrenamiento son horas y minutos, no un cronómetro: «12:30:00»
    /// hace pensar y «12 h 30» se lee.
    func testUnRatoLargoSeEscribeEnHorasYMinutos() {
        XCTAssertEqual(GrafiaDeLectura.escribe(45_000, .segundos)?.cifra, "12 h 30")
        XCTAssertEqual(GrafiaDeLectura.escribe(600, .segundos)?.cifra, "10:00")
    }

    /// CONTRA QUÉ SE LEE EL NÚMERO, en palabras. `de` es una clave estable del
    /// servidor y una clave no se le enseña a nadie: se traduce o no se escribe.
    func testLaReferenciaSeTraduceYUnaClaveDesconocidaNoSePinta() {
        let basal = ReferenciaDeLectura(valor: 55, delta: -7, de: "basal_60_14d")
        XCTAssertEqual(GrafiaDeLectura.escribeReferencia(basal, .ms), "tu media 55")

        let rara = ReferenciaDeLectura(valor: 55, delta: -7, de: "percentil_p75_cohorte")
        XCTAssertNil(GrafiaDeLectura.escribeReferencia(rara, .ms),
                     "antes ninguna palabra que una clave cruda en pantalla")
    }

    // MARK: - La salida: una por bloque

    /// A UN ATLETA SIN RELOJ NO SE LE PIDE EL RELOJ SIETE VECES. Cuando varias
    /// lecturas esperan lo mismo, la salida sale una vez; cuando esperan cosas
    /// distintas, no sale ninguna (dos botones seguidos no son una salida).
    func testLaSalidaDeUnBloqueSaleUnaVezONoSale() throws {
        let anclaA = try decodificaLectura(Self.lectura(id: "a", estado: "sin_dato", falta: #"{"por":"ancla"}"#))
        let anclaB = try decodificaLectura(Self.lectura(id: "b", estado: "sin_dato", falta: #"{"por":"ancla"}"#))
        let sensor = try decodificaLectura(Self.lectura(id: "c", estado: "sin_dato", falta: #"{"por":"sensor"}"#))
        let plazo = try decodificaLectura(Self.lectura(id: "d", estado: "sin_dato", falta: #"{"por":"historia","llevas":2,"hacen":6}"#))

        XCTAssertEqual(SalidaDeLecturas.texto([anclaA, anclaB]), "Hacer el test de zonas")
        XCTAssertEqual(SalidaDeLecturas.texto([anclaA]), "Hacer el test de zonas")
        XCTAssertNil(SalidaDeLecturas.texto([anclaA, sensor]))
        XCTAssertNil(SalidaDeLecturas.texto([plazo]), "esperar no es una acción")
    }

    /// Un grupo entero de lecturas mudas no es un bloque vacío: es un bloque que no
    /// existe, y escribir su etiqueta sería un título sobre nada.
    func testUnGrupoSoloDeLecturasMudasNoTieneNadaQuePintar() throws {
        let muda = try decodificaLectura(Self.lectura(estado: "sin_dato", falta: #"{"por":"ocasion"}"#))
        XCTAssertTrue([muda].pintables().isEmpty)
    }

    // MARK: - Las cuatro lecturas de carrera que nadie dibujaba

    /// LA BANDA ABIERTA SE DICE ABIERTA. La zona más suave no tiene techo por el
    /// lado lento, y fingirle un borde sería inventarse un dato del perfil.
    func testUnaBandaDeRitmoAbiertaNoFingeUnBorde() {
        let cerrada = ZonaRitmo(code: "z3", label: "Z3", color: "#0F6E3C", role: nil,
                                fastS: 240, slowS: 270, sortOrder: 3)
        XCTAssertEqual(EscaleraDeZonas.banda(cerrada), "4:00 \u{2013} 4:30")

        let abiertaPorAbajo = ZonaRitmo(code: "z1", label: "Z1", color: "#565C63", role: nil,
                                        fastS: 330, slowS: nil, sortOrder: 1)
        XCTAssertEqual(EscaleraDeZonas.banda(abiertaPorAbajo), "desde 5:30")

        let sinBordes = ZonaRitmo(code: "zx", label: "ZX", color: "#000000", role: nil,
                                  fastS: nil, slowS: nil, sortOrder: 9)
        XCTAssertNil(EscaleraDeZonas.banda(sinBordes))
    }

    /// El color de una zona llega POR EL CABLE y es el único de la app que lo hace.
    /// Ante un hexadecimal roto se cae a la tinta apagada: una muestra gris dice «no
    /// sé de qué color es esta banda», y eso es cierto. Inventar un color no lo sería.
    func testElColorDeUnaZonaSeLeeYUnHexadecimalRotoNoInventaColor() {
        XCTAssertEqual(EscaleraDeZonas.tinta("#1A62B5"), EscaleraDeZonas.tinta("1A62B5"))
        XCTAssertEqual(EscaleraDeZonas.tinta("#f2a"), EscaleraDeZonas.tinta("#ff22aa"))
        XCTAssertEqual(EscaleraDeZonas.tinta("azul"), Theme.Color.faint)
        XCTAssertEqual(EscaleraDeZonas.tinta(""), Theme.Color.faint)
    }

    /// `origen` es una clave estable del servidor. Sin traducción no se escribe:
    /// «onboarding_auto» en pantalla es jerga de base de datos.
    func testLaProcedenciaDelUmbralSeTraduceONoSeEscribe() {
        XCTAssertEqual(UmbralDeRitmo.fuente("coach_test"), "test con tu coach")
        XCTAssertEqual(UmbralDeRitmo.fuente("athlete_test"), "tu test")
        XCTAssertEqual(UmbralDeRitmo.fuente("onboarding_auto"), "estimado en el alta")
        XCTAssertNil(UmbralDeRitmo.fuente("importado_de_strava"))
        XCTAssertNil(UmbralDeRitmo.fuente(nil))
    }

    /// El tipo de sesión llega en vocabulario del cable. Si no se sabe nombrar en
    /// castellano, la fila no sale: antes ninguna fila que una con jerga dentro.
    func testElTipoDeSesionSeNombraEnCastellanoOLaFilaNoSale() {
        XCTAssertEqual(MediasPorTipo.nombre("steady"), "Rodaje")
        XCTAssertEqual(MediasPorTipo.nombre("intervals"), "Series")
        XCTAssertEqual(MediasPorTipo.nombre("interval"), "Series", "el valor antiguo, canonicalizado")
        XCTAssertEqual(MediasPorTipo.nombre("hyrox_sim"), "Simulacro HYROX")
        XCTAssertNil(MediasPorTipo.nombre("lo_que_sea"))
    }

    // MARK: - Fixtures

    /// Una lectura con la forma EXACTA del contrato, con cada pieza sustituible
    /// para probar una variante sin repetir el JSON entero.
    private static func lectura(
        id: String = "carga.fondo",
        grupo: String = "carga",
        estado: String = "medida",
        unidad: String = "tss",
        serie: String = #"{"unidad":"tss","paso":"dia","puntos":[{"t":"2026-08-11","v":61},{"t":"2026-08-12","v":62}]}"#,
        paso: String? = nil,
        reparto: String = "null",
        falta: String = "null"
    ) -> String {
        let serieFinal = paso.map {
            #"{"unidad":"tss","paso":"\#($0)","puntos":[{"t":"2026-08-11","v":61},{"t":"2026-08-12","v":62}]}"#
        } ?? serie
        let dato = estado == "sin_dato" ? "null" : #"{"valor":62.4,"unidad":"\#(unidad)","referencia":null}"#
        return """
        {
          "id": "\(id)",
          "grupo": "\(grupo)",
          "titulo_es": "Fondo",
          "estado": "\(estado)",
          "dato": \(dato),
          "serie": \(estado == "sin_dato" ? "null" : serieFinal),
          "reparto": \(reparto),
          "cobertura": {"muestras": 41, "dias_ventana": 84, "dias_con_dato": 41, "pct": 48.8, "falta": \(falta)},
          "procedencia": {"de": "banister_ctl", "explica_es": "Media móvil de 42 días.", "medida": true, "proveedor": null}
        }
        """
    }

    private static let repartoProporcional = """
    {"unidad":"segundos","total":36000,
     "partes":[{"code":"medido","etiqueta_es":"Medido con ritmo o pulso","valor":21600,"pct":60},
               {"code":"declarado","etiqueta_es":"Puntuado por ti","valor":7200,"pct":20},
               {"code":"sin_precio","etiqueta_es":"Sin puntuar ni medir","valor":7200,"pct":20}]}
    """

    /// La curva de esfuerzos sobre la que se ajustó la velocidad crítica: cada
    /// parte es un esfuerzo real, no un trozo de un total, y por eso llega sin `pct`.
    private static let repartoSinPorcentaje = """
    {"unidad":"metros","total":5600,
     "partes":[{"code":"230s","etiqueta_es":"1000 m","valor":1000,"pct":null},
               {"code":"480s","etiqueta_es":"1600 m","valor":1600,"pct":null},
               {"code":"900s","etiqueta_es":"3000 m","valor":3000,"pct":null}]}
    """

    private static let payloadCompleto = """
    {
      "athlete_id": "67",
      "generado_iso": "2026-08-13T09:12:00.000Z",
      "ventana": {"semanas": 12, "dias": 84, "desde": "2026-05-23", "hasta": "2026-08-13"},
      "metodo": {
        "ctl_days": 42, "atl_days": 7, "ramp_alert_tss_per_week": 5,
        "acr_low": 0.8, "acr_high": 1.3,
        "cs_min_efforts": 3, "cs_min_duration_s": 120, "cs_max_duration_s": 900,
        "cs_min_spread_ratio": 3, "cs_min_fit_r2_pct": 95, "cs_max_drift_from_threshold_pct": 15,
        "sleep_target_hours": 8, "hrv_min_nights_baseline": 14, "hrv_min_nights_recent": 3,
        "subida_dias": 14, "subida_minima_pct": 5, "cobertura_ciega_alerta_pct": 25
      },
      "historia": {"semanas": 28, "desde": "2026-01-29", "cubre_todo": false},
      "lecturas": [
        {
          "id": "carga.fondo", "grupo": "carga", "titulo_es": "Fondo", "estado": "medida",
          "dato": {"valor": 62.4, "unidad": "tss", "referencia": null},
          "serie": {"unidad": "tss", "paso": "dia", "puntos": [
            {"t": "2026-08-10", "v": 58.1}, {"t": "2026-08-11", "v": 59.7},
            {"t": "2026-08-12", "v": 61.2}, {"t": "2026-08-13", "v": 62.4}]},
          "reparto": null,
          "cobertura": {"muestras": 41, "dias_ventana": 84, "dias_con_dato": 41, "pct": 48.8, "falta": null},
          "procedencia": {"de": "banister_ctl", "explica_es": "Media móvil de 42 días de la carga diaria.", "medida": true, "proveedor": null}
        },
        {
          "id": "carga.subida", "grupo": "carga", "titulo_es": "Ritmo de subida", "estado": "medida",
          "dato": {"valor": 7.3, "unidad": "tss_semana", "referencia": {"valor": 5, "delta": 2.3, "de": "aviso_del_coach"}},
          "serie": {"unidad": "tss_semana", "paso": "dia", "puntos": [{"t": "2026-08-12", "v": 6.9}, {"t": "2026-08-13", "v": 7.3}]},
          "reparto": null,
          "cobertura": {"muestras": 41, "dias_ventana": 84, "dias_con_dato": 41, "pct": 48.8, "falta": null},
          "procedencia": {"de": "banister_ramp", "explica_es": "Cuánto ha crecido el fondo en la última semana.", "medida": true, "proveedor": null}
        },
        {
          "id": "carga.cobertura", "grupo": "carga", "titulo_es": "Cuánto de esto se ha medido", "estado": "medida",
          "dato": {"valor": 74.2, "unidad": "pct", "referencia": {"valor": 51.4, "delta": 22.8, "de": "medido_por_instrumento"}},
          "serie": null,
          "reparto": \(repartoProporcional),
          "cobertura": {"muestras": 6, "dias_ventana": 28, "dias_con_dato": 19, "pct": 67.8, "falta": null},
          "procedencia": {"de": "cobertura_carga", "explica_es": "Segundos entrenados en 28 días.", "medida": true, "proveedor": null}
        },
        {
          "id": "recuperacion.variabilidad", "grupo": "recuperacion", "titulo_es": "Variabilidad", "estado": "medida",
          "dato": {"valor": 48, "unidad": "ms", "referencia": {"valor": 55, "delta": -7, "de": "basal_60_14d"}},
          "serie": {"unidad": "ms", "paso": "dia", "puntos": [{"t": "2026-08-11", "v": 51}, {"t": "2026-08-12", "v": 47}, {"t": "2026-08-13", "v": 48}]},
          "reparto": null,
          "cobertura": {"muestras": 62, "dias_ventana": 84, "dias_con_dato": 62, "pct": 73.8, "falta": null},
          "procedencia": {"de": "basal_hrv_60_14d", "explica_es": "Tu variabilidad frente a tu media habitual.", "medida": true, "proveedor": "garmin"}
        },
        {
          "id": "recuperacion.sueno", "grupo": "recuperacion", "titulo_es": "Sueño", "estado": "medida",
          "dato": {"valor": 6.4, "unidad": "horas", "referencia": {"valor": 8, "delta": -1.6, "de": "objetivo_sueno"}},
          "serie": {"unidad": "horas", "paso": "dia", "puntos": [{"t": "2026-08-11", "v": 7.2}, {"t": "2026-08-12", "v": null}, {"t": "2026-08-13", "v": 6.4}]},
          "reparto": null,
          "cobertura": {"muestras": 58, "dias_ventana": 84, "dias_con_dato": 58, "pct": 69, "falta": null},
          "procedencia": {"de": "sleep_duration_dia_local", "explica_es": "Horas dormidas la última noche con dato.", "medida": true, "proveedor": "garmin"}
        }
      ],
      "hechos": [
        {
          "id": "cruce.subida_sin_descanso",
          "frase_es": "",
          "pide_es": "",
          "de": ["carga.fondo", "recuperacion.sueno"],
          "tono": "aviso"
        }
      ]
    }
    """
}
