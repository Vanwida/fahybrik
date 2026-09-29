import SwiftUI

// LA ACCIÓN ANCLADA Y LA FILA DE LAS OTRAS SESIONES.
//
// La acción anclada es la ÚNICA puerta de empezar un entreno (DECISIONS 6-ago), siempre visible abajo
// (CONTRATO-UI §6.2) y la misma en todos los estados: el sujeto es lo que miras, la acción es lo que tocas
// y no compite en peso — una pastilla de tinta invertida, no un segundo acento. Como el contenido puede ser
// largo (16 estaciones), no vive dentro de la card: la puerta tiene que estar a la vista sin scrollear.
// El «···» que la acompaña abre las acciones de la sesión mostrada (mover · técnica · corregir · borrar
// libre) sin necesitar una pulsación larga.

/// La pastilla de la acción, a todo el ancho del dock y a 56 pt: es la de `AccionDia` (tinta invertida,
/// cursiva de marca) pero llenando el ancho, que `AccionDia` no hace (cierra un sujeto, no ancla una pantalla).
struct AccionAncladaPlan<Opciones: View>: View {
    let texto: String
    /// El SF Symbol de la acción (`AccionAnclada.simbolo`).
    let simbolo: String?
    /// El glifo va detrás («Ver lo de mañana →») salvo el play, que va delante («▶ Empezar»).
    let glifoAlFinal: Bool
    /// Mientras se reintenta: el glifo gira y no se puede pulsar dos veces.
    let enCurso: Bool
    /// Con menú, el «···» de la sesión mostrada va al lado.
    let conMenu: Bool
    let alTocar: () -> Void
    @ViewBuilder let menu: () -> Opciones

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static var alto: CGFloat { 56 }

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button(action: { Haptics.medium(); alTocar() }) {
                HStack(spacing: Theme.Spacing.m - 2) {
                    if !glifoAlFinal { glifo }
                    Text(enCurso ? "Reintentando" : texto)
                        .papel(.accion)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                    if glifoAlFinal { glifo }
                }
                .foregroundStyle(Theme.Color.background)
                .padding(.horizontal, 22)
                .frame(maxWidth: .infinity, minHeight: Self.alto)
                .background(Theme.Color.foreground, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(PressScaleStyle(escala: 0.98))
            .disabled(enCurso)
            .accessibilityLabel(enCurso ? "Reintentando" : texto)
            if conMenu {
                MenuPlan(etiqueta: "Más acciones de esta sesión", opciones: menu) {
                    ChapitaDia(.puntos, tam: Self.alto)
                        .contentShape(Circle())
                }
            }
        }
    }

    @ViewBuilder
    private var glifo: some View {
        if let simbolo {
            Image(systemName: simbolo)
                .font(.system(size: 20, weight: .bold))
                .accessibilityHidden(true)
                .rotationEffect(.degrees(enCurso ? 360 : 0))
                .animation(
                    enCurso && !reduceMotion ? .linear(duration: 0.78).repeatForever(autoreverses: false) : .default,
                    value: enCurso)
        }
    }
}

extension AccionAnclada {
    /// El glifo de cada acción: el play va delante de «Empezar»; el resto, una flecha que sigue (o lo que la
    /// idea pide: reintentar, escribir). Los del kit, con el nombre que el kit les da.
    var simbolo: String {
        switch self {
        case .empezar:         return GlifoPlan.empezar.rawValue
        case .reintentar:      return GlifoDia.reintentar.simbolo
        case .escribirAlCoach: return GlifoDia.chat.simbolo
        default:               return GlifoDia.flecha.simbolo
        }
    }

    /// El glifo va detrás salvo el play, que va delante («▶ Empezar»).
    var simboloAlFinal: Bool {
        if case .empezar = self { return false }
        return true
    }
}

// MARK: - La otra sesión del día

/// La SEGUNDA sesión del día (y cualquier otra) como fila compacta, no como otro héroe (DECISIONS 6-ago): el
/// patrón que la vieja portada ya validaba. La franja, el título con su punto de modalidad, lo que dura (o lo
/// que duró), el sello de cómo está, y su propio «···».
struct FilaSesionPlan<Opciones: View>: View {
    let sesion: AthleteWeekDaySession
    let dia: DiaDelPlan
    let l: LecturaPlan
    let alAbrir: () -> Void
    @ViewBuilder let menu: () -> Opciones

    private var estado: EstadoSesion { sesion.estado.efectivo(enDia: dia.isoDate, hoy: l.hoyIso) }

    private var meta: String {
        if estado.trabajada, let medido = l.desglose(de: sesion.assignmentId).listo?.medidoMin.flatMap(Formato.duracion) {
            return "Duró \(medido)"
        }
        return DuracionDeSesion.texto(sesion) ?? (dia.esHoy ? "También hoy" : "También ese día")
    }

    var body: some View {
        HStack(spacing: 0) {
            Button(action: { Haptics.light(); alAbrir() }) {
                HStack(spacing: Theme.Spacing.m) {
                    Text(sesion.franja)
                        .papel(.notaPesada)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(minWidth: 40, minHeight: 28)
                        .background(Theme.Color.surfaceElevated, in: Capsule())
                        .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                            ModalityDot(modality: sesion.modality, size: 9).offset(y: -1)
                            Text(sesion.title).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground).lineLimit(2)
                        }
                        Text(meta).papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    SelloEstadoDia(estado: estado.sello, tam: 24)
                }
                .padding(.leading, Theme.Spacing.l)
                .padding(.trailing, Theme.Spacing.s)
                .padding(.vertical, Theme.Spacing.m)
                .frame(minHeight: 72)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(sesion.franja), \(sesion.title), \(estado.etiqueta). \(meta)")
            .accessibilityAddTraits(.isButton)
            MenuPlan(etiqueta: "Acciones de \(sesion.title)", opciones: menu) {
                IconoDia(.puntos, tam: 22, peso: .bold)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: Theme.Size.toque)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
        }
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous).strokeBorder(Theme.Color.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
    }
}

/// La misma silueta de la acción anclada: al llegar los datos no cambia el alto del cuerpo.
struct AccionAncladaPlanEsqueleto: View {
    var conMenu = true

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            SkeletonBar(height: 56, radius: 28)
            if conMenu { SkeletonBar(width: 56, height: 56, radius: 28) }
        }
        .accessibilityHidden(true)
    }
}
