import SwiftUI

// EL CHECK-IN, DENTRO DEL SUJETO.
//
// Antes era una hoja larga (`CheckinView`); ahora es el propio sujeto de la portada mientras está por
// hacer: una pregunta cada vez y UN toque por pregunta, con el pulgar. Son las MISMAS cinco preguntas y
// anclas (`CheckinPregunta.todas`, la fuente que comparte la hoja) y se guarda y se envía por el MISMO
// camino (`CheckinAnswers.registrar` → `CheckinStore` + `CheckinAPI` con la cola sin conexión detrás):
// aquí no hay lógica de guardado propia. Cada respuesta avanza sola; la quinta cierra y el sujeto de la
// portada pasa a lo que toque (por eso `momento` lo trata como el paso que tapa a los demás: es lo más
// rápido para tener un número).
//
// EL CAMPO DE NOTAS no se pierde: la hoja larga lo tenía al final y aquí no hay «al final». Vive en un
// botón «Añadir nota» siempre a mano, que abre una hoja corta con el mismo borrador (`CheckinStore`:
// se guarda al teclear); al cerrar el check-in, la nota viaja en el mismo envío.
//
// «Saltar por hoy» existe, como en la hoja (`CheckinStore.markSkipped`).

/// Dónde va el paso a paso: pura, sin SwiftUI, para poder fijarla con pruebas.
struct PasoAPasoCheckin: Equatable {
    private(set) var paso = 0
    /// Lo que se ve (1 = peor, 5 = mejor) de cada pregunta; nil = sin contestar.
    private(set) var valores: [Int?] = Array(repeating: nil, count: CheckinPregunta.todas.count)

    var pregunta: CheckinPregunta { CheckinPregunta.todas[paso] }
    var total: Int { CheckinPregunta.todas.count }
    var esLaUltima: Bool { paso == total - 1 }
    var valorActual: Int? { valores[paso] }

    mutating func elige(_ valor: Int) {
        guard (1...5).contains(valor) else { return }
        valores[paso] = valor
    }

    /// Pasa a la siguiente pregunta. En la última no hace nada: quien llama la cierra con `registrar`.
    mutating func avanza() {
        if !esLaUltima { paso += 1 }
    }

    mutating func retrocede() {
        paso = max(0, paso - 1)
    }

    /// Las respuestas en los términos del modelo (dolor y fatiga guardados al revés), con la nota.
    func respuestas(nota: String) -> CheckinAnswers {
        let r = CheckinAnswers()
        for (i, pregunta) in CheckinPregunta.todas.enumerated() {
            r[keyPath: pregunta.campo] = valores[i].map(pregunta.delModelo)
        }
        r.notes = nota
        return r
    }
}

struct HoySujetoCheckin: View {
    /// No hay cifra de disposición todavía: el check-in es el camino a la primera.
    let sinCifra: Bool
    /// Hay una nota escrita en el borrador: el botón lo dice.
    let hayNota: Bool
    let acciones: HoyAcciones

    @State private var progreso = PasoAPasoCheckin()
    /// Mientras avanza no se acepta otro toque: dos toques seguidos no se saltan una pregunta.
    @State private var espera: Task<Void, Never>?

    /// Lo que se ve la respuesta elegida antes de pasar a la siguiente.
    private static let pausaDeAvance: Duration = .milliseconds(240)

