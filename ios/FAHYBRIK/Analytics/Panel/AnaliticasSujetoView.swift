import SwiftUI

// EL SUJETO DE LA PORTADA, PINTADO — el Estado con el cascarón editorial de «El día»
// (`SujetoDia`): la palabra de hoy en display de marca, una línea que la explica (el
// veredicto), las tres cifras de carga en insertos y la disposición con su arco. Lo pinta
// desde `SujetoEstado` y no decide nada.
//
// Aquí ninguna acción es «haz esto ahora», así que NO hay acento sólido: el tinte suave dice
// cómo estás y el color de estado va en la marca y en el arco, nunca en una cifra. Todo el
// texto va en la tinta del tema: sobre un tinte el gris de apoyo no llega a 4,5:1, y la
// jerarquía la dan el peso y el tamaño. La única acción que puede haber es la salida de un
// hueco («Empezar un entreno»), que va como pastilla de tinta invertida.
//
// Las cifras y la disposición son botones que abren la glosa (A5): «qué significa cada número».

struct AnaliticasSujeto: View {
    let sujeto: SujetoEstado
    /// El arco de la disposición se dibuja al entrar; una captura estática pide `false`.
    var animado = true
    let onGlosa: () -> Void
    let onSalida: (DestinoDeSalida) -> Void

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    var body: some View {
        SujetoDia(tono: sujeto.tono) {
            KickerEstado(marca: sujeto.marca, onGlosa: onGlosa)
            // La palabra de hoy la pone el coach y puede ser larga («Construyendo»): `TituloDia` no parte una palabra
            // sola por la mitad, la encoge hasta caber.
            TituloDia(sujeto.titulo)
            if let apoyo = sujeto.apoyo { ApoyoDia(apoyo) }
        } abajo: {
            if let plazo = sujeto.plazo { AnaliticasPlazo(plazo: plazo, tono: Theme.Color.foreground) }
            if !sujeto.celdas.isEmpty { celdas }
            if let d = sujeto.disposicion { disposicion(d) }
            switch sujeto.salida {
            case .accion(let texto, let destino)?: AnaliticasBoton(texto: texto) { onSalida(destino) }
            case .espera(let texto)? where sujeto.plazo == nil: ApoyoDia(texto)
            default: EmptyView()
            }
        }
    }

    // MARK: - Las tres cifras

    @ViewBuilder
    private var celdas: some View {
        if tamanoDeTexto.isAccessibilitySize {
            VStack(spacing: Theme.Spacing.s) { ForEach(sujeto.celdas) { CeldaDelEstado(celda: $0, onGlosa: onGlosa) } }
        } else {
            HStack(alignment: .top, spacing: Theme.Spacing.s) {
                ForEach(sujeto.celdas) { CeldaDelEstado(celda: $0, onGlosa: onGlosa) }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - La disposición

    private func disposicion(_ d: SujetoEstado.Disposicion) -> some View {
        Button(action: onGlosa) {
            HStack(spacing: 14) {
                RecoveryRing(value: d.valor, size: 60, stroke: 6, color: d.nivel.color, animado: animado, etiqueta: nil)
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.rotulo).papel(.rotulo)
                    if let palabra = d.palabra { Text(palabra).papel(.cuerpoFuerte).italic() }
                }
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, Theme.Spacing.m)
            .inserto()
        }
        .buttonStyle(PressScaleStyle(escala: 0.982))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(d.rotulo): \(d.valor) de 100\(d.palabra.map { ", \($0)" } ?? "")")
        .accessibilityHint("Qué es")
    }
}

// MARK: - Las piezas del sujeto

/// «Tu estado hoy» con la marca del estado delante y el «?» a la derecha.
private struct KickerEstado: View {
    let marca: MarcaEstado
    let onGlosa: () -> Void
    @Environment(\.tonoDia) private var tono

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            HStack(spacing: 10) {
                Circle().fill(marca.color).frame(width: 10, height: 10)
                    .background(Circle().fill(marca.color.opacity(0.24)).frame(width: 16, height: 16))
                    .accessibilityHidden(true)
                Text("Tu estado hoy").papel(.kicker).foregroundStyle(tono.papeles.tinta)
            }
            Spacer(minLength: Theme.Spacing.m)
            Button(action: onGlosa) {
                Text("?")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 32, height: 32)
                    .background(Theme.Color.foreground.opacity(0.08), in: Circle())
                    .overlay(Circle().strokeBorder(Theme.Color.foreground.opacity(0.20), lineWidth: 1))
                    .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.9))
            .padding(.vertical, -Theme.Spacing.s)
            .padding(.trailing, -Theme.Spacing.m)
            .accessibilityLabel("Qué significa cada número")
        }
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
    }
}

/// Una cifra de carga dentro del sujeto: rótulo arriba y el dato a 32 pt debajo, en la tinta del tema.
private struct CeldaDelEstado: View {
    let celda: SujetoEstado.Celda
    let onGlosa: () -> Void

    var body: some View {
        Button(action: onGlosa) {
            VStack(alignment: .leading, spacing: 0) {
                Text(celda.etiqueta).papel(.rotulo)
                Spacer(minLength: 6)
                Text(celda.texto).papel(.dato).lineLimit(1).minimumScaleFactor(0.6)
            }
            .foregroundStyle(Theme.Color.foreground)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
            .padding(EdgeInsets(top: 12, leading: 12, bottom: 10, trailing: 12))
            .inserto()
        }
        .buttonStyle(PressScaleStyle(escala: 0.982))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(celda.etiqueta): \(celda.texto)")
        .accessibilityHint("Qué es")
    }
}

private extension View {
    /// Un dato dentro del sujeto: un velo de la tinta del tema sobre el tinte, con su raya.
    func inserto() -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        return background(Theme.Color.foreground.opacity(0.06), in: forma)
            .overlay(forma.strokeBorder(Theme.Color.foreground.opacity(0.14), lineWidth: 1))
            .contentShape(forma)
    }
}
