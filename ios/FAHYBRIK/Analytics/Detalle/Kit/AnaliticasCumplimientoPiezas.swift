import SwiftUI

// LAS PIEZAS DEL CUMPLIMIENTO — la marca de una sesión o de un tramo, la fila de una sesión del plan y los puntos de «lo que te
// piden» (espejo de `kit-analiticas/piezas.tsx#MarcaCumplimiento` y `#FilaSesion`, y de `PuntosCumplimiento`).
//
// LA FORMA Y LA PALABRA VAN SIEMPRE; EL COLOR, SOLO EN ✓. Una marca que solo se distinguiera por el color no se lee con
// daltonismo ni a plena luz: dentro es ✓ verde, no hecha es ✕, sin plan es ○, y «más» o «menos de lo pedido» un círculo con ▲ o ▼.

/// La marca de cumplimiento (28 pt por defecto): los sellos del Plan y, para más o menos de lo pedido, un círculo con su triángulo.
struct AnaliticasMarcaCumplimiento: View {
    let marca: MarcaDeCumplimiento
    var tam: CGFloat = 28

    var body: some View {
        Group {
            switch marca {
            case .dentro: SelloEstadoDia(estado: .hecha, tam: tam)
            case .noHecha: SelloEstadoDia(estado: .saltada, tam: tam)
            case .sinPlan, .sinComprobar: SelloEstadoDia(estado: .pendiente, tam: tam)
            case .masDeLoPedido, .menosDeLoPedido:
                ZStack {
                    Circle().strokeBorder(Theme.Color.muted, lineWidth: 2)
                    Image(systemName: marca == .masDeLoPedido ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                        .font(.system(size: tam * 0.38, weight: .bold))
                        .foregroundStyle(Theme.Color.foreground)
                }
                .padding(2)
                .frame(width: tam, height: tam)
            }
        }
        .frame(width: tam, height: tam)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(marca.palabra)
    }
}

/// Una sesión del plan en Semana a semana: su marca, su título con el punto de su familia, cuándo y contra qué, y la carga hecha
/// con la planificada debajo. Un toque en una hecha abre su detalle; una sin hacer no se abre y no lleva «›».
struct AnaliticasFilaSesion: View {
    let fila: FilaDeSesionVista
    let hoy: String
    var onAbrir: ((FilaDeSesionVista) -> Void)? = nil

    var body: some View {
        if fila.seAbre, let onAbrir {
            Button { onAbrir(fila) } label: { contenido }
                .buttonStyle(PressScaleStyle(escala: 0.982))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiquetaAccesible)
                .accessibilityHint("Ver la sesión tramo a tramo")
                .accessibilityAddTraits(.isButton)
        } else {
            contenido.accessibilityElement(children: .ignore).accessibilityLabel(etiquetaAccesible)
        }
    }

    private var pie: String {
        [AnaliticasFormato.fechaLegible(fila.dia, hoy: hoy), fila.palabra, fila.detalle].compactMap { $0 }.joined(separator: " · ")
    }

    private var etiquetaAccesible: String {
        var partes = [fila.titulo, pie]
        if let h = fila.hecho { partes.append(fila.plan.map { "\(h) de \($0)" } ?? h) } else if let p = fila.plan { partes.append("plan \(p)") }
        return partes.joined(separator: ", ")
    }

    private var contenido: some View {
        HStack(alignment: .center, spacing: 14) {
            AnaliticasMarcaCumplimiento(marca: fila.marca)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    AnaliticasPuntoFamilia(familia: fila.familia, talla: 10)
                    AnaliticasCuerpo(texto: fila.titulo, fuerte: true)
                }
                AnaliticasEtiqueta(texto: pie)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 2) {
                if let hecho = fila.hecho {
                    AnaliticasNumeral(texto: hecho, talla: .fila)
                    if let plan = fila.plan { AnaliticasEtiqueta(texto: "de \(plan)") }
                } else if let plan = fila.plan {
                    AnaliticasEtiqueta(texto: "plan \(plan)")
                }
            }
            if fila.seAbre { IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted) }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
        .frame(minHeight: 68)
        .contentShape(Rectangle())
    }
}

/// «Lo que te piden»: una serie, un punto. Relleno de tinta = dentro; contorno = menos de lo pedido; relleno atenuado = más.
struct AnaliticasPuntosCumplimiento: View {
    let pedido: PedidoDeSeries
    var talla: CGFloat = 14

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(0..<pedido.dentro, id: \.self) { _ in Circle().fill(Theme.Color.foreground).frame(width: talla, height: talla) }
                ForEach(0..<pedido.menos, id: \.self) { _ in Circle().strokeBorder(Theme.Color.muted, lineWidth: 2).frame(width: talla, height: talla) }
                ForEach(0..<pedido.mas, id: \.self) { _ in Circle().fill(Theme.Color.muted).frame(width: talla, height: talla) }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(pedido.dentro) dentro, \(pedido.menos) por debajo, \(pedido.mas) por encima")
            AnaliticasLeyenda(items: [
                ItemDeLeyenda(etiqueta: "\(pedido.dentro) dentro", muestra: .punto, color: Theme.Color.foreground),
                ItemDeLeyenda(etiqueta: "\(pedido.menos) menos de lo pedido", muestra: .contorno, color: Theme.Color.muted),
                ItemDeLeyenda(etiqueta: "\(pedido.mas) más de lo pedido", muestra: .punto, color: Theme.Color.muted),
            ])
        }
    }
}
