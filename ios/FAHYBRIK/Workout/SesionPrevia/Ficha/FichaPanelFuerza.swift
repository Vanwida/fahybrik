import SwiftUI

// LOS PANELES DE FUERZA — series (una tarjeta por ejercicio) y superserie (UNA tarjeta para la pareja).
//
// Una tarjeta de ejercicio enseña lo que hace falta para hacerlo: su miniatura y su nombre, la dosis en grande, contra
// qué (kilos, RPE) y, cuando las series NO son todas iguales (una rampa, una pirámide), cada una en su ficha. Si solo
// cambia la carga, las repeticiones se dicen UNA vez y las fichas llevan solo los kilos. Con tu 1RM resuelto, los
// kilos que salen del %RM; y la nota que el coach escribió para ese ejercicio hoy, con su filo.

struct FichaPanelSeries: View {
    let movimientos: [MovimientoFicha]
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            ForEach(movimientos) { movimiento in
                FichaTarjetaDeEjercicio(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica)
            }
        }
    }
}

// MARK: - La tarjeta de un ejercicio

struct FichaTarjetaDeEjercicio: View {
    let movimiento: MovimientoFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                cabeza
                dosis
                fichasDeSeries
                if let nota = movimiento.notaDeSeries {
                    Text(nota).papel(.nota).foregroundStyle(Theme.Color.muted).fixedSize(horizontal: false, vertical: true)
                }
                if let rm = movimiento.segunTuRm { segunTuRm(rm) }
                if let nota = movimiento.nota { NotaConFiloDia(nota, papel: .nota) }
            }
            .padding(FichaMedidas.rellenoDeTarjeta)
            .tarjetaDia(alAncho: true)
        }
    }

    /// La miniatura, el nombre y, debajo, lo que se hace distinto o con cuidado (el %RM, el tempo, el descanso).
    private var cabeza: some View {
        HStack(spacing: Theme.Spacing.m) {
            FichaMiniatura(movimiento: movimiento, tamano: .tarjeta)
            VStack(alignment: .leading, spacing: 3) {
                Text(movimiento.nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let secundaria = movimiento.secundaria {
                    Text(secundaria)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// «5×5  60 → 80 kg», o con la zona en su pastilla. Con el texto grande, cada cosa en su línea.
    @ViewBuilder
    private var dosis: some View {
        let columna = movimiento.columna
        if columna.principal != nil || columna.zona != nil || columna.contra != nil {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: FichaMedidas.entreDatosDeLaCabecera) {
                    principal(columna)
                    apoyo(columna)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    principal(columna)
                    apoyo(columna)
                }
            }
        }
    }

    @ViewBuilder
    private func principal(_ columna: MovimientoFicha.Columna) -> some View {
        if let principal = columna.principal {
            Text(principal)
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func apoyo(_ columna: MovimientoFicha.Columna) -> some View {
        if columna.zona != nil || columna.contra != nil {
            HStack(spacing: Theme.Spacing.s) {
                if let zona = columna.zona { PastillaZonaPrevia(zona: zona) }
                if let contra = columna.contra {
                    Text(contra)
                        .papel(.cifra)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// Las series una a una, solo cuando difieren: cada ficha con el color de su modalidad.
    @ViewBuilder
    private var fichasDeSeries: some View {
        if !movimiento.series.isEmpty {
            let color = Theme.Modality.color(movimiento.modalidad.rawValue)
            FlowLayout(spacing: Theme.Spacing.s) {
                ForEach(Array(movimiento.fichasDeSeries.enumerated()), id: \.offset) { i, texto in
                    FichaSerieEscrita(numero: i + 1, texto: texto, color: color)
                }
            }
        }
    }

    /// «Según tu 1RM 56 kg»: el %RM resuelto con TU marca (y si esa marca aún no la confirmó el coach, se dice).
    private func segunTuRm(_ rm: MovimientoFicha.SegunTuRm) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.xs + 2) { lineaDelRm(rm) }
            VStack(alignment: .leading, spacing: 2) { lineaDelRm(rm) }
        }
    }

    @ViewBuilder
    private func lineaDelRm(_ rm: MovimientoFicha.SegunTuRm) -> some View {
        Text("Según tu 1RM").papel(.nota).foregroundStyle(Theme.Color.muted)
        Text(rm.kg).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
        if rm.sinConfirmar {
            Text("sin confirmar").papel(.nota).foregroundStyle(Theme.Color.muted)
        }
    }
}

/// Una serie escrita: su número y lo que se hace en ella, en una ficha teñida de la modalidad.
private struct FichaSerieEscrita: View {
    let numero: Int
    let texto: String
    let color: SwiftUI.Color

    private static let alto: CGFloat = 36
    /// Cuánto tiñe la modalidad la ficha y su contorno.
    private static let tinte = 0.14
    private static let borde = 0.30

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
        HStack(spacing: Theme.Spacing.s) {
            Text("\(numero)").papel(.nota).foregroundStyle(Theme.Color.muted)
            Text(texto).papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
        }
        .monospacedDigit()
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: Self.alto)
        .background(Theme.Color.tinte(color, Self.tinte, sobre: Theme.Color.surface), in: forma)
        .overlay(forma.strokeBorder(color.opacity(Self.borde), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Serie \(numero), \(texto)")
    }
}

// MARK: - La superserie

/// UNA tarjeta para dos ejercicios que se alternan: arriba cuántas rondas, y cada fila con el orden en que entra (1º, 2º).
struct FichaPanelSuperserie: View {
    let bloque: BloqueFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    @ScaledMetric(relativeTo: .subheadline) private var ficha: CGFloat = 34
    /// Cuánto tiñe la modalidad la ficha del orden.
    private static let tinteDelOrden = 0.20

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let titular = bloque.titularDeLaPareja {
                Text(titular)
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                Hairline()
            }
            VStack(spacing: 0) {
                ForEach(Array(bloque.movimientos.enumerated()), id: \.element.id) { i, movimiento in
                    if i > 0 { Hairline() }
                    FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: FichaMedidas.altoDeFilaDeLaPareja) {
                        fila(movimiento)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
        }
        .tarjetaDia(alAncho: true)
    }

    private func fila(_ m: MovimientoFicha) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            if let orden = m.rol { fichaDelOrden(orden, de: m) }
            FichaMiniatura(movimiento: m, tamano: .fila)
            FilaAdaptableDia(alineacion: .center) {
                Text(m.nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(m.tintaDelNombre)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                FichaDosis(columna: m.columna, apoyoFuerte: true)
            }
        }
        .padding(.vertical, Theme.Spacing.s)
    }

    /// El orden en que entra el ejercicio, en una ficha teñida de su modalidad.
    private func fichaDelOrden(_ orden: String, de m: MovimientoFicha) -> some View {
        let color = Theme.Modality.color(m.modalidad.rawValue)
        return Text(orden)
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.foreground)
            .frame(width: ficha, height: ficha)
            .background(Theme.Color.tinte(color, Self.tinteDelOrden, sobre: Theme.Color.surface), in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}
