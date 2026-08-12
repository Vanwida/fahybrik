import Testing
import Foundation
@testable import FAHYBRIK

// Lo que se prueba aquí es lo que puede MENTIRLE al atleta o al coach: cómo se
// lee una fecha, qué entrenos se ofrecen y en qué orden, y que la referencia
// sobreviva al cable y al caché en disco. La pintura no se prueba; estas tres
// cosas sí, porque un «ayer» que no es ayer o un contexto que se pierde al
// reintentar convierten la pieza en ruido.

@Suite("Chat · sobre qué va el mensaje")
struct ChatContextTests {

    // MARK: - Cómo se lee una fecha

    @Test("Hoy, ayer y un día cualquiera se dicen como los diría una persona")
    func cuandoSeLee() {
        #expect(EntrenosSeñalables.cuando(iso: "2026-08-12", hoyIso: "2026-08-12") == "hoy")
        #expect(EntrenosSeñalables.cuando(iso: "2026-08-11", hoyIso: "2026-08-12") == "ayer")
        // 12-ago-2026 es miércoles, así que el lunes 10 se lee «lun 10».
        #expect(EntrenosSeñalables.cuando(iso: "2026-08-10", hoyIso: "2026-08-12") == "lun 10")
    }

    @Test("Un futuro NO se dice «ayer» por tener un día de diferencia")
    func cuandoNoConfundeElFuturo() {
        // Mañana está a -1 días de hoy; si el signo se ignorara, saldría «ayer».
        let manana = EntrenosSeñalables.cuando(iso: "2026-08-13", hoyIso: "2026-08-12")
        #expect(manana != "ayer")
        #expect(manana == "jue 13")
    }

    @Test("Una fecha que no se puede leer se devuelve tal cual, sin inventar")
    func cuandoNoSeSabe() {
        #expect(EntrenosSeñalables.cuando(iso: "no-es-una-fecha", hoyIso: "2026-08-12") == "no-es-una-fecha")
    }

    // MARK: - Qué se ofrece en el selector

    @Test("Hoy primero, el resto de la semana después, y lo de antes al final")
    func seccionesEnOrden() throws {
        let secciones = EntrenosSeñalables.secciones(semana: try semanaDePrueba(), anterior: try semanaAnteriorDePrueba())
        #expect(secciones.map(\.titulo) == ["Hoy", "Esta semana", "Antes"])
        #expect(secciones[0].entrenos.map(\.titulo) == ["Fuerza A", "Rodaje suave"])
        // «Antes» va del más reciente al más viejo: lo último entrenado arriba.
        #expect(secciones[2].entrenos.first?.titulo == "Tirada larga")
    }

    @Test("Los PENDIENTES también se ofrecen: preguntar antes de entrenar es la mitad de los casos")
    func ofreceLosPendientes() throws {
        let secciones = EntrenosSeñalables.secciones(semana: try semanaDePrueba(), anterior: nil)
        let todos = secciones.flatMap(\.entrenos)
        #expect(todos.contains { $0.titulo == "Fuerza A" && !$0.hecho })
        #expect(todos.contains { $0.titulo == "Rodaje suave" && $0.hecho })
    }

    @Test("Un día sin sesiones no produce ninguna fila")
    func diasVaciosNoSalen() throws {
        let filas = EntrenosSeñalables.filas(de: try semanaDePrueba())
        // Cuatro sesiones en la semana de prueba, aunque haya días de descanso.
        #expect(filas.count == 4)
    }

    @Test("Sin semana no hay nada que señalar, y no revienta")
    func sinSemana() {
        #expect(EntrenosSeñalables.secciones(semana: nil, anterior: nil).isEmpty)
    }

    @Test("El pie desempata dos entrenos con el mismo título")
    func pieDesempata() throws {
        let filas = EntrenosSeñalables.filas(de: try semanaDePrueba())
        let fuerza = filas.first { $0.titulo == "Fuerza A" }
        #expect(fuerza?.pie == "Empuje · 4 bloques")
    }

    // MARK: - La etiqueta del chip y lo que viaja

    @Test("La elección compone su etiqueta y NO manda ninguna al servidor")
    func eleccionNoMandaEtiqueta() throws {
        let entreno = EntrenoElegible(
            assignmentId: "9412", titulo: "Fuerza A", cuando: "hoy", pie: nil, hecho: false
        )
        #expect(entreno.eleccion.etiqueta == "Fuerza A · hoy")

        // Lo que sale por el cable no lleva `label`: la escribe el servidor.
        let json = try JSONEncoder().encode(entreno.eleccion.target)
        let campos = try #require(try JSONSerialization.jsonObject(with: json) as? [String: Any])
        #expect(campos["kind"] as? String == "session")
        #expect(campos["ref"] as? String == "9412")
        #expect(campos["label"] == nil)
    }

    @Test("Señalar un ejercicio del entreno viaja como sesión + el segmento prescrito")
    func ejercicioDentroDelEntreno() {
        let target = ChatContextTarget.entreno("9412", ejercicio: "42")
        #expect(target.kind == .session)
        #expect(target.ref == "9412")
        #expect(target.sub == "42")
    }

