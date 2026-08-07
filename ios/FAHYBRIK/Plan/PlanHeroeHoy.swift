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
            LabelText(
                text: "Hoy · \(dia.nombre) \(dia.numero)",
                color: Theme.Color.accentText,
                size: 10
            )
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
                FilaParteSesion(parte: parte)
            }
            if partesDeMas > 0 {
                Text(partesDeMas == 1 ? "1 parte más" : "\(partesDeMas) partes más")
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.top, 2)
    }

    /// El sobrante NO se queda en una bolsa al final: entra aquí, y las cifras de
    /// la dosis se colocan en su centro con el filo justo encima (§6.1). Sin
    /// cifras que enseñar el hueco se declara como lo que es — aire dentro de la
    /// tarjeta del sujeto, nunca una franja muerta sobre la acción.
    @ViewBuilder
    private var cifras: some View {
        if desglose.claves.isEmpty {
            Spacer(minLength: 0)
        } else {
            VStack(spacing: Theme.Spacing.m) {
                Spacer(minLength: 0)
                Hairline()
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    ForEach(desglose.claves) { clave in
                        DatoClave(clave: clave)
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
        }
    }
}

// MARK: - Hoy no toca nada (Vacío: centra, y con salida)

struct HeroeDescanso: View {
    let dia: DiaDelPlan
    let semana: SemanaDelPlan
    /// Los minutos REALES de la sesión de ayer, cuando quedó registrada. Se
    /// cuenta con lo MEDIDO, jamás con lo previsto.
    let medidoAyer: Int?
    let onAbrir: (AthleteWeekDaySession) -> Void

    private var ayer: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { semana.sesionDeAyer }
    private var manana: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? { semana.sesionDeManana }

    var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer(minLength: 0)

            VStack(spacing: Theme.Spacing.s) {
                LabelText(
                    text: "Hoy · \(dia.nombre) \(dia.numero)",
                    color: Theme.Color.accentText,
                    size: 10
                )
                Text("Hoy descansas")
                    .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                Text("No hay nada en el plan para hoy.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 280)
            }

            // La salida obligatoria del vacío (§5): de dónde vienes y a dónde vas.
            if ayer != nil || manana != nil {
                HStack(alignment: .top, spacing: Theme.Spacing.s) {
                    if let ayer {
                        TarjetaDia(
                            cuando: "Ayer",
                            dia: "\(ayer.dia.inicial) \(ayer.dia.numero)",
                            titulo: ayer.sesion.title,
                            modalidad: ayer.sesion.modality,
                            detalle: detalleDeAyer,
                            hecha: medidoAyer != nil || ayer.dia.estado.trabajado,
                            onPulsar: { onAbrir(ayer.sesion) }
                        )
                    }
                    if let manana {
                        TarjetaDia(
                            cuando: "Mañana",
                            dia: "\(manana.dia.inicial) \(manana.dia.numero)",
                            titulo: manana.sesion.title,
                            modalidad: manana.sesion.modality,
                            detalle: DuracionDeSesion.texto(manana.sesion),
                            hecha: false,
                            onPulsar: { onAbrir(manana.sesion) }
                        )
                    }
                }
            }

            if manana == nil {
                Text("La semana ya está cerrada.")
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .multilineTextAlignment(.center)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Una sesión hecha se cuenta con lo que se MIDIÓ. Sin medida no se rellena
    /// con lo previsto — se dice que no quedó registrada, que es lo que pasó.
    private var detalleDeAyer: String? {
        if let medidoAyer, let cifra = Formato.duracion(medidoAyer) { return cifra }
        guard let ayer else { return nil }
        return ayer.dia.estado.trabajado ? "hecha" : "sin registrar"
    }
}
