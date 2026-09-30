import SwiftUI

// La hoja para reservar la revisión con el coach (#21). El coach PROPONE una videollamada de 30 min
// desde la ficha del atleta y el atleta reserva hueco aquí (auto-aceptada + Google Meet).
//
// La tarjeta «Revisión con tu coach» que la abría se retiró con «Hoy · El día»: ahora es una fila de
// «Contigo» (`HoyContigo`), con el mismo estado (`ReviewService.fetchState`) y la misma hoja. Esta es
// la parte que sigue siendo suya.

// MARK: - Slot picker sheet
//
// El atleta ve los huecos ofrecidos (por día) y reserva UNO. Reservar es ELEGIR → CONFIRMAR (nunca un toque
// suelto): una revisión crea un Meet y un evento de calendario reales para el coach y el atleta no tiene
// cómo cancelarla, así que confirmar a propósito evita los toques sin querer. La hoja es `MarcoDeHojaDia`:
// el cuerpo scrollea y la confirmación queda anclada abajo, siempre a la vista.
struct ReviewSlotPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Coach FIRST name from the plan payload; nil → generic "tu coach" copy —
    /// never a fabricated name.
    var coachFirstName: String?
    /// Fires on a successful booking so the card flips to the confirmed session.
    let onBooked: (BookReviewResult) -> Void

    @State private var slots: [ReviewDaySlots] = []
    @State private var loading = true
    @State private var loadFailed = false
    @State private var selected: ReviewSlot?
    @State private var booking = false
    @State private var bookError: String?

    /// La rejilla de horas: rellena la fila, salta de línea y no hace cuentas de columnas a mano. 88 pt cabe
    /// «18:30» en una pastilla de 44 de alto con el texto del sistema por defecto.
    private let gridColumns = [GridItem(.adaptive(minimum: 88), spacing: Theme.Spacing.s)]

    @ViewBuilder
    var body: some View {
        Group {
            if slots.isEmpty {
                MarcoDeHojaDia("Reserva tu revisión", cerrar: { dismiss() }) { cuerpo }
            } else {
                MarcoDeHojaDia("Reserva tu revisión", cerrar: { dismiss() }) { cuerpo } accion: { confirmacion }
            }
        }
        .task { await reload() }
    }

    // MARK: Secciones

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            intro
            contenido
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs + 2) {
            Text("\(CoachRef.start(coachFirstName)) te propone una revisión")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text("Elige el hueco que mejor te venga. Son 30 minutos por videollamada.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if loading {
            esqueleto
        } else if loadFailed {
            AvisoEnLineaDia("No pudimos cargar los huecos. Revisa tu conexión e inténtalo de nuevo.") {
                BotonTextoDia("Reintentar", tono: .tinta) { Task { await reload() } }
            }
        } else if slots.isEmpty {
            vacio
        } else {
            listaDeHuecos
        }
    }

    /// La misma forma que lo que llega: el rótulo de un día y dos filas de horas.
    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SkeletonBar(width: 140, height: 20)
            LazyVGrid(columns: gridColumns, alignment: .leading, spacing: Theme.Spacing.s) {
                ForEach(0..<6, id: \.self) { _ in SkeletonBar(height: 44, radius: 22) }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando huecos")
    }

    /// Sin huecos no es un error: el coach cuadra la llamada por otro lado, y eso se dice.
    private var vacio: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia(.calendario)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Sin huecos ahora mismo")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Text("\(CoachRef.start(coachFirstName)) te escribirá para cuadrar la llamada.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Theme.Spacing.l)
        .tarjetaDia(alAncho: true)
        .accessibilityElement(children: .combine)
    }

    private var listaDeHuecos: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(slots) { day in
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    SubtituloDia(ReviewDateFormat.dayHeader(fromISODate: day.date))
                    LazyVGrid(columns: gridColumns, alignment: .leading, spacing: Theme.Spacing.s) {
                        ForEach(day.slots) { slot in
                            ChipFiltroDia(texto: slot.time, elegido: selected?.ms == slot.ms) {
                                selected = slot
                                bookError = nil
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Confirmación (anclada)

    @ViewBuilder
    private var confirmacion: some View {
        if let bookError { AvisoEnLineaDia(bookError) }
        BotonAccionDia(
            hoja: confirmTitle,
            activo: selected != nil,
            ocupado: booking,
            textoOcupado: "Reservando…",
            voz: "Reservando la revisión",
            accion: confirm
        )
    }

    private var confirmTitle: String {
        guard let slot = selected else { return "Elige un hueco" }
        let label = ReviewDateFormat.shortDateTime(fromISO: slot.start) ?? slot.time
        return "Reservar · \(label)"
    }

    // MARK: Load + book

    @MainActor
    private func reload() async {
        loading = true
        bookError = nil
        do {
            let fetched = try await ReviewService.fetchSlots(bearer: bearer)
            slots = fetched
            loadFailed = false
            // Drop a selection that no longer exists in the refreshed offer.
            if let sel = selected, !fetched.contains(where: { $0.slots.contains(where: { $0.ms == sel.ms }) }) {
                selected = nil
            }
        } catch {
            slots = []
            loadFailed = true
        }
        loading = false
    }

    private func confirm() {
        guard let slot = selected, !booking else { return }
        booking = true
        bookError = nil
        Task { @MainActor in
            do {
                let result = try await ReviewService.book(requestedStart: slot.start, bearer: bearer)
                Haptics.success()
                onBooked(result)
                dismiss()
            } catch let APIError.http(status, _) where status == 409 {
                // The slot was taken (or a review already exists) meanwhile → honest
                // recovery: clear the pick, reload the fresh offer, THEN surface the
                // message (reload() clears bookError, so it must be set afterwards).
                booking = false
                selected = nil
                await reload()
                bookError = "Ese hueco ya no está disponible. Elige otro."
            } catch {
                booking = false
                bookError = "No pudimos reservar. Inténtalo de nuevo."
            }
        }
    }
}

// MARK: - Coach reference copy
//
// One source for how the review surfaces name the coach when the payload
// carries no name: the generic "tu coach", capitalized at sentence start —
// NEVER a fabricated first name.
private enum CoachRef {
    /// Sentence-start reference: "Pablo" / "Tu coach".
    static func start(_ firstName: String?) -> String { firstName ?? "Tu coach" }
}
