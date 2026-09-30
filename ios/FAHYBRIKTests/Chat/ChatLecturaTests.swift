import Testing
import Foundation
@testable import FAHYBRIK

// Lo que el chat DECIDE fuera de la vista: qué banda ocupa el hueco, cómo se llama el coach (y qué pasa cuando no lo
// sabemos), qué dice el pie de un mensaje y a dónde lleva una tarjeta de contexto. Son las cosas que pueden mentirle
// al atleta: un esqueleto que no acaba, un nombre inventado, un «enviando…» en un mensaje caído, un toque que abre
// lo que no toca.

@Suite("Chat · lo que decide la lectura")
struct ChatLecturaTests {

    // MARK: - La banda de en medio

    @Test("Con mensajes, siempre conversación (aunque siga cargando o haya fallado una revalidación)")
    func conMensajes() {
        for cargando in [true, false] {
            for fallo in [true, false] {
                #expect(BandaChat.resolver(hayMensajes: true, cargando: cargando, historialCargado: false, fallo: fallo) == .conversacion)
            }
        }
    }

    @Test("El esqueleto sólo en una carga en frío: nada en pantalla y el almacén nunca cargó")
    func esqueletoSoloEnFrio() {
        #expect(BandaChat.resolver(hayMensajes: false, cargando: true, historialCargado: false, fallo: false) == .cargando)
        // Cargado alguna vez (aunque vacío): es un vacío, no un esqueleto.
        #expect(BandaChat.resolver(hayMensajes: false, cargando: true, historialCargado: true, fallo: false) == .vacio)
    }

    @Test("Sin nada que leer: fallo = error con reintento; si no, el hilo está sin estrenar")
    func errorYVacio() {
        #expect(BandaChat.resolver(hayMensajes: false, cargando: false, historialCargado: false, fallo: true) == .error)
        #expect(BandaChat.resolver(hayMensajes: false, cargando: false, historialCargado: true, fallo: false) == .vacio)
        // Un reintento en marcha vuelve al esqueleto, no se queda mostrando el error.
        #expect(BandaChat.resolver(hayMensajes: false, cargando: true, historialCargado: false, fallo: false) == .cargando)
    }

    // MARK: - Quién es el coach

    @Test("Con nombre: iniciales de las dos primeras palabras, nombre de pila y su invitación")
    func coachConNombre() {
        let coach = IdentidadCoachChat(nombre: "Marta Ruiz Gómez")
        #expect(coach.nombreCompleto == "Marta Ruiz Gómez")
        #expect(coach.iniciales == "MR")
        #expect(coach.nombrePila == "Marta")
        #expect(coach.rotuloDeAutor == "Marta")
        #expect(coach.invitacion == "Escribe a Marta para empezar")
        #expect(coach.destinoDelMensaje == "Mensaje para Marta")
    }

    @Test("Sin nombre (ausente, vacío o en blanco) NO se fabrican iniciales ni un nombre")
    func coachSinNombre() {
        for nombre in [nil, "", "   \n"] {
            let coach = IdentidadCoachChat(nombre: nombre)
            #expect(coach.nombre == nil)
            #expect(coach.nombreCompleto == "Coach")
            #expect(coach.iniciales.isEmpty)
            #expect(coach.nombrePila == nil)
            #expect(coach.rotuloDeAutor == "Coach")
            #expect(coach.invitacion == "Escríbele a tu coach para empezar")
            #expect(coach.destinoDelMensaje == "Mensaje para tu coach")
        }
    }

    @Test("El nombre se limpia: espacios alrededor no cambian las iniciales")
    func coachSeLimpia() {
        #expect(IdentidadCoachChat(nombre: "  ana lópez ").iniciales == "AL")
        #expect(IdentidadCoachChat(nombre: "Ana").iniciales == "A")
    }

    // MARK: - El pie de un mensaje