    var body: some View {
        let pregunta = progreso.pregunta
        SujetoDia(tono: .info, etiqueta: "Tu check-in de hoy") {
            KickerDia("Check-in de hoy") {
                Text("\(progreso.paso + 1) de \(progreso.total)")
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.foreground)
            }
            // «Recuperación» es la palabra más larga del sujeto: con el texto del sistema en tamaños de
            // accesibilidad no cabe a 57 pt y se partiría por la mitad, así que encoge antes de partirse.
            TituloDia(pregunta.titulo)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            ApoyoDia(sinCifra
                     ? "Con estas cinco respuestas sale tu cifra de hoy."
                     : "Afina tu cifra con cómo te sientes.")
        } abajo: {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                EscalaCheckin(
                    titulo: pregunta.titulo,
                    extremos: "\(pregunta.izquierda), \(pregunta.derecha)",
                    valor: progreso.valorActual,
                    alElegir: elige
                )
                .id(progreso.paso)
                ExtremosDeEscala(izquierda: pregunta.izquierda, derecha: pregunta.derecha)
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.foreground)
            }
            controles
        }
        .onChange(of: progreso.paso) { _, nuevo in
            AccessibilityNotification.Announcement(
                "\(nuevo + 1) de \(progreso.total). \(progreso.pregunta.titulo)"
            ).post()
        }
        .onDisappear { espera?.cancel() }
    }

    // MARK: - Los controles de debajo

    /// Anterior · Nota · Saltar. En texto grande no caben en una línea y pasan a una columna.
    private var controles: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.l) {
                anterior
                Spacer(minLength: 0)
                nota
                saltar
            }
            VStack(alignment: .leading, spacing: 0) {
                anterior
                nota
                saltar
            }
        }
    }

    @ViewBuilder
    private var anterior: some View {
        if progreso.paso > 0 {
            EnlaceCheckin("Anterior") {
                Haptics.light()
                progreso.retrocede()
            }
        }
    }

    private var nota: some View {
        EnlaceCheckin(hayNota ? "Nota añadida" : "Añadir nota", glifo: hayNota ? .check : .lapiz) {
            Haptics.light()
            acciones.anadirNotaAlCheckin()
        }
    }

    private var saltar: some View {
        EnlaceCheckin("Saltar por hoy", subrayado: true) {
            Haptics.light()
            CheckinStore.markSkipped()
            acciones.checkinCerrado(.saltado)
        }
    }

    // MARK: - Elegir

    private func elige(_ valor: Int) {
        guard espera == nil else { return }
        Haptics.light()
        progreso.elige(valor)
        espera = Task { @MainActor in
            try? await Task.sleep(for: Self.pausaDeAvance)
            espera = nil
            guard !Task.isCancelled else { return }
            if progreso.esLaUltima {
                cierra()
            } else {
                withAnimation(Theme.Motion.reveal) { progreso.avanza() }
            }
        }
    }

    /// La quinta respuesta: se guarda y se envía por el camino de siempre, con la nota del borrador.
    private func cierra() {
        progreso.respuestas(nota: CheckinStore.loadDraftNotes())
            .registrar(bearer: acciones.bearer, onServerSynced: acciones.checkinSincronizado)
        acciones.checkinCerrado(.hecho)
    }
}

// MARK: - Un enlace de texto del sujeto

/// «Anterior», «Añadir nota», «Saltar por hoy»: texto de la tinta del tema, sin caja, de 48 pt de toque.
private struct EnlaceCheckin: View {
    let titulo: String
    var glifo: GlifoDia?
    var subrayado = false
    let accion: () -> Void

    init(_ titulo: String, glifo: GlifoDia? = nil, subrayado: Bool = false, accion: @escaping () -> Void) {
        self.titulo = titulo
        self.glifo = glifo
        self.subrayado = subrayado
        self.accion = accion
    }

    var body: some View {
        Button(action: accion) {
            HStack(spacing: Theme.Spacing.xs + 2) {
                if let glifo { IconoDia(glifo, tam: 16, peso: .bold) }
                Text(titulo)
                    .papel(.notaPesada)
                    .underline(subrayado, pattern: .solid)
            }
            .foregroundStyle(Theme.Color.foreground)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#if DEBUG
#Preview("Check-in · fábrica") {
    EnAmbasDia {
        HoySujetoCheckin(sinCifra: true, hayNota: false, acciones: .ninguna)
            .frame(height: 460)
    }
}
#Preview("Check-in · club azul") {
    EnAmbasDia(club: .pruebaAzul) {
        HoySujetoCheckin(sinCifra: false, hayNota: true, acciones: .ninguna)
            .frame(height: 460)
    }
}
#endif
