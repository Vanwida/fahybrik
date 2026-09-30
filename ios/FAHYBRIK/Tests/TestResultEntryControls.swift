import SwiftUI

// LOS CONTROLES DE ENTRADA DE UN RESULTADO — un número y un tiempo, con su ajuste fino − / +.
//
// El campo es la caja de la familia (`CampoDia`): superficie hundida, contorno y foco visible que pasa al
// acento del club y engorda a 2 pt (un anillo que solo cambia de color no lo ve quien no distingue los
// colores, §4.2). La cifra va en el papel del dato (32 pt) y el − / + son de 48 pt, que se tocan con el
// pulgar sudando.

// MARK: - La caja del número

/// La caja que rodea la cifra tecleable, con el foco visible.
private struct CajaDeCifra<Contenido: View>: View {
    let enFoco: Bool
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        contenido()
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Theme.Color.background, in: forma)
            .overlay {
                forma.strokeBorder(enFoco ? Theme.Color.accentText : Theme.Color.hairlineStrong, lineWidth: enFoco ? 2 : 1)
            }
    }
}

/// − / +: el ajuste fino. Un círculo de 48 pt con su nombre accesible.
private struct PasoDeEntrada: View {
    enum Sentido { case menos, mas }

    let sentido: Sentido
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Image(systemName: sentido == .mas ? "plus" : "minus")
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .background(Theme.Color.surfaceElevated, in: Circle())
                .overlay(Circle().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .accessibilityLabel(sentido == .mas ? "Aumentar" : "Disminuir")
    }
}

// MARK: - Un número

/// Un campo numérico grande con − / + de ajuste fino. Va con un binding de `String` para que teclear nunca
/// pelee con un formateador.
struct AmountEntry: View {
    @Binding var text: String
    let unit: String
    let step: Double
    let decimals: Bool
    /// Qué se mide («Sentadilla»): el nombre accesible del campo.
    let etiqueta: String
    @FocusState private var enFoco: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            PasoDeEntrada(sentido: .menos) { ajusta(-step) }
            CajaDeCifra(enFoco: enFoco) {
                HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                    TextField("0", text: $text)
                        .keyboardType(decimals ? .decimalPad : .numberPad)
                        .focused($enFoco)
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                        .fixedSize()
                        .accessibilityLabel(unit.isEmpty ? etiqueta : "\(etiqueta), \(unit)")
                    if !unit.isEmpty {
                        Text(unit)
                            .papel(.notaFuerte)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            PasoDeEntrada(sentido: .mas) { ajusta(step) }
        }
    }

    private func ajusta(_ delta: Double) {
        let actual = Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
        let siguiente = max(0, actual + delta)
        text = decimals ? Formato.esDecimal(siguiente) : String(Int(siguiente.rounded()))
        Haptics.light()
    }
}

// MARK: - Un tiempo

/// mm:ss — dos campos con dos puntos entre ellos y − / + sobre el tiempo entero (ajusta segundos y
/// desborda a minutos). Para los resultados por tiempo (5K, 2K).
struct TimeEntry: View {
    @Binding var minText: String
    @Binding var secText: String
    let step: Double
    /// Qué se mide («Tiempo 5K»): el nombre accesible de los campos.
    let etiqueta: String

    private enum Campo { case minutos, segundos }
    @FocusState private var enFoco: Campo?

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            PasoDeEntrada(sentido: .menos) { ajusta(-step) }
            CajaDeCifra(enFoco: enFoco != nil) {
                HStack(alignment: .center, spacing: Theme.Spacing.xs) {
                    campo($minText, marcador: "0", nombre: "minutos", este: .minutos)
                    Text(":")
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.muted)
                        .accessibilityHidden(true)
                    campo($secText, marcador: "00", nombre: "segundos", este: .segundos)
                }
            }
            PasoDeEntrada(sentido: .mas) { ajusta(step) }
        }
    }

    private func campo(_ binding: Binding<String>, marcador: String, nombre: String, este: Campo) -> some View {
        TextField(marcador, text: binding)
            .keyboardType(.numberPad)
            .focused($enFoco, equals: este)
            .papel(.dato)
            .foregroundStyle(Theme.Color.foreground)
            .multilineTextAlignment(.center)
            .frame(minWidth: 62)
            .fixedSize()
            .accessibilityLabel("\(etiqueta), \(nombre)")
    }

    private func ajusta(_ delta: Double) {
        let m = Int(minText) ?? 0
        let s = Int(secText) ?? 0
        let total = max(0, m * 60 + s + Int(delta))
        minText = String(total / 60)
        secText = String(format: "%02d", total % 60)
        Haptics.light()
    }
}