    private func mensaje(_ estado: ChatMessage.Status, mio: Bool, hora: String = "hoy") -> ChatMessage {
        ChatMessage(id: "m", sender: mio ? .me : .coach, kind: .text("hola"), timestamp: hora, status: estado)
    }

    @Test("Enviado: cuándo y de quién; el coach en minúsculas")
    func pieEnviado() {
        #expect(PieMensajeChat.de(mensaje(.sent, mio: true, hora: "ayer"), coach: "Marta") == PieMensajeChat(texto: "ayer · tú", fallido: false))
        #expect(PieMensajeChat.de(mensaje(.sent, mio: false), coach: "Marta") == PieMensajeChat(texto: "hoy · marta", fallido: false))
    }

    @Test("Enviándose, dice «enviando…»; caído, dice «No enviado» y ofrece reintento")
    func pieEnCurso() {
        #expect(PieMensajeChat.de(mensaje(.sending, mio: true), coach: "Marta") == PieMensajeChat(texto: "enviando… · tú", fallido: false))
        #expect(PieMensajeChat.de(mensaje(.failed, mio: true), coach: "Marta") == PieMensajeChat(texto: "No enviado", fallido: true))
        // Un optimista recién puesto aún no ha empezado a enviar: se lee como un mensaje normal.
        #expect(PieMensajeChat.de(mensaje(.pending, mio: true), coach: "Marta").fallido == false)
    }

    @Test("VoiceOver lee quién, cuándo y qué; un adjunto dice su tipo")
    func lecturaParaVoz() {
        #expect(mensaje(.sent, mio: true).lecturaParaVoz(coach: "Marta") == "Tú, hoy: hola")
        #expect(mensaje(.sent, mio: false).lecturaParaVoz(coach: "Marta") == "Marta, hoy: hola")
        let foto = ChatMessage(id: "f", sender: .coach, kind: .image(source: ChatAttachmentSource(remoteURL: "/x"), aspect: 1), timestamp: "ayer", status: .sent)
        #expect(foto.lecturaParaVoz(coach: "Marta") == "Marta, ayer: foto")
        let archivo = ChatMessage(id: "a", sender: .me, kind: .file(source: ChatAttachmentSource(remoteURL: "/x"), name: "plan.pdf", sizeBytes: 10), timestamp: "hoy", status: .sent)
        #expect(archivo.lecturaParaVoz(coach: "Marta") == "Tú, hoy: archivo plan.pdf")
    }

    // MARK: - A dónde lleva la tarjeta

    private func ref(kind: String = "session", exists: Bool? = true, state: String? = "done", label: String = "Fuerza A · hoy") -> ChatContextRef {
        ChatContextRef(kind: kind, ref: "a1", sub: nil, label: label, preview: nil, exists: exists, state: state)
    }

    @Test("Lo hecho se mira y lo pendiente se estudia; el título es lo de antes del punto medio")
    func destinoDeUnEntreno() {
        #expect(DestinoDeContexto.para(ref(state: "done")) == .entrenoHecho(assignmentId: "a1", titulo: "Fuerza A"))
        #expect(DestinoDeContexto.para(ref(state: "pending")) == .entrenoPorHacer(assignmentId: "a1", titulo: "Fuerza A"))
    }

    @Test("Sin confirmación del servidor, sin estado conocido o de otro tipo: no hay toque que ofrecer")
    func sinDestinoHonesto() {
        #expect(DestinoDeContexto.para(ref(exists: nil)) == nil)
        #expect(DestinoDeContexto.para(ref(exists: false)) == nil)
        #expect(DestinoDeContexto.para(ref(state: nil)) == nil)
        #expect(DestinoDeContexto.para(ref(state: "otra-cosa")) == nil)
        #expect(DestinoDeContexto.para(ref(kind: "race")) == nil)
        #expect(DestinoDeContexto.para(ref(kind: "tipo-futuro")) == nil)
    }
}
