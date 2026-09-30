import SwiftUI

// LOS BLOQUES EN LA FICHA PREVIA — lo principal manda y lo estructural se pliega.
//
// Un bloque del coach se queda AGRUPADO (un metcon o una superserie no se deshace en tarjetas sueltas):
// un EMOM que alterna es UNA rotación minuto a minuto, una superserie es UNA rotación ronda a ronda, y el
// resto va ítem a ítem con su forma. Las dos rotaciones leen el MISMO pliegue que el motor
// (`block.alternatingEmom`, `block.supersetFold`), así que la ficha y el entreno no pueden discrepar: si el
// bloque degrada a series rectas, degrada en los dos.

/// Todo el cuerpo: los bloques principales y, debajo, el calentamiento y la vuelta a la calma plegados.
struct CuerpoDeBloquesPrevia: View {
    let bloques: LecturaSesionPrevia.Bloques
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            ForEach(bloques.principales) { bloque in
                BloquePrevia(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
            }
            if !bloques.calentamiento.isEmpty {
                ListaPlegadaPrevia(titulo: "Calentamiento", items: bloques.calentamiento, alAbrirTecnica: alAbrirTecnica)
            }
            if !bloques.vueltaALaCalma.isEmpty {
                ListaPlegadaPrevia(titulo: "Vuelta a la calma", items: bloques.vueltaALaCalma, alAbrirTecnica: alAbrirTecnica)
            }
        }
    }
}

// MARK: - Un bloque

struct BloquePrevia: View {
    let bloque: WorkoutBlock
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(bloque.title) {
                if let formato = LecturaEjercicioPrevia.formato(de: bloque) {
                    InfoPill(text: formato, estilo: .acento)
                }
            }
            if let nota = bloque.coachNote, !nota.isEmpty {
                Text(nota)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let emom = bloque.alternatingEmom {
                RotacionPrevia(
                    titulo: "Alterna cada minuto",
                    cuenta: emom.rounds.flatMap { $0 > 0 ? "\($0) min" : nil },
                    turnos: turnosDelEmom(emom),
                    alAbrirTecnica: alAbrirTecnica
                )
            } else if let (pliegue, _) = bloque.supersetFold {
                // Lo que hay que saber ANTES de empezar es la FORMA: que se alternan, en qué orden entran y
                // cuántas rondas hay. Con series desiguales no se redondea: cada fila dice las suyas.
                RotacionPrevia(
                    titulo: "Se alternan",
                    cuenta: pliegue.rounds.flatMap { $0 > 0 ? LecturaEjercicioPrevia.rondas($0) : nil },
                    turnos: turnosDeLaSuperserie,
                    alAbrirTecnica: alAbrirTecnica
                )
            } else {
                ForEach(bloque.items) { item in
                    EjercicioPrevia(item: item, alAbrirTecnica: alAbrirTecnica)
                }
            }
        }
    }

    /// Una fila por movimiento de la rotación, con su trabajo e intensidad del MISMO `emomInterval` del vivo.
    private func turnosDelEmom(_ emom: Prescription) -> [RotacionPrevia.Turno] {
        let series = emom.sets ?? []
        return series.enumerated().map { i, serie in
            let intervalo = serie.emomInterval(fallbackMovement: "Movimiento", fallbackIsErg: serie.modality?.isErg ?? false)
            return RotacionPrevia.Turno(
                id: i,
                turno: LecturaEjercicioPrevia.turnoDelMinuto(i, de: series.count),
                movimiento: intervalo.movement,
                trabajo: intervalo.work,
                detalle: intervalo.detail,
                item: i < bloque.items.count ? bloque.items[i] : nil
            )
        }
    }

    /// El orden en que entran (1º, 2º…): la letra del coach (A1/A2) se consume al importar y no llega aquí.
    private var turnosDeLaSuperserie: [RotacionPrevia.Turno] {
        bloque.items.enumerated().map { i, item in
            let dosis = LecturaEjercicioPrevia.dosisDeSuperserie(item)
            return RotacionPrevia.Turno(id: i, turno: "\(i + 1)º", movimiento: item.exerciseName,
                                        trabajo: dosis.trabajo, detalle: dosis.carga, item: item)
        }
    }
}

