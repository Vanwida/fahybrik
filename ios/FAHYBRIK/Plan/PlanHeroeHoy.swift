import SwiftUI

// EL HÉROE — la sesión de hoy, o el día que no toca nada.
//
// Es el SUJETO de la pestaña Plan (§8.1 del contrato: se ve primero y más
// grande), y es quien paga la altura: el cromo de arriba y la puerta de abajo son
// fijos, y todo el sobrante se lo lleva él (§6.1 `llena`). El día de descanso
// degrada a `centra` — no hay contenido que estirar, hay un hueco que explicar y
// del que salir (§6.2, arquetipo Vacío).

// MARK: - Hay sesión

struct HeroeSesion: View {
    let dia: DiaDelPlan
    let sesion: AthleteWeekDaySession
    /// El desglose real de la sesión. `.vacio` mientras carga o cuando el
    /// servidor no sirve detalle: entonces el héroe enseña lo que sí sabe
    /// (título, formato, reloj) y calla el resto (§7).
    let desglose: DesgloseSesion
    /// El marcado real de la sesión — un entreno ya hecho no se ofrece como si
    /// estuviera por hacer.
    let marca: SessionMarkState
    let onAbrir: () -> Void

    private var partes: [ParteDeSesion] { Array(desglose.partes.prefix(DesgloseSesion.maxPartes)) }
    private var partesDeMas: Int { max(0, desglose.partes.count - partes.count) }

    /// Un título largo baja un escalón en vez de partirse en tres líneas: el
    /// sujeto tiene que leerse de un vistazo desde el suelo.
    private var tamañoTitulo: CGFloat { sesion.title.count > 22 ? 22 : 28 }

    var body: some View {
        Button {
            Haptics.light()
            onAbrir()
        } label: {
            CardSurface(padding: 18, leftAccent: true, elevated: true) {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    encabezado
                    Text(sesion.title)
                        .scaledFont(tamañoTitulo, weight: .heavy, relativeTo: .title, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                        .fixedSize(horizontal: false, vertical: true)
                    pastillas
                    if !partes.isEmpty { listaDePartes }
                    cifras
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .contain)
    }

    // MARK: piezas

    private var encabezado: some View {
        HStack(spacing: 7) {
            LabelText(text: dia.etiquetaDeFecha, color: Theme.Color.accentText, size: 10)
            ModalityDot(modality: sesion.modality, size: 7)
            if sesion.isSelfOrigin { LibreBadge(compact: true) }
            if sesion.isTestSession { TestBadge(compact: true) }
            Spacer(minLength: 0)
            marcaDeEstado
        }
    }

    /// El sello de lo ya hecho. Una sesión pendiente no lleva ninguno: el estado
    /// por defecto no necesita un icono que lo anuncie.
    @ViewBuilder
    private var marcaDeEstado: some View {
        switch marca {
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
                .accessibilityLabel("Completada")
        case .partial:
            Image(systemName: "circle.lefthalf.filled")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
                .accessibilityLabel("A medias")
        case .missed:
            Image(systemName: "xmark.circle")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Color.faint)
                .accessibilityLabel("Sin hacer")
        case .pending:
            EmptyView()
        }
    }

    /// El formato (en castellano, del canónico) y el reloj que escribe el plan.
    /// La pastilla del reloj solo va en acento cuando lleva un NÚMERO: una razón
    /// («Dura lo que tardes») no es un dato y no se destaca como si lo fuera.
    private var pastillas: some View {
        HStack(spacing: 6) {
            if let formato = desglose.formato {
                InfoPill(text: formato)
            }
            if let duracion = DuracionDeSesion.texto(sesion) {
                InfoPill(text: duracion, acento: DuracionDeSesion.llevaNumero(sesion))
            }
            Spacer(minLength: 0)
        }
    }

    private var listaDePartes: some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(partes) { parte in
                FilaParteSesion(parte: parte, mostrarTitulo: partes.count > 1)
            }
            if partesDeMas > 0 {
                Text(partesDeMas == 1 ? "1 parte más" : "\(partesDeMas) partes más")
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.top, 2)
    }

