import SwiftUI

// EL CARRIL — los siete días de la semana, de un vistazo (`CarrilSemana` + `ChipDia`).
//
// Es la MISMA semana que cuenta la card, vista de lejos: la inicial, el número, el sello de cómo fue y,
// debajo, las modalidades que mandan. Dos dimensiones distintas y por eso dos marcas distintas:
//   · HOY     → la inicial en el acento y un aro (nunca desaparece, aunque mires otro día)
//   · MIRADO (el día que enseña la card) → relleno del MISMO tono que la card de debajo; la muesca de la
//     card apunta a él.
//
// El sello dice CÓMO fue (forma y color de estado): disco con visto = hecha · media luna ámbar = a medias ·
// aro tachado gris = sin hacer (no en rojo: en siete días una alarma por cada día pasado grita, y el dato es
// «no quedó registrado») · aro hueco = por hacer · raya = descanso. Los puntos dicen QUÉ tipo de trabajo.
//
// Gestos: tocar SELECCIONA el día (no abre nada); mantener pulsado saca sus acciones (`contextMenu`);
// deslizar cambia de semana. El menú también cuelga del «···» de la acción anclada, así que no hace falta la
// pulsación larga para llegar a él (no se descubre ni se alcanza con teclado).

/// El alto real del chip: el esqueleto lo repite para que nada salte al llegar los datos.
private let altoDelChip: CGFloat = 99

struct CarrilPlan<Opciones: View>: View {
    let dias: [DiaDelPlan]
    let hoyIso: String
    /// El día que la card enseña ahora mismo.
    let mostradoIso: String?
    let tono: TonoDia
    let alPulsar: (DiaDelPlan) -> Void
    /// -1 = hacia atrás, 1 = hacia delante.
    let alDeslizar: (Int) -> Void
    /// Las acciones de ese día, en pulsación larga. Un día sin sesiones no produce ningún botón y entonces no hay menú.
    @ViewBuilder let menu: (DiaDelPlan) -> Opciones

    /// Cuánto hay que arrastrar en horizontal, en pt, para que cuente como deslizar.
    private static var distanciaDeDeslizar: CGFloat { 44 }

    var body: some View {
        HStack(spacing: MuescaPlan.hueco) {
            ForEach(dias) { dia in
                ChipPlan(dia: dia, hoyIso: hoyIso, mostrado: dia.isoDate == mostradoIso, tono: tono) { alPulsar(dia) }
                    .contextMenu { menu(dia) }
            }
        }
        // `simultaneous`: un DragGesture normal en el contenedor se come el tap de los chips hijos aunque
        // tenga `minimumDistance` — así conviven.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { v in
                guard abs(v.translation.width) > abs(v.translation.height) else { return }
                if v.translation.width < -Self.distanciaDeDeslizar { alDeslizar(1) }
                else if v.translation.width > Self.distanciaDeDeslizar { alDeslizar(-1) }
            }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Los siete días de la semana")
    }
}

struct ChipPlan: View {
    let dia: DiaDelPlan
    let hoyIso: String
    let mostrado: Bool
    let tono: TonoDia
    let alPulsar: () -> Void

    @ScaledMetric(relativeTo: .title3) private var numero: CGFloat = 20

    /// Sobre el acento sólido el estado va en la tinta: un verde o un gris no se leerían.
    private var sobreAccion: Bool { mostrado && tono == .accion }

    private var papeles: TonoDia.Papeles { tono.papeles }

    /// Hoy lleva la inicial en el acento SOLO cuando no es el día mirado: el relleno de un día mirado ya es
    /// del tono de su card, y un acento sobre ese tinte no llega a 4,5:1.
    private var tintaDeLaInicial: SwiftUI.Color {
        if sobreAccion { return papeles.tinta }
        if mostrado { return Theme.Color.foreground }
        return dia.esHoy ? Theme.Color.accentText : Theme.Color.muted
    }

    var body: some View {
        Button(action: { Haptics.light(); alPulsar() }) {
            VStack(spacing: 3) {
                Text(dia.inicial)
                    .papel(.rotulo)
                    .foregroundStyle(tintaDeLaInicial)
                Text("\(dia.numero)")
                    // El 20 del diseño, escalado con el texto del sistema hasta un tope: siete columnas no
                    // crecen, y a tamaño accesible el número no puede desbordar su ficha.
                    .font(.system(size: min(numero, 26), weight: dia.esHoy || mostrado ? .heavy : .semibold).monospacedDigit())
                    .foregroundStyle(sobreAccion ? papeles.tinta : Theme.Color.foreground)
                selloDelDia
                    .frame(height: 22)
                HStack(spacing: 4) {
                    ForEach(Array(dia.modalidades.enumerated()), id: \.offset) { _, m in
                        ModalityDot(modality: m, size: 7, tinta: sobreAccion ? papeles.tinta : nil)
                    }
                }
                .frame(height: 8)
            }
            .padding(.top, 10)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, minHeight: altoDelChip)
            .background(mostrado ? papeles.fondo : .clear, in: forma)
            .overlay { forma.strokeBorder(borde, lineWidth: 1.5) }
            .contentShape(forma)
        }
        .buttonStyle(PressScaleStyle(escala: 0.94))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dia.nombre) \(dia.numero)\(dia.esHoy ? ", hoy" : ""), \(dia.resumen(hoy: hoyIso))")
        .accessibilityAddTraits(mostrado ? [.isButton, .isSelected] : .isButton)
    }

    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous) }

    private var borde: SwiftUI.Color {
        if mostrado { return tono == .accion ? .clear : papeles.borde }
        return dia.esHoy ? Theme.Color.accentText.opacity(0.55) : .clear
    }

    @ViewBuilder
    private var selloDelDia: some View {
        switch dia.estado {
        case .descanso:
            Capsule()
                .fill(sobreAccion ? papeles.tinta : Theme.Color.hairlineStrong)
                .frame(width: 14, height: 3)
        case .hecha:     SelloEstadoDia(estado: .hecha, tam: 22, tinta: sobreAccion ? papeles.tinta : nil)
        case .parcial:   SelloEstadoDia(estado: .parcial, tam: 22, tinta: sobreAccion ? papeles.tinta : nil)
        case .saltada:   SelloEstadoDia(estado: .saltada, tam: 22, tinta: sobreAccion ? papeles.tinta : nil)
        case .pendiente: SelloEstadoDia(estado: .pendiente, tam: 22, tinta: sobreAccion ? papeles.tinta : nil)
        }
    }
}

/// La misma silueta con la que llegará el carril: nada salta al llegar los datos.
struct CarrilPlanEsqueleto: View {
    var body: some View {
        HStack(spacing: MuescaPlan.hueco) {
            ForEach(0..<7, id: \.self) { _ in
                SkeletonBar(height: altoDelChip, radius: Theme.Radius.fila)
            }
        }
        .accessibilityHidden(true)
    }
}
