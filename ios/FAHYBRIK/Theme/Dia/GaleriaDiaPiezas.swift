#if DEBUG
import SwiftUI

// LA GALERÍA DE «EL DÍA» — las piezas de acción, formulario y pastilla (segunda mitad de `GaleriaDia`).
//
// Misma regla que la primera: son la muestra con la que se COMPRUEBA el kit, la leen las `#Preview` de cada
// pieza y `GaleriaDiaRenderTests`, y ninguna conoce el `AppDataStore` ni una pestaña. Van en su propio
// fichero para que `GaleriaDia.swift` no crezca sin fin.

extension GaleriaDia {

    // MARK: - Las pastillas: lecturas (`InfoPill`)

    /// Todos los estilos de pastilla, en un sujeto neutro y dentro del sujeto de acción (donde el `dato` cambia de tinta).
    struct Pastillas: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                FlowLayout(spacing: Theme.Spacing.s) {
                    InfoPill(text: "Neutro")
                    InfoPill(text: "Acento", estilo: .acento)
                    InfoPill(text: "Sólido", estilo: .solido, glifo: .check)
                    InfoPill(text: "Velo", estilo: .velo)
                    InfoPill(text: "Superficie", estilo: .superficie)
                    InfoPill(text: "Faltan 4 días", estilo: .tinta)
                    InfoPill(text: "Objetivo principal", estilo: .acento, glifo: .diana, tamGlifo: 14)
                    InfoPill(text: "Dobles", estilo: .velo, glifo: .equipo)
                    InfoPill(text: "Con Marta Vidal", estilo: .velo, glifo: .coach)
                }
                SujetoDia(tono: .neutro, etiqueta: "Pastillas de un dato dentro de un sujeto") {
                    KickerDia("Hoy · Fuerza")
                    FlowLayout(spacing: Theme.Spacing.s) {
                        InfoPill(text: "Por hacer", estilo: .estado, sello: .pendiente)
                        InfoPill(text: "AM", estilo: .dato)
                        InfoPill(text: "Libre", estilo: .dato)
                        InfoPill(text: "50 min", estilo: .dato, glifo: .cronometro, enfasis: true)
                    }
                } abajo: { EmptyView() }
                SujetoDia(tono: .accion, etiqueta: "Pastillas de un dato dentro del sujeto de acción") {
                    KickerDia("Hoy · Carrera") { InfoPill(text: "Por hacer", estilo: .sobreAccion) }
                    FlowLayout(spacing: Theme.Spacing.s) {
                        InfoPill(text: "AM", estilo: .dato)
                        InfoPill(text: "Duró 47 min", estilo: .dato, glifo: .cronometro)
                    }
                } abajo: { EmptyView() }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Las acciones