// MARK: - La rotación (EMOM que alterna, superserie)

/// UNA tarjeta para una rotación: la cabecera dice que se alterna y cuánto dura, y cada fila el turno, el
/// movimiento y su dosis. Son la misma lectura, así que se pintan igual.
struct RotacionPrevia: View {
    struct Turno: Identifiable {
        let id: Int
        let turno: String
        let movimiento: String
        let trabajo: String?
        let detalle: String?
        let item: WorkoutItem?
    }

    let titulo: String
    let cuenta: String?
    let turnos: [Turno]
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // La cabecera va sobre el tinte del acento: el texto, en la tinta del tema (§11.2).
            FilaAdaptableDia(alineacion: .center) {
                HStack(spacing: Theme.Spacing.s) {
                    Image(systemName: "repeat").font(.system(size: 17, weight: .bold)).accessibilityHidden(true)
                    Text(titulo).papel(.etiqueta)
                }
            } derecha: {
                if let cuenta { Text(cuenta).papel(.notaPesada) }
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .background(Theme.Color.accentTint(sobre: Theme.Color.surface))
            .accessibilityElement(children: .combine)

            ForEach(turnos) { t in
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(t.turno).papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                    FilaAdaptableDia {
                        Text(t.movimiento)
                            .papel(.cuerpoFuerte)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    } derecha: {
                        // Un turno sin dosis declarada no pinta nada: el movimiento ya está dicho (§7).
                        VStack(alignment: .trailing, spacing: 2) {
                            if let trabajo = t.trabajo {
                                Text(trabajo).papel(.cuerpoFuerte).monospacedDigit().foregroundStyle(Theme.Color.foreground)
                            }
                            if let detalle = t.detalle {
                                Text(detalle).papel(.nota).foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                    if let item = t.item { BotonTecnicaPrevia(item: item, alAbrir: alAbrirTecnica) }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .overlay(alignment: .top) { Hairline() }
            }
        }
        .tarjetaDia()
    }
}

// MARK: - Lo estructural, plegado

/// El calentamiento o la vuelta a la calma como lista corta: una fila por ejercicio con su medida. Movilizar
/// la cadera se hace tan mal como una sentadilla si nadie enseña cómo: si el ejercicio trae ficha, la fila
/// entera la abre; sin ficha se queda en texto (nada que tocar, nada que prometa algo que no hay).
struct ListaPlegadaPrevia: View {
    let titulo: String
    let items: [WorkoutItem]
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(titulo)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.muted)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                    fila(item)
                        .overlay(alignment: .top) { if i > 0 { Hairline() } }
                }
            }
            .tarjetaDia()
        }
    }

    @ViewBuilder
    private func fila(_ item: WorkoutItem) -> some View {
        if LecturaEjercicioPrevia.tieneTecnica(item) {
            Button {
                Haptics.light()
                alAbrirTecnica(item)
            } label: {
                contenido(item)
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(LecturaEjercicioPrevia.tieneVideo(item) ? "Abre el vídeo de técnica" : "Abre la técnica")
        } else {
            contenido(item).accessibilityElement(children: .combine)
        }
    }

    private func contenido(_ item: WorkoutItem) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            FilaAdaptableDia {
                Text(item.exerciseName)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                if let resumen = LecturaEjercicioPrevia.resumenCorto(item) {
                    Text(resumen).papel(.nota).monospacedDigit().foregroundStyle(Theme.Color.muted)
                }
            }
            if LecturaEjercicioPrevia.tieneTecnica(item) {
                Image(systemName: LecturaEjercicioPrevia.tieneVideo(item) ? "play.circle.fill" : "info.circle.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
        .contentShape(Rectangle())
    }
}
