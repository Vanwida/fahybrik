#if DEBUG
import SwiftUI

// LA GALERÍA DE «EL DÍA» — cada pieza del kit montada como la monta el diseño.
//
// No es una pantalla: es la muestra con la que se COMPRUEBA el kit. La leen dos sitios y por eso
// vive aquí y no duplicada:
//   · las `#Preview` de cada componente (al pie de su fichero), y
//   · `FAHYBRIKTests/Theme/GaleriaDiaRenderTests`, que la pinta con `ImageRenderer` en claro y en
//     oscuro con el acento de fábrica y con otro de club, y deja los PNG para revisarlos.
//
// Cada sección se compone como su pantalla del doble (`hoy-dia`, `perfil-rehecho`), con los
// mismos textos y las mismas medidas, para poder ponerlas al lado. Ninguna conoce el
// `AppDataStore` ni una pestaña: todo son datos y closures vacías.

enum GaleriaDia {

    // MARK: - La escala tipográfica

    struct Tipos: View {
        private static func muestra(_ papel: Theme.Typography.Papel) -> String {
            switch papel {
            case .etiqueta:     return "Cómo llegas hoy"
            case .kicker:       return "Hoy · Carrera"
            case .rotulo:       return "Marca reciente"
            case .nota:         return "Guardado desde las 9:40"
            case .notaFuerte:   return "Recuperado y listo"
            case .notaPesada:   return "68 ms"
            case .cuerpo:       return "Empieza por tus tests: así afina lo que viene."
            case .cuerpoFuerte: return "Tienes un entreno a medias"
            case .accion:       return "Ver en el Plan"
            case .seccion:      return "Contigo"
            case .saludo:       return "Buenos días, Nora"
            case .dato:         return "4:12/km"
            case .sujeto:       return "Series 6×800"
            case .cuentaHoy:    return "Hoy"
            case .cuenta:       return "42"
            }
        }

        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                ForEach(Theme.Typography.Papel.allCases, id: \.self) { papel in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.muestra(papel)).papel(papel).foregroundStyle(Theme.Color.foreground)
                        Text("\(String(describing: papel)) · \(Int(papel.medidas.tamano)) pt")
                            .papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - El sujeto, en sus siete tonos y en frío

