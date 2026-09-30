import SwiftUI

// EL BRIEFING DEL TEST DE SALTO — lo que el atleta lee ANTES de grabar: qué traer, cómo se coloca el
// teléfono, cómo se salta y en qué orden va a ir. El test solo existe si el coach lo programó — esta
// pantalla no se ofrece desde Marcas.
//
// Arquetipo Configurar (CONTRATO-UI §6.2): el sujeto es lo que vas a hacer, no unos campos; la acción
// —«Estoy listo»— va anclada abajo y se puede empezar sin tocar nada más. Es un cover a pantalla completa:
// la ✕ lo cierra.

struct JumpBriefView: View {
    let brief: JumpBriefDTO
    var onReady: () -> Void
    var onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer(minLength: 0)
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: onClose)
            }
            .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: 0, trailing: Theme.Spacing.s))

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    sujeto
                    bloque("Qué vas a necesitar") {
                        ListaDeTests {
                            ForEach(brief.needs) { need in
                                FilaDeBriefing(titulo: need.title, detalle: need.detail) {
                                    FichaDia(.check)
                                }
                            }
                        }
                    }
                    bloque("Cómo va a ir") {
                        ListaDeTests {
                            ForEach(brief.sequence) { step in
                                FilaDeBriefing(titulo: step.title, detalle: step.detail) {
                                    FichaDia(tono: .normal) {
                                        Text("\(step.n)").papel(.cuerpoFuerte)
                                    }
                                }
                            }
                        }
                    }
                    bloque("Cómo se salta") { lineas(brief.jumpCues) }
                    bloque("El teléfono") { lineas(brief.phone) }
                }
                .padding(EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xxl, trailing: Theme.Spacing.pantalla))
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .anchoredAction {
            BotonAccionTests("Estoy listo", glifo: .video, completa: true, alto: Theme.Size.accion, accion: onReady)
                // El pie ancla con 16 y el margen de las pantallas del día es 20: los 4 restantes van dentro.
                .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
        }
    }

    /// El sujeto: qué test es y qué vas a hacer, con lo que dura.
    private var sujeto: some View {
        SujetoDia(tono: .acento, etiqueta: "\(brief.title). \(brief.what). \(brief.durationLabel)") {
            KickerDia("Antes de grabar") {
                InfoPill(text: brief.durationLabel, estilo: .velo, glifo: .cronometro)
            }
            TituloDia(brief.title)
            ApoyoDia(brief.what)
        }
    }

    private func bloque<C: View>(_ titulo: String, @ViewBuilder _ contenido: () -> C) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            contenido()
        }
    }

    /// Líneas sueltas (cómo se salta, cómo va el teléfono): una marca y una frase por línea.
    private func lineas(_ textos: [String]) -> some View {
        ListaDeTests {
            ForEach(textos, id: \.self) { texto in
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    IconoDia(.check, tam: 18, peso: .bold)
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.top, 3)
                    Text(texto)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Theme.Spacing.l + 2)
                .padding(.vertical, Theme.Spacing.m)
                .frame(minHeight: Theme.Size.toque, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Una fila del briefing: su ficha a la izquierda, el título y lo que hay que saber debajo.
private struct FilaDeBriefing<Ficha: View>: View {
    let titulo: String
    let detalle: String
    @ViewBuilder let ficha: () -> Ficha

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            ficha()
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detalle)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l + 2)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