    /// El sobrante NO se queda en una bolsa al final: entra aquí (§6.1). Es
    /// SOLO para la nota del coach para HOY — nunca para la dosis (series,
    /// carga, descanso): esa ya se ve en cuanto tocas la card y entras en el
    /// ejercicio, y repetirla aquí es la fila muerta que Alex cazó el 7-ago
    /// («eso son notas, si es que hay»; mostrar la dosis de un solo bloque como
    /// si fuera la de la sesión entera fue el fallo original). Sin nota, el
    /// hueco se declara como lo que es — aire dentro de la tarjeta del sujeto,
    /// nunca una cifra que no se pidió.
    @ViewBuilder
    private var cifras: some View {
        if let nota = desglose.notaDelDia {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Spacer(minLength: 0)
                Hairline()
                HStack(alignment: .top, spacing: Theme.Spacing.s) {
                    Image(systemName: "quote.opening")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text(nota)
                        .scaledFont(14, weight: .medium, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Nota de tu coach para hoy: \(nota)")
        } else {
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Hoy no toca nada (Vacío: centra, y con salida)

/// EL DÍA SIN NADA — y va en LA MISMA CARD que un día con sesión.
///
/// Antes esto era una composición aparte: texto centrado, sin tarjeta, con las
/// de ayer/mañana sueltas debajo. Con el carril hojeable eso se volvió el fallo
/// que Alex repitió tres veces — un día con entreno y un día de descanso se
/// veían como DOS pantallas distintas, no como el mismo sitio con otro
/// contenido. Misma `CardSurface`, mismo filo, misma posición: lo único que
/// cambia es lo que pone dentro.
struct HeroeDescanso: View {
    let dia: DiaDelPlan
    let semana: SemanaDelPlan
    /// Los minutos REALES de la sesión de ayer, cuando quedó registrada. Se
    /// cuenta con lo MEDIDO, jamás con lo previsto.
    let medidoAyer: Int?
    /// Solo el descanso de HOY enseña de dónde vienes y a dónde vas: hojeando
    /// otro día, ese marco sería el de hoy colgado de un día que no lo es (§7).
    var mostrarContexto: Bool = true
    let onAbrir: (AthleteWeekDaySession) -> Void

    private var ayer: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { semana.sesionDeAyer }
    private var manana: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { semana.sesionDeManana }
    private var hayContexto: Bool { mostrarContexto && (ayer != nil || manana != nil) }

    var body: some View {
        CardSurface(padding: 18, leftAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                LabelText(text: dia.etiquetaDeFecha, color: Theme.Color.accentText, size: 10)
                Text(dia.esHoy ? "Hoy descansas" : "Descanso")
                    .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(dia.esHoy ? "No hay nada en el plan para hoy." : "Nada en el plan para este día.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)

                // La salida del vacío (§5): de dónde vienes y a dónde vas, con
                // el sobrante repartido a su alrededor en vez de en una cola.
                if hayContexto {
                    Spacer(minLength: 0)
                    Hairline()
                    VStack(alignment: .leading, spacing: 11) {
                        if let ayer {
                            filaContexto(
                                cuando: "Ayer",
                                dia: ayer.dia,
                                sesion: ayer.sesion,
                                detalle: detalleDeAyer,
                                hecha: medidoAyer != nil || ayer.dia.estado.trabajado
                            )
                        }
                        if let manana {
                            filaContexto(
                                cuando: "Mañana",
                                dia: manana.dia,
                                sesion: manana.sesion,
                                detalle: DuracionDeSesion.texto(manana.sesion),
                                hecha: false
                            )
                        }
                    }
                } else if mostrarContexto, manana == nil {
                    Spacer(minLength: 0)
                    Text("La semana ya está cerrada.")
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.faint)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Ayer / mañana, como FILA dentro de la card — no como una tarjeta dentro
    /// de otra tarjeta, que es lo que salía al meter aquí el diseño viejo.
    private func filaContexto(
        cuando: String,
        dia: DiaDelPlan,
        sesion: AthleteWeekDaySession,
        detalle: String?,
        hecha: Bool
    ) -> some View {
        Button {
            Haptics.light()
            onAbrir(sesion)
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "\(cuando) · \(dia.inicial) \(dia.numero)", color: Theme.Color.faint, size: 9)
                    HStack(spacing: 7) {
                        ModalityDot(modality: sesion.modality, size: 6)
                        Text(sesion.title)
                            .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let detalle {
                    HStack(spacing: 5) {
                        if hecha {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Color.ok)
                        }
                        MonoText(
                            text: detalle,
                            size: 12,
                            weight: .semibold,
                            color: hecha ? Theme.Color.foreground : Theme.Color.muted,
                            escala: true
                        )
                        .lineLimit(1)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([cuando, sesion.title, detalle].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
    }

    /// Una sesión hecha se cuenta con lo que se MIDIÓ. Sin medida no se rellena
    /// con lo previsto — se dice que no quedó registrada, que es lo que pasó.
    private var detalleDeAyer: String? {
        if let medidoAyer, let cifra = Formato.duracion(medidoAyer) { return cifra }
        guard let ayer else { return nil }
        return ayer.dia.estado.trabajado ? "hecha" : "sin registrar"
    }
}