    /// Una línea «sello + título + estado», como las del sujeto `hecho`.
    private static func lineaDeSesion(_ estado: SelloEstadoDia.Estado, _ titulo: String, _ detalle: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            SelloEstadoDia(estado: estado, tam: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).papel(.cuerpoFuerte)
                Text(detalle).papel(.nota)
            }
            .foregroundStyle(Theme.Color.foreground)
        }
    }

    /// Los cuatro tonos que dicen «esto toca ahora» o «esto ya está». Cada sujeto va a su alto natural: en una
    /// pantalla real hay UNO por pantalla y es el único que absorbe el sobrante (ver `PantallaCorta`).
    struct SujetosActivos: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.l) {
                SujetoDia(tono: .accion, etiqueta: "Series 6×800. Hoy Carrera. Por hacer. Ver en el Plan", alTocar: {}) {
                    KickerDia("Hoy · Carrera") { InfoPill(text: "Por hacer", estilo: .sobreAccion) }
                    TituloDia("Series 6×800")
                } abajo: {
                    HStack(spacing: 10) {
                        SelloEstadoDia(estado: .hecha, tam: 20, tinta: Theme.Color.accentOn)
                        Text("AM · Movilidad · Completada")
                            .papel(.notaFuerte).foregroundStyle(Theme.Color.accentOn)
                    }
                    AccionDia("Ver en el Plan")
                }
                SujetoDia(tono: .info, etiqueta: "Tu check-in de hoy") {
                    KickerDia("Check-in de hoy") { Text("2 de 5").papel(.rotulo).foregroundStyle(Theme.Color.foreground) }
                    TituloDia("¿Cómo has dormido?")
                    ApoyoDia("Con estas cinco respuestas sale tu cifra de hoy.")
                } abajo: {
                    AccionDia("Siguiente")
                }
                SujetoDia(tono: .ok, etiqueta: "Hecho hoy. Ver lo registrado", alTocar: {}) {
                    KickerDia("Tu día")
                    TituloDia("Hecho hoy")
                } abajo: {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        GaleriaDia.lineaDeSesion(.hecha, "Rodaje Z2", "Completada · AM")
                        GaleriaDia.lineaDeSesion(.parcial, "Fuerza · pierna", "A medias · PM")
                    }
                    AccionDia("Ver lo registrado")
                }
                SujetoDia(tono: .soporte, etiqueta: "Hoy descansas. Toca el jueves: Series. Ver en el Plan", alTocar: {}) {
                    KickerDia("Día de descanso")
                    TituloDia("Hoy descansas")
                } abajo: {
                    ApoyoDia("Toca jueves")
                    HStack(spacing: 10) {
                        ModalityDot(modality: "run", size: 12)
                        Text("Series 6×800").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                    }
                    AccionDia("Ver mañana en el Plan")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Los tres tonos de lo que no es un momento: primer día, pausa, error, y el esqueleto de la misma forma.
    struct SujetosDeEstado: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.l) {
                SujetoDia(tono: .acento, etiqueta: "Tu primer día. Empezar por mis tests", alTocar: {}) {
                    KickerDia("Primer día")
                    TituloDia("Tu primer día")
                    ApoyoDia("Tu coach aún no ha publicado tu plan. Empieza por tus tests (0 de 4): así afina lo que viene.")
                } abajo: {
                    AccionDia("Empezar por mis tests")
                }
                SujetoDia(tono: .neutro, etiqueta: "Tu plan está en pausa") {
                    KickerDia("Plan en pausa") { IconoDia(.pausa, tam: 30, peso: .regular).foregroundStyle(Theme.Color.foreground) }
                    TituloDia("Tu plan está en pausa")
                    ApoyoDia("Tu coach ha pausado tu plan. No es un fallo: no hay sesión hasta que lo retome.")
                } abajo: {
                    Button {} label: { AccionDia("Escribir a tu coach", glifo: .chat) }
                        .buttonStyle(PressScaleStyle(escala: 0.96))
                }
                SujetoDia(tono: .peligro, etiqueta: "No pudimos cargar tu plan", anuncia: true) {
                    KickerDia("Tu plan")
                    TituloDia("No pudimos cargar tu plan")
                    ApoyoDia("Revisa tu conexión e inténtalo de nuevo.")
                } abajo: {
                    Button {} label: { AccionDia("Reintentar", glifo: .reintentar) }
                        .buttonStyle(PressScaleStyle(escala: 0.96))
                }
                SujetoDia(tono: .neutro, etiqueta: "Cargando tu día") {
                    SkeletonBar(width: 130, height: 15, radius: 5).frame(minHeight: 32)
                    SkeletonBar(height: 44, radius: 10).frame(maxWidth: 300)
                    SkeletonBar(height: 44, radius: 10).frame(maxWidth: 200)
                } abajo: {
                    SkeletonBar(width: 190, height: 52, radius: 26)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - La cabecera de la pantalla y su línea del día

    struct Cabecera: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                HStack(spacing: 0) {
                    BotonCromoDia(.bandeja, etiqueta: "Del coach, 2 sin resolver", n: 2, accion: {})
                    Spacer()
                    Wordmark(size: 24)
                    Spacer()
                    BotonCromoDia(.chat, etiqueta: "Chat con tu coach, 12 sin leer", n: 12, accion: {})
                    BotonCromoDia(etiqueta: "Tu perfil", accion: {}) { Text("NR").papel(.notaPesada) }
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Martes 29 sep").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
                    Text("Buenos días, Nora").papel(.saludo).foregroundStyle(Theme.Color.foreground)
                }
                LineaDelDia(pasos: ["Antes", "Entreno", "Después"], actual: 1, etiquetaAccesible: "Tu día. Ahora: Entreno")
                LineaDelDia(pasos: ["Antes", "Entreno", "Después"], actual: 2, etiquetaAccesible: "Tu día. Ahora: Después")
            }
        }
    }

    // MARK: - Cómo llegas (el anillo de disposición) y «Contigo»

    struct Disposicion: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.tarjeta) {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("Cómo llegas hoy").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                            Spacer()
                            IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
                        }
                        HStack(spacing: Theme.Spacing.l) {
                            RecoveryRing(value: 84, size: 68, stroke: 6, color: Theme.Color.ok, animado: false)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Recuperado y listo").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                                HStack(spacing: 4) {
                                    IconoDia(.sube, tam: 16, peso: .bold)
                                    Text("+6 en 7 días").papel(.rotulo)
                                }
                                .foregroundStyle(Theme.Color.ok)
                            }
                        }
                        RegletaDia(n: 3, de: 4)
                    }
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("Contigo") { InfoPill(text: "2 cosas", estilo: .velo) }
                    VStack(spacing: 0) {
                        filaContigo(FichaDia(.pausa, tono: .realce), "Tienes un entreno a medias", "Series 6×800 · desde las 9:40",
                                    realce: true) { InfoPill(text: "Retomar", estilo: .solido) }
                        Hairline()
                        filaContigo(FichaDia(.cronometro), "Tus tests", "2 de 4 hechos", realce: false) {
                            RegletaDia(n: 2, de: 4, anchoSegmento: 14)
                        }
                    }
                    .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
                        .strokeBorder(Theme.Color.hairline, lineWidth: 1))
                }
            }
        }

        private func filaContigo<F: View, E: View>(
            _ ficha: F, _ titulo: String, _ detalle: String, realce: Bool, @ViewBuilder extra: () -> E
        ) -> some View {
            HStack(spacing: 14) {
                ficha
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    // Sobre el tinte del acento, la tinta del tema (ver `CabeceraTeselaDia.sobreTinte`).
                    Text(detalle).papel(.nota).foregroundStyle(realce ? Theme.Color.foreground : Theme.Color.muted)
                }
                Spacer(minLength: 0)
                extra()
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(minHeight: 72)
            .background { Rectangle().fill(realce ? Theme.Color.accentTint : SwiftUI.Color.clear) }
        }
    }

    // MARK: - Teselas y pastillas

    struct Teselas: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                TeselasDia {
                    TeselaDia(rotulo: "Marca reciente", alTocar: {}) {
                        Text("4:12/km").papel(.dato).foregroundStyle(Theme.Color.foreground)
                        HStack(alignment: .top, spacing: 4) {
                            IconoDia(.baja, tam: 16, peso: .bold)
                            Text("3 s más rápido").papel(.notaFuerte)
                        }
                        .foregroundStyle(Theme.Color.ok)
                    }
                    TeselaDia(rotulo: "Pasos hoy") {
                        Text("8.412").papel(.dato).foregroundStyle(Theme.Color.foreground)
                    }
                }
                TeselasDia {
                    TeselaDia(rotulo: "¿Te pruebas?", realce: true, alTocar: {}) {
                        Text("Un 1 km o un remo 500, y la app lo mide sola.")
                            .papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
                    }
                    TeselaDia(cabecera: { SkeletonBar(width: 96, height: 15, radius: 5) }, contenido: {
                        SkeletonBar(width: 100, height: 34, radius: 9)
                        SkeletonBar(width: 90, height: 15, radius: 5)
                    })
                }
                HStack(spacing: Theme.Spacing.s) {
                    InfoPill(text: "Neutro")
                    InfoPill(text: "Acento", estilo: .acento)
                    InfoPill(text: "Sólido", estilo: .solido, glifo: .check)
                    InfoPill(text: "Velo", estilo: .velo)
                }
                HStack(spacing: Theme.Spacing.m) {
                    ForEach(SelloEstadoDia.Estado.allCases, id: \.self) { SelloEstadoDia(estado: $0) }
                    CoachAvatar(initials: "NR", size: 56, relleno: true)
                    CoachAvatar(initials: "", size: 56, relleno: true)
                        .overlay(alignment: .bottomTrailing) {
                            ChapitaDia(.camara, tam: 26, conSombra: true).offset(x: 4, y: 4)
                        }
                }
                VStack(spacing: Theme.Spacing.s) {
                    RegletaDia(n: 3, de: 8)
                    RegletaDia(n: 0, de: 4)
                    RegletaDia(n: 9, de: 24)
                }
            }
        }
    }

    // MARK: - El póster

    private static func lineaDeSimulacion(_ texto: String) -> some View {
        HStack(spacing: 8) {
            IconoDia(.calendario, tam: 18).foregroundStyle(Theme.Color.accentText)
            Text(texto).papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 10)
        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.foreground.opacity(0.22)).frame(height: 1) }
    }

    struct Posters: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.l) {
                PosterDia(foto: BrandImagery.raceCardBackgrounds[0], etiqueta: "Camino a HYROX Barcelona. Faltan 42 días", alTocar: {}) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Camino a la carrera").papel(.kicker).foregroundStyle(Theme.Color.foreground).frame(minHeight: 32)
                        Text("HYROX Barcelona").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer(minLength: 10)
                    HStack(alignment: .bottom) {
                        CuentaAtrasDia(dias: 42)
                        Spacer(minLength: 12)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Objetivo").papel(.rotulo)
                            Text("sub 65 min").papel(.accion)
                        }
                        .foregroundStyle(Theme.Color.foreground)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .panelSobreFoto()
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Construcción").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        RegletaDia(n: 3, de: 8)
                        GaleriaDia.lineaDeSimulacion("Simulación HYROX jueves")
                    }
                }
                PosterDia(foto: BrandImagery.raceCardBackgrounds[1], etiqueta: "Camino a HYROX Barcelona. Es hoy") {
                    Text("Camino a la carrera").papel(.kicker).foregroundStyle(Theme.Color.foreground).frame(minHeight: 32)
                    Spacer(minLength: 10)
                    CuentaAtrasDia(dias: 0)
                }
                PosterDia(foto: BrandImagery.raceCardBackgrounds[2], etiqueta: "Elige tu carrera objetivo", alTocar: {}) {
                    Text("Camino a la carrera").papel(.kicker).foregroundStyle(Theme.Color.foreground).frame(minHeight: 32)
                    TituloDia("Elige tu carrera objetivo")
                    ApoyoDia("Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo.")
                    Spacer(minLength: 10)
                    AccionDia("Busca tu carrera", glifo: .lupa)
                }
            }
        }
    }

    // MARK: - Una pantalla corta: el sujeto se lleva el sobrante

    /// La estrategia `llena` (CONTRATO-UI §6.1) a la vista: la pantalla es más alta que su contenido y el
    /// sobrante entra en el propio sujeto, entre el título y la acción, no en una cola debajo. `alto` es el
    /// del lienzo útil del iPhone 17 Pro (781 pt) menos los márgenes del marco de la galería.
    struct PantallaCorta: View {
        static let alto: CGFloat = 781 - 2 * 20

        var body: some View {
            VStack(spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Martes 29 sep").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
                    Text("Buenos días, Nora").papel(.saludo).foregroundStyle(Theme.Color.foreground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                SujetoDia(tono: .soporte, etiqueta: "Hoy descansas. Ver el Plan", alTocar: {}) {
                    KickerDia("Día de descanso")
                    TituloDia("Hoy descansas")
                } abajo: {
                    ApoyoDia("No hay nada publicado después de hoy.")
                    AccionDia("Ver el Plan")
                }
                TeselasDia {
                    TeselaDia(rotulo: "Pasos hoy") {
                        Text("8.412").papel(.dato).foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: Self.alto, alignment: .top)
        }
    }

    // MARK: - El aviso

    struct Avisos: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.l) {
                AvisoDia(tono: .ok, texto: "Check-in guardado. Tu cifra se actualiza en unos segundos.")
                AvisoDia(tono: .fallo, texto: "No pudimos guardar el cambio. Inténtalo de nuevo.", alCerrar: {})
            }
        }
    }
}
#endif