    @Test("Un ejercicio sin segmento prescrito señala el entreno, no una línea inventada")
    func ejercicioSinSegmento() {
        let sinSegmento = EjercicioSeñalado(segmentoId: nil, nombre: "Back squat")
        let target = ChatContextTarget.entreno("9412", ejercicio: sinSegmento.segmentoId)
        #expect(target.sub == nil)
    }

    @Test("Una carrera y un ejercicio de catálogo nunca llevan sub")
    func sinSubDondeNoAplica() {
        #expect(ChatContextTarget.carrera("77").sub == nil)
        #expect(ChatContextTarget.ejercicio("18").sub == nil)
    }

    // MARK: - Que la referencia sobreviva

    @Test("La referencia del servidor decodifica del cable y del caché en disco")
    func refDecodifica() throws {
        let wire = #"{"kind":"session","ref":"9412","sub":"42","label":"Back squat · Fuerza A, hoy"}"#
        let ref = try JSONDecoder().decode(ChatContextRef.self, from: Data(wire.utf8))
        #expect(ref.conocido == .session)
        #expect(ref.label == "Back squat · Fuerza A, hoy")
        // Ida y vuelta por el coder plano del caché: las claves son de una sola
        // palabra, así que no hay conversión que se pierda por el camino.
        let round = try JSONDecoder().decode(ChatContextRef.self, from: try JSONEncoder().encode(ref))
        #expect(round == ref)
    }

    @Test("Un tipo que este binario no conoce NO tumba el mensaje")
    func tipoDesconocidoNoRompe() throws {
        let wire = #"{"kind":"marca","ref":"1rm-squat","label":"1RM back squat"}"#
        let ref = try JSONDecoder().decode(ChatContextRef.self, from: Data(wire.utf8))
        #expect(ref.conocido == nil)       // no se reconoce…
        #expect(ref.label == "1RM back squat")  // …pero se puede pintar
        #expect(ref.target == nil)         // y no se reenvía a ciegas
    }

    @Test("El reintento recupera exactamente lo que se mandó")
    func reintentoConservaElSujeto() {
        let eleccion = ChatContextChoice(
            target: .entreno("9412", ejercicio: "42"), etiqueta: "Back squat · Fuerza A, hoy"
        )
        #expect(eleccion.provisional.target == eleccion.target)
    }

    @Test("La cola sin línea guarda el sujeto junto al texto")
    func colaGuardaElSujeto() throws {
        let sinContexto = try #require(ChatService.encodeSendBody("hola"))
        let plano = try #require(try JSONSerialization.jsonObject(with: sinContexto) as? [String: Any])
        #expect(plano["context"] == nil)   // el cuerpo de siempre, intacto

        let conContexto = try #require(
            ChatService.encodeSendBody("¿lo alargo?", context: .entreno("9412"))
        )
        let campos = try #require(try JSONSerialization.jsonObject(with: conContexto) as? [String: Any])
        #expect(campos["body"] as? String == "¿lo alargo?")
        let ctx = try #require(campos["context"] as? [String: Any])
        #expect(ctx["ref"] as? String == "9412")
    }

    // MARK: - Semanas de prueba
    //
    // Se DECODIFICAN del cable en vez de construirse a mano: así el fixture
    // también prueba el camino real (snake_case → Codable) y no se queda obsoleto
    // cada vez que la semana gana un campo opcional.

    private func semana(_ json: String) throws -> AthleteWeekPayload {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AthleteWeekPayload.self, from: Data(json.utf8))
    }

    /// Miércoles 12 de agosto de 2026: dos sesiones hoy, una el lunes (con un día
    /// de descanso en medio) y una pendiente el jueves.
    private func semanaDePrueba() throws -> AthleteWeekPayload {
        try semana("""
        {"week_start":"2026-08-10","week_end":"2026-08-16","today_iso":"2026-08-12","days":[
          {"day_of_week":1,"iso_date":"2026-08-10","is_rest":false,"sessions":[
            {"assignment_id":"9398","slot":"am","title":"Metcon","status":"completed","short_prescription":"AMRAP 18 min"}]},
          {"day_of_week":2,"iso_date":"2026-08-11","is_rest":true,"sessions":[]},
          {"day_of_week":3,"iso_date":"2026-08-12","is_rest":false,"sessions":[
            {"assignment_id":"9412","slot":"am","title":"Fuerza A","status":"pending","short_prescription":"Empuje","blocks_count":4},
            {"assignment_id":"9411","slot":"pm","title":"Rodaje suave","status":"completed","short_prescription":"40 min"}]},
          {"day_of_week":4,"iso_date":"2026-08-13","is_rest":false,"sessions":[
            {"assignment_id":"9416","slot":"am","title":"Fuerza B","status":"pending","short_prescription":"Tirón"}]}
        ]}
        """)
    }

    private func semanaAnteriorDePrueba() throws -> AthleteWeekPayload {
        try semana("""
        {"week_start":"2026-08-03","week_end":"2026-08-09","today_iso":"2026-08-12","days":[
          {"day_of_week":4,"iso_date":"2026-08-06","is_rest":false,"sessions":[
            {"assignment_id":"9361","slot":"am","title":"Remo","status":"completed"}]},
          {"day_of_week":7,"iso_date":"2026-08-09","is_rest":false,"sessions":[
            {"assignment_id":"9372","slot":"am","title":"Tirada larga","status":"completed"}]}
        ]}
        """)
    }
}
