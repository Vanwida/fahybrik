import SwiftUI

// LA PANTALLA DE PLAN SIN COACH, PINTADA — el sujeto, las tarjetas y el anclaje que salen de una `LecturaLibre`
// ya resuelta. Igual que `PlanPantalla` con coach: ninguna carga, ninguna decide, ninguna conoce el store, y por
// eso la galería (`PlanGaleriaRenderTests`) puede pintar cada caso.
//
// El SUJETO cambia según lo que hay:
//   · sin nada medido → «Primero, saber dónde estás» (acento sólido: es lo que hay que hacer ahora) y la
//     acción es la primera marca;
//   · con carreras o marcas → lo que ya demuestran, en un tinte suave, con la acción de programar un entreno;
//   · en frío → esqueleto (jamás «sin datos» un instante y luego otra cosa).
//
// Sin coach: cero chat, comunicados, revisión ni tests. La única pieza que habla de un coach es la de conversión,
// la última y sin nombre. Altura `llena`: el sobrante entra en el sujeto (que crece) solo cuando no hay nada más
// que enseñar; con evidencia hay tarjetas debajo y el sujeto mide lo suyo.

struct AccionesDeLibre {
    var alAbrirMarca: (MarcaLibre) -> Void = { _ in }
    var alVerTodasLasMarcas: () -> Void = {}
    var alReintentarMarcas: () -> Void = {}
    var alPonerCarrera: () -> Void = {}
    var alImportar: () -> Void = {}
    var alHablarConUnCoach: () -> Void = {}
    var alAbrirSesion: (AthleteWeekDaySession) -> Void = { _ in }
    var alProgramar: () -> Void = {}
    var menuDeSesion: (AthleteWeekDaySession, SemanaDelPlan) -> AnyView = { _, _ in AnyView(EmptyView()) }
    var menuDelDia: (DiaDelPlan) -> AnyView = { _ in AnyView(EmptyView()) }
}

// MARK: - La pantalla entera

/// La pantalla del atleta libre: la columna que scrollea (`llena`) y el anclaje de abajo. Sin cromo: sin coach no hay
/// chat, y el historial y el ciclo son del plan que no tiene. Es lo que compone `FreePlanView` y pintan las `#Preview`.
struct PlanLibrePantalla: View {
    let l: LecturaLibre
    let acciones: AccionesDeLibre
    @Binding var seleccion: String?
    var reintentando = false

    var body: some View {
        FillingScreen {
            PlanLibreColumna(l: l, acciones: acciones, seleccion: $seleccion, reintentando: reintentando)
        }
        .anclando(si: PlanLibreAnclaje.hay(l)) { PlanLibreAnclaje(l: l, acciones: acciones) }
    }
}

// MARK: - El sujeto

struct SujetoLibrePlan: View {
    let l: LecturaLibre

    var body: some View {
        if l.cargando {
            SujetoPlanEsqueleto()
        } else if !l.tieneEvidencia {
            SujetoDia(tono: .accion, etiqueta: "Primero, saber dónde estás") {
                KickerDia("Plan")
                TituloDia("Primero, saber dónde estás.")
                ApoyoDia("Sin números no hay plan que valga. Traemos lo que ya has corrido y medimos el resto.")
            } abajo: {
                ApoyoDia("Tus marcas son tuyas. Sin cuenta de pago, sin tarjeta.")
            }
        } else if let e = l.evidencia, e.mejorTiempo != nil || e.mejor8km != nil {
            conCarreras(e).fixedSize(horizontal: false, vertical: true)
        } else {
            soloMarcas.fixedSize(horizontal: false, vertical: true)
        }
    }

    private func conCarreras(_ e: EvidenciaDeCarreras) -> some View {
        SujetoDia(tono: .info, etiqueta: "Lo que dicen tus carreras") {
            KickerDia("Lo que dicen tus carreras")
            if let f = e.mejorTiempo {
                TituloDia(PlanLibreCopy.reloj(f.tiempoS))
                ApoyoDia("Tu mejor tiempo de \(PlanLibreCopy.recuentoDeCarreras(e.carreras)) · \(PlanLibreCopy.dondeYCuando(f))\(f.categoria.map { " · \($0)" } ?? "")")
                // El tiempo de una pareja es suyo, pero no es una medida de él solo: decirlo es lo que permite enseñar
                // el número grande sin mentir.
                if f.equipo { ApoyoDia("Es el tiempo de la pareja. Lo que sí es tuyo solo, debajo.") }
            } else if let m = e.mejor8km {
                TituloDia(PlanLibreCopy.ritmoKm(m.ritmoSKm))
                ApoyoDia("Tu mejor ritmo en 8 km · \(m.lugar)")
            }
        } abajo: {
            VStack(alignment: .leading, spacing: 0) {
                if let m = e.mejor8km {
                    FilaEvidenciaPlan(
                        titulo: "Tus 8 km", valor: PlanLibreCopy.ritmoKm(m.ritmoSKm), extra: PlanLibreCopy.reloj(m.totalS),
                        nota: PlanLibreCopy.notaOchoKm(m))
                }
                if let t = e.transiciones {
                    FilaEvidenciaPlan(
                        titulo: "Tus transiciones", valor: PlanLibreCopy.reloj(t.segundos), extra: nil,
                        nota: "Lo que pierdes yendo de una estación a otra. Tu mejor registro, en \(t.lugar).")
                }
                if let progreso = PlanLibreCopy.lineaDeProgreso(e) {
                    Text(progreso)
                        .papel(.nota)
                        .foregroundStyle(TonoDia.info.papeles.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { Rectangle().fill(TonoDia.info.lineaInterior).frame(height: 1) }
                }
            }
        }
    }

    /// Solo marcas: lo que ya ha medido, con la mejor a la vista.
    @ViewBuilder
    private var soloMarcas: some View {
        let m = l.marcas.medidas.first
        SujetoDia(tono: .info, etiqueta: "Tus marcas") {
            KickerDia("Tus marcas")
            TituloDia(m?.valor ?? "")
            ApoyoDia((m?.etiqueta ?? "") + (m?.cuando.map { " · \($0)" } ?? ""))
        } abajo: {
            ApoyoDia("Tus marcas son tuyas. Sin cuenta de pago, sin tarjeta.")
        }
    }
}

// MARK: - La columna

struct PlanLibreColumna: View {
    let l: LecturaLibre
    let acciones: AccionesDeLibre
    @Binding var seleccion: String?
    /// El catálogo de marcas se está pidiendo otra vez (tras «Reintentar»).
    var reintentando = false