    /// La acción en sus tres rellenos y sus estados, el botón de texto en sus cuatro tonos, la pastilla de una cabecera
    /// y el «···».
    struct Acciones: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                HStack(spacing: Theme.Spacing.m) {
                    AccionDia("Ver en el Plan")
                    AccionDia("Reintentando", glifo: .reintentar, enCurso: true)
                }
                BotonAccionDia("Pegar el enlace", glifo: .enlace, relleno: .acento, glifoAlFinal: false, accion: {})
                BotonAccionDia("Empezar", glifo: .play, completa: true, alto: Theme.Size.accionAnclada, glifoAlFinal: false,
                               impacto: .medio, accion: {})
                BotonAccionDia(hoja: "Fijar como mi carrera objetivo", ocupado: false, textoOcupado: "Guardando…", voz: "Guardando", accion: {})
                BotonAccionDia(hoja: "Importar", activo: false, ocupado: false, textoOcupado: "Importando…", voz: "Importando", accion: {})
                BotonAccionDia(hoja: "Importar", ocupado: true, textoOcupado: "Importando…", voz: "Importando", accion: {})
                VStack(spacing: 0) {
                    BotonTextoDia("Ver 3 más", accion: {}, icono: { EmptyView() }) { GiroDia(abierto: false) }
                    BotonTextoDia("Crear objetivo personalizado", centrado: true, accion: {}) { IconoDia(.mas, tam: 20, peso: .bold) }
                    BotonTextoDia("Reintentar", tono: .tinta, accion: {})
                    BotonTextoDia("No soy yo", tono: .suave, centrado: true, accion: {}) { IconoDia(.sinPersona, tam: 20) }
                    BotonTextoDia("Eliminar carrera", tono: .peligro, centrado: true, accion: {}) { IconoDia(.papelera, tam: 20) }
                }
                .tarjetaDia(alAncho: true)
                HStack(spacing: Theme.Spacing.m) {
                    PastillaSeccionDia("Buscar carrera", glifo: .lupa, accion: {})
                    PastillaSeccionDia("Importar", glifo: .mas, accion: {})
                }
                HStack(spacing: Theme.Spacing.m) {
                    MenuDia(etiqueta: "Más acciones", opciones: { EmptyView() }) { ChapitaDia(.puntos, tam: Theme.Size.accionAnclada) }
                    MenuDia(etiqueta: "Acciones de la sesión", opciones: { EmptyView() }) {
                        IconoDia(.puntos, tam: 22, peso: .bold).foregroundStyle(Theme.Color.muted).frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    }
                }
            }
        }
    }

    // MARK: - El diálogo

    struct Dialogos: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.l) {
                DialogoDia("¿Salir del entreno?", apoyo: "Llevas 2 de 5 bloques hechos. Puedes guardar lo que has hecho o descartarlo.", alTocarFondo: {}) {
                    BotonAccionDia("Seguir entrenando", relleno: .acento, completa: true, accion: {})
                    ListaDia {
                        FilaDia(ficha: FichaDia(.pausa), titulo: "Guardar para luego", etiqueta: "Guardar para luego", alTocar: {}) {
                            Text("Pausa y guarda el progreso.").papel(.nota).foregroundStyle(Theme.Color.muted)
                        }
                    }
                    BotonTextoDia("Descartar entreno", tono: .peligro, centrado: true, accion: {}) { IconoDia(.papelera, tam: 20) }
                }
                .frame(height: 520)
                DialogoDia("¿Abandonar el entreno?", apoyo: "Se descartará lo que has registrado. Esto no se puede deshacer.", peligro: true) {
                    BotonAccionDia("Seguir entrenando", relleno: .acento, completa: true, accion: {})
                    BotonTextoDia("Abandonar y descartar", tono: .peligro, centrado: true, accion: {})
                }
                .frame(height: 420)
            }
        }
    }

    // MARK: - La opción que se elige

    struct Opciones: View {
        var body: some View {
            VStack(spacing: Theme.Spacing.s) {
                OpcionDia(.ubicacion, titulo: "Calle", detalle: "Los metros los pone el GPS.", elegida: true, alTocar: {})
                OpcionDia(.correr, titulo: "Cinta con conexión", detalle: "Los metros los pone la cinta.", elegida: false, alTocar: {})
                OpcionDia(.reloj, titulo: "Cinta sin conexión", detalle: "Los metros los pone tu reloj.", elegida: false, alTocar: {})
            }
        }
    }

    // MARK: - El chevron que gira

    struct Giros: View {
        var body: some View {
            HStack(spacing: Theme.Spacing.xl) {
                HStack { GiroDia(abierto: false); Text("Plegado").papel(.nota) }
                HStack { GiroDia(abierto: true); Text("Abierto").papel(.nota) }
                HStack { GiroDia(abierto: false, tam: 16, peso: .bold); Text("16 bold").papel(.nota) }
            }
            .foregroundStyle(Theme.Color.foreground)
        }
    }

    // MARK: - Filas y vuelta

    /// La fila que se toca (con estado, con detalle, con tinte, con su propia tarjeta) y el «‹ Volver».
    struct Filas: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                AtrasDia(texto: "Analíticas", accion: {})
                ListaDia {
                    FilaDia(ficha: FichaDia(.reloj), titulo: "Dispositivos y apps", etiqueta: "Dispositivos y apps. Apple Salud y COROS conectados",
                            alTocar: {}) {
                        Text("Apple Salud y COROS conectados").papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                    FilaDia(ficha: FichaDia(.tarjeta, tono: .peligro), titulo: "Tu pago está pendiente",
                            etiqueta: "Tu pago está pendiente. Míralo en tu suscripción", altoMinimo: 72, alTocar: {}) {
                        Text("Míralo en tu suscripción").papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                    FilaDia(ficha: FichaDia(.ajustes, tono: .aviso), titulo: "Cuenta", etiqueta: "Cuenta. Falta confirmar tu email",
                            fondo: Theme.Color.tinte(Theme.Color.warning, 0.09, sobre: Theme.Color.surface), alTocar: {}) {
                        Text("Falta confirmar tu email").papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
                    }
                }
                FilaDia(ficha: FichaDia(.diana), titulo: "Predicho contra real", etiqueta: "Predicho contra real", pista: "Abre la comparación",
                        aireVertical: Theme.Spacing.m + 2, enTarjeta: true, alTocar: {}) {
                    Text("Predijimos 1:12:04 · hiciste 1:10:31").papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - Formulario

    /// El campo (vacío, con foco, con aviso, con glifo), los chips de filtro, el segmento y el aviso en línea.
    struct Formulario: View {
        var body: some View {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CampoDia("Buscar", izquierda: { IconoDia(.lupa, tam: 20) }, derecha: { EmptyView() }) {
                    Text("Hyrox Barcelona").foregroundStyle(Theme.Color.foreground)
                }
                CampoDia("Enlace HYROX", enFoco: true, izquierda: { IconoDia(.enlace, tam: 20) }, derecha: { EmptyView() }) {
                    Text("https://…").foregroundStyle(Theme.Color.muted)
                }
                CampoDia("División", aviso: true) { Text("Ej. RX · Scaled").foregroundStyle(Theme.Color.muted) }
                FilaChipsDia("Familia") {
                    ChipFiltroDia(texto: "Todas", elegido: true, accion: {})
                    ChipFiltroDia(texto: "Hybrid", elegido: false, accion: {})
                    ChipFiltroDia(texto: "Running", elegido: false, accion: {})
                }
                SegmentoDia(items: [("individual", "Individual"), ("dobles", "Dobles"), ("relevos", "Relevos")],
                            valor: .constant("dobles"), etiqueta: "Formato", completo: true, conEtiqueta: true)
                AvisoEnLineaDia("No pudimos cargar el calendario. Revisa tu conexión e inténtalo de nuevo.") {
                    BotonTextoDia("Reintentar", tono: .tinta, accion: {})
                }
            }
        }
    }

    // MARK: - Una hoja (solo `#Preview`: `ImageRenderer` no dibuja un `ScrollView`)

    struct HojaDeEjemplo: View {
        var body: some View {
            MarcoDeHojaDia("Importar carrera", cerrar: {}) {
                Formulario()
            } accion: {
                BotonAccionDia(hoja: "Importar", ocupado: false, textoOcupado: "Importando…", voz: "Importando carrera", accion: {})
            }
        }
    }
}
#endif
