import SwiftUI

// LAS PIEZAS DE LO HECHO — lo que comparten el historial y las fichas de un entreno ya hecho
// (`HistoryView`, `EntrenoSinSubirView`, `ExecutedWorkoutView`, `EntrenoHechoPorEjecucionView`).
//
// Las cuatro son pantallas completas que se abren encima de otra y se cierran con la ✕, y las
// cuatro tienen estados sin dato (cargando, vacío, error). Antes cada una se montaba su barra
// (una ✕ de 40 pt, un título de 15 o de 20 pt según el fichero) y su vacío con el
// `RedesignEmptyState` de 13 pt: la misma pregunta —«¿qué es esto y cómo salgo?»— contestada de
// cuatro maneras. Aquí se contesta una vez, con el kit del día.
//
// Candidatas a subir a `Theme/Dia` si otra pantalla secundaria las necesita (lo decide quien
// consolida el kit): la cabecera con ✕ de una pantalla completa y el sujeto de estado.

// MARK: - La cabecera

/// La cabecera de una pantalla completa de lo hecho: la etiqueta (si la hay), el título de
/// pantalla y el botón redondo de cerrar. Fija arriba: no se va con el scroll.
struct CabeceraDeLoHecho: View {
    /// Lo que va encima del título, en el acento del club («Sin subir»). Nil = solo el título.
    var etiqueta: String? = nil
    let titulo: String
    let alCerrar: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                if let etiqueta {
                    Text(etiqueta)
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.accentText)
                }
                Text(titulo)
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: {
                Haptics.light()
                alCerrar()
            })
        }
        // El círculo de 38 pt va centrado en su área táctil de 48: se le quita la mitad de la
        // diferencia al margen para que el círculo, y no el área invisible, caiga en el margen.
        .padding(.leading, Theme.Spacing.pantalla)
        .padding(.trailing, Theme.Spacing.pantalla - (Theme.Size.toque - 38) / 2)
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
        .background(Theme.Color.background)
    }
}

// MARK: - El sujeto de un estado sin dato

/// Un estado sin dato que enseñar (un error, un vacío) como sujeto del día: qué pasa, por qué y la
/// salida (CONTRATO-UI §5: un vacío siempre lleva salida). Es UNA decisión: mide lo suyo y quien lo
/// pone decide dónde cae el aire (§6.1 `centra`), en vez de una card enorme y vacía.
struct SujetoEstadoDeLoHecho: View {
    let tono: TonoDia
    let kicker: String
    let titulo: String
    let apoyo: String
    let accion: String
    var glifo: GlifoDia? = .flecha
    /// Algo falló: se anuncia a VoiceOver al aparecer.
    var anuncia = false
    let alTocar: () -> Void

    var body: some View {
        SujetoDia(tono: tono, etiqueta: titulo, anuncia: anuncia) {
            KickerDia(kicker)
            TituloDia(titulo)
            ApoyoDia(apoyo)
        } abajo: {
            Button {
                Haptics.light()
                alTocar()
            } label: {
                AccionDia(accion, glifo: glifo)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

extension SujetoEstadoDeLoHecho {
    /// El error de carga: tono de peligro, «Reintentar» y anuncio.
    static func error(kicker: String, titulo: String, apoyo: String, alReintentar: @escaping () -> Void) -> Self {
        Self(
            tono: .peligro, kicker: kicker, titulo: titulo, apoyo: apoyo,
            accion: "Reintentar", glifo: .reintentar, anuncia: true, alTocar: alReintentar
        )
    }
}

// MARK: - El esqueleto de una ficha

/// La ficha de un entreno hecho mientras llega: la misma silueta que la lectura que la sustituye
/// (título de la sesión, su día y la rejilla de totales), sin inventar ninguna cifra.
struct EsqueletoDeLoHecho: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SkeletonBar(width: 150, height: 15, radius: 5)
            SkeletonBar(height: 32, radius: 8).padding(.trailing, 60)
            SkeletonBar(width: 190, height: 17, radius: 5)
            TeselasDia {
                teselaVacia
                teselaVacia
            }
            .padding(.top, Theme.Spacing.m)
            TeselasDia {
                teselaVacia
                teselaVacia
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu entreno")
    }

    private var teselaVacia: some View {
        TeselaDia {
            SkeletonBar(width: 70, height: 15, radius: 5)
        } contenido: {
            SkeletonBar(width: 88, height: 32, radius: 8)
        }
    }
}

// MARK: - La ficha de estado de un detalle

/// El marco de un detalle de entreno hecho mientras NO hay lectura que pintar (cargando, sin
/// ejecución, error): la cabecera con la ✕ y el estado debajo. Las lecturas traen su propio cromo
/// y su propia salida, así que este marco solo existe en estos tres estados.
struct MarcoDeLoHecho<Contenido: View>: View {
    let titulo: String
    var etiqueta: String? = nil
    let alCerrar: () -> Void
    /// El estado es una decisión centrada (error, vacío) o un contenido que cae desde arriba
    /// (el esqueleto, que tiene la forma de lo que llega y no puede bailar al llegar).
    var centrado = true
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDeLoHecho(etiqueta: etiqueta, titulo: titulo, alCerrar: alCerrar)
            if centrado {
                CenteredScreen {
                    EmptyView()
                } lead: {
                    EmptyView()
                } content: {
                    contenido()
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.vertical, Theme.Spacing.l)
                }
            } else {
                ScrollView {
                    contenido()
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.s)
                        .padding(.bottom, Theme.Spacing.xxl)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }
}