    private var sinEvidencia: Bool { !l.tieneEvidencia }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            // Solo sin nada que enseñar (o en frío) el sujeto se lleva el sobrante: es el único contenido.
            SujetoLibrePlan(l: l)
                .frame(maxHeight: sinEvidencia || l.cargando ? .infinity : nil)
            if l.cargando {
                TarjetasPlanEsqueleto()
            } else {
                tarjetas
            }
        }
        .padding(EdgeInsets(top: 14, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xl, trailing: Theme.Spacing.pantalla))
    }

    @ViewBuilder
    private var tarjetas: some View {
        switch l.carrera {
        case let .fijada(carrera): TarjetaCarreraPlan(carrera: carrera)
        case .sinObjetivo: TarjetaSinCarreraPlan(alAbrir: acciones.alPonerCarrera)
        }
        if let vo2 = l.vo2 { TarjetaVo2Plan(vo2: vo2) }
        if !sinEvidencia, let semana = l.semanaBloqueada { TarjetaSemanaBloqueadaPlan(semana: semana) }
        if !sinEvidencia {
            if l.marcas.falloCatalogo && l.marcas.medidas.count + l.marcas.faltan.count == 0 {
                TarjetaCatalogoCaidoPlan(reintentando: reintentando, alReintentar: acciones.alReintentarMarcas)
            } else {
                TarjetaMarcasPlan(medidas: l.marcas.medidas, faltan: l.marcas.faltan, alAbrir: acciones.alAbrirMarca, alVerTodas: acciones.alVerTodasLasMarcas)
            }
        }
        if l.puedeImportar { TarjetaImportarPlan(alAbrir: acciones.alImportar) }
        if sinEvidencia {
            if !l.marcas.arranque.isEmpty {
                TarjetaArranquePlan(pasos: l.marcas.arranque, alAbrir: acciones.alAbrirMarca)
            } else if l.marcas.falloCatalogo {
                TarjetaCatalogoCaidoPlan(reintentando: reintentando, alReintentar: acciones.alReintentarMarcas)
            }
        }
        if let semana = l.semana {
            SemanaPropiaPlan(
                semana: semana, hoyIso: l.hoyIso, conBoton: l.accion != .programar, seleccion: $seleccion,
                alAbrir: acciones.alAbrirSesion, alProgramar: acciones.alProgramar,
                menuDeSesion: acciones.menuDeSesion, menuDelDia: acciones.menuDelDia)
        }
        if !sinEvidencia { TarjetaConversionPlan(alHablar: acciones.alHablarConUnCoach) }
    }
}

// MARK: - El anclaje

/// La acción anclada del atleta libre: la primera marca («▶ Empezar por el 1 km») o programar un entreno («+»).
struct PlanLibreAnclaje: View {
    let l: LecturaLibre
    let acciones: AccionesDeLibre

    static func hay(_ l: LecturaLibre) -> Bool { l.cargando || l.accion != nil }

    var body: some View {
        if l.cargando {
            AccionAncladaPlanEsqueleto(conMenu: false)
        } else if let accion = l.accion {
            switch accion {
            case let .medir(marca):
                AccionAncladaPlan(
                    texto: "Empezar por \(PlanLibreCopy.nombreEnBoton(marca.etiqueta))", glifo: .play,
                    glifoAlFinal: false, enCurso: false, conMenu: false,
                    alTocar: { acciones.alAbrirMarca(marca) }, menu: { EmptyView() })
            case .programar:
                AccionAncladaPlan(
                    texto: "Programar entreno", glifo: .mas,
                    glifoAlFinal: false, enCurso: false, conMenu: false,
                    alTocar: acciones.alProgramar, menu: { EmptyView() })
            }
        }
    }
}
