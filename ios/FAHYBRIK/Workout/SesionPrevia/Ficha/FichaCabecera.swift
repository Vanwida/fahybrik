import SwiftUI

// LA CABECERA DE LA FICHA — qué es esto y cuánto va a llevarte, en tres líneas.
//
// El kicker dice cuándo toca y quién lo montó; el título, qué es; la línea de meta, lo que se SABE: cuánto dura
// (solo la cifra que escribió el coach: una razón como «Dura lo que tardes» no es un dato y no se acentúa), cuántos
// bloques de trabajo hay (solo si son varios) y las dos cosas que cambian cómo se entrena: que sea una prueba y que
// sea en pareja. Todo lo decide `LecturaFicha.Cabecera`; aquí solo se pinta.

struct FichaCabecera: View {
    let cabecera: LecturaFicha.Cabecera

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(cabecera.kicker)
                .papel(.kicker)
                .foregroundStyle(Theme.Color.accentText)
                .fixedSize(horizontal: false, vertical: true)
            Text(cabecera.titulo)
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if hayMeta { meta }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var hayMeta: Bool {
        cabecera.duracion != nil || cabecera.bloquesDeTrabajo > 1 || cabecera.prueba || cabecera.pareja != nil
    }

    /// Todo en una línea si cabe; con el texto grande, la duración (que es una frase) sola en la suya y el resto debajo.
    private var meta: some View {
        ViewThatFits(in: .horizontal) {
            FlowLayout(spacing: FichaMedidas.entreDatosDeLaCabecera, lineSpacing: FichaMedidas.entreLineasDeLaCabecera) {
                duracion
                otrosDatos
            }
            VStack(alignment: .leading, spacing: FichaMedidas.entreLineasDeLaCabecera) {
                duracion
                FlowLayout(spacing: FichaMedidas.entreDatosDeLaCabecera, lineSpacing: FichaMedidas.entreLineasDeLaCabecera) {
                    otrosDatos
                }
            }
        }
    }

    @ViewBuilder
    private var duracion: some View {
        if let duracion = cabecera.duracion {
            HStack(spacing: Theme.Spacing.s - 2) {
                IconoDia(.cronometro, tam: 18).foregroundStyle(Theme.Color.muted)
                Text(duracion.texto)
                    .papel(duracion.llevaNumero ? .notaPesada : .nota)
                    .foregroundStyle(duracion.llevaNumero ? Theme.Color.foreground : Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var otrosDatos: some View {
        if cabecera.bloquesDeTrabajo > 1 {
            Text("\(cabecera.bloquesDeTrabajo) bloques")
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
        }
        if cabecera.prueba {
            InfoPill(text: "Prueba", estilo: .acento, glifo: .diana)
        }
        if let pareja = cabecera.pareja {
            InfoPill(text: pareja.rotulo, estilo: .superficie, glifo: .equipo)
        }
    }
}
