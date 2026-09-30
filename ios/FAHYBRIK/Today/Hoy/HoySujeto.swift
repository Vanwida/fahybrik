import SwiftUI

// EL SUJETO — el momento del día, en grande.
//
// `LecturaHoy.momento` decide cuál es; aquí solo se pinta, con `SujetoDia` (el bloque editorial con
// el tinte de su momento) y su única acción. NINGUNO empieza un entreno: el Plan es la única puerta
// (DECISIONS 6-ago). Las sesiones dicen su ESTADO y al tocarlas llevan al Plan; lo único que SÍ actúa
// aquí es lo que ya vivía en Inicio y no es «empezar la sesión del coach»: retomar lo guardado, montar
// un entreno libre y el check-in (`HoySujetoCheckin`).
//
// Vocabulario de estado: el de la app (`EstadoSesion.etiqueta`: Completada, A medias, Sin hacer, Por
// hacer), nunca uno nuevo.

struct HoySujeto: View {
    let lectura: LecturaHoy
    let momento: MomentoHoy
    let hayNotaEnElCheckin: Bool
    let acciones: HoyAcciones

    var body: some View {
        switch momento {
        case .cargando:
            SujetoCargando()
        case .error:
            SujetoErrorDia(
                kicker: "Tu plan", titulo: "No pudimos cargar tu plan",
                apoyo: "Revisa tu conexión e inténtalo de nuevo.", alReintentar: acciones.reintentarCarga)
        case .libre:
            SujetoLibre(acciones: acciones)
        case .pausa:
            SujetoPausa(coach: lectura.coach, acciones: acciones)
        case .retoma(let titulo, let desde, let sesion):
            SujetoRetoma(titulo: titulo, desde: desde, esDeHoy: sesion != nil, acciones: acciones)
        case .checkin:
            HoySujetoCheckin(
                sinCifra: { if case .sinDatos = lectura.disposicion { return true }; return false }(),
                hayNota: hayNotaEnElCheckin,
                acciones: acciones
            )
        case .sesion(let sesion, let delDia):
            SujetoSesion(sesion: sesion, delDia: delDia, acciones: acciones)
        case .hecho(let sesiones):
            SujetoHecho(sesiones: sesiones, acciones: acciones)
        case .descanso(let manana, let hayMas):
            SujetoDescanso(manana: manana, hayMasPublicado: hayMas, acciones: acciones)
        case .primerDia:
            SujetoPrimerDia(coach: lectura.coach, tests: lectura.testsDelPrimerDia, acciones: acciones)
        }
    }
}

// MARK: - Sesión de hoy

private struct SujetoSesion: View {
    let sesion: SesionHoy
    let delDia: [SesionHoy]
    let acciones: HoyAcciones

    private var kicker: String {
        "Hoy\(sesion.franja.map { " \($0.rawValue)" } ?? "") · \(sesion.modalidad.nombre)"
    }

    /// Las demás sesiones del día, sin la que es sujeto.
    private var otras: [SesionHoy] {
        var resto = delDia
        if let i = resto.firstIndex(of: sesion) { resto.remove(at: i) }
        return resto
    }

    var body: some View {
        SujetoDia(
            tono: .accion,
            etiqueta: "\(sesion.titulo). \(kicker). Por hacer. Ver en el Plan",
            alTocar: acciones.abrirPlan
        ) {
            KickerDia(kicker) { InfoPill(text: "Por hacer", estilo: .sobreAccion) }
            TituloDia(sesion.titulo)
            if sesion.libre { ApoyoDia("Libre · la montaste tú") }
        } abajo: {
            // La otra franja del día se dice, sin hacerla un segundo héroe (decisión del 6-ago).
            ForEach(Array(otras.enumerated()), id: \.offset) { _, otra in
                HStack(spacing: Theme.Spacing.m - 2) {
                    SelloEstadoDia(estado: otra.estado.sello, tam: 20, tinta: Theme.Color.accentOn)
                    Text("\(otra.franja.map { "\($0.rawValue) · " } ?? "")\(otra.titulo) · \(otra.estado.etiqueta)")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.accentOn)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            AccionDia("Ver en el Plan")
        }
    }
}

// MARK: - Entreno a medias

private struct SujetoRetoma: View {
    let titulo: String
    let desde: String
    /// Es la sesión de hoy, ya empezada (no otra).
    let esDeHoy: Bool
    let acciones: HoyAcciones

    var body: some View {
        SujetoDia(
            tono: .accion,
            etiqueta: "Entreno a medias: \(titulo), guardado desde las \(desde). Retomar",
            alTocar: acciones.retomarEntreno
        ) {
            KickerDia("Entreno a medias") {
                IconoDia(.pausa, tam: 30, peso: .regular).foregroundStyle(Theme.Color.accentOn)
            }
            TituloDia(titulo)
            ApoyoDia("Guardado desde las \(desde)\(esDeHoy ? ". Es tu sesión de hoy, ya empezada." : ".")")
        } abajo: {
            AccionDia("Retomar entreno")
        }
    }
}

// MARK: - Sin coach: montar el entreno de hoy

private struct SujetoLibre: View {
    let acciones: HoyAcciones

    var body: some View {
        SujetoDia(
            tono: .accion,
            etiqueta: "Monta tu entreno de hoy. Calle, cinta, ergos y fuerza. Crear entreno",
            alTocar: acciones.crearEntrenoLibre
        ) {
            KickerDia("Hoy")
            TituloDia("Monta tu entreno de hoy")
            ApoyoDia("Calle, cinta, ergos y fuerza. Mézclalos como entrenes hoy.")
        } abajo: {
            AccionDia("Crear entreno", glifo: .mas)
        }
    }
}

// MARK: - Plan en pausa

private struct SujetoPausa: View {
    let coach: String?
    let acciones: HoyAcciones

    var body: some View {
        SujetoDia(tono: .neutro, etiqueta: "Tu plan está en pausa") {
            KickerDia("Plan en pausa") { IconoDia(.pausa, tam: 30, peso: .regular).foregroundStyle(Theme.Color.foreground) }
            TituloDia("Tu plan está en pausa")
            ApoyoDia("\(coach ?? "Tu coach") ha pausado tu plan. No es un fallo: no hay sesión hasta que lo retome.")
        } abajo: {
            Button(action: acciones.abrirChat) {
                AccionDia(coach.map { "Escribir a \($0)" } ?? "Escribir a tu coach", glifo: .chat)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
    }
}

// MARK: - Hecho hoy

private struct SujetoHecho: View {
    let sesiones: [SesionHoy]
    let acciones: HoyAcciones

    private var titulo: String {
        sesiones.contains { $0.estado == .hecha || $0.estado == .parcial } ? "Hecho hoy" : "Hoy, sin hacer"
    }

    var body: some View {
        SujetoDia(
            tono: .ok,
            etiqueta: "\(titulo). "
                + sesiones.map { "\($0.titulo), \($0.estado.etiqueta)" }.joined(separator: ". ")
                + ". Ver lo registrado",
            alTocar: acciones.abrirPlan
        ) {
            KickerDia("Tu día")
            TituloDia(titulo)
        } abajo: {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                ForEach(Array(sesiones.enumerated()), id: \.offset) { _, s in
                    HStack(alignment: .top, spacing: 10) {
                        SelloEstadoDia(estado: s.estado.sello, tam: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.titulo).papel(.cuerpoFuerte)
                            Text("\(s.estado.etiqueta)\(s.franja.map { " · \($0.rawValue)" } ?? "")").papel(.nota)
                        }
                        .foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
            AccionDia("Ver lo registrado")
        }
    }
}

// MARK: - Día de descanso

private struct SujetoDescanso: View {
    let manana: Manana?
    let hayMasPublicado: Bool
    let acciones: HoyAcciones

    private var etiqueta: String {
        if let manana {
            return "Hoy descansas. Toca \(manana.dia): \(manana.titulo), \(manana.modalidad.nombre). Ver en el Plan"
        }
        return hayMasPublicado
            ? "Hoy descansas. Tu coach ya ha publicado lo que viene. Ver el Plan"
            : "Hoy descansas. No hay nada publicado después de hoy. Ver el Plan"
    }

    var body: some View {
        SujetoDia(tono: .soporte, etiqueta: etiqueta, alTocar: acciones.abrirPlan) {
            KickerDia("Día de descanso")
            TituloDia("Hoy descansas")
        } abajo: {
            if let manana {
                VStack(alignment: .leading, spacing: 6) {
                    ApoyoDia("Toca \(manana.dia)")
                    HStack(spacing: 10) {
                        ModalityDot(kind: manana.modalidad, size: 12)
                        Text(manana.titulo)
                            .papel(.seccion)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Text(manana.modalidad.nombre).papel(.nota).foregroundStyle(Theme.Color.foreground)
                }
            } else {
                ApoyoDia(hayMasPublicado
                         ? "Tu coach ya ha publicado lo que viene."
                         : "No hay nada publicado después de hoy.")
            }
            AccionDia(manana.map { "Ver \($0.dia) en el Plan" } ?? "Ver el Plan")
        }
    }
}

// MARK: - Primer día

private struct SujetoPrimerDia: View {
    let coach: String?
    let tests: (hechos: Int, total: Int?)?
    let acciones: HoyAcciones

    private var apoyo: String {
        let base = "\(coach ?? "Tu coach") aún no ha publicado tu plan."
        guard let tests else { return "\(base) Mientras llega, monta un entreno tuyo." }
        let cuenta = tests.total.map { " (\(tests.hechos) de \($0))" } ?? ""
        return "\(base) Empieza por tus tests\(cuenta): así afina lo que viene."
    }

    var body: some View {
        SujetoDia(
            tono: .acento,
            etiqueta: "Tu primer día. \(tests == nil ? "Crea un entreno libre" : "Empieza por tus tests")",
            alTocar: tests == nil ? acciones.crearEntrenoLibre : acciones.abrirTests
        ) {
            KickerDia("Primer día")
            TituloDia("Tu primer día")
            ApoyoDia(apoyo)
        } abajo: {
            if tests == nil {
                AccionDia("Crear entreno libre", glifo: .mas)
            } else {
                AccionDia("Empezar por mis tests")
            }
        }
    }
}

// MARK: - Cargando

/// El arranque en frío: esqueleto con la MISMA forma que tendrá el sujeto. Ni un vacío ni una invitación
/// (aún no sabemos cuál de las dos toca), y nada salta cuando llegan los datos.
private struct SujetoCargando: View {
    var body: some View {
        SujetoDia(tono: .neutro, etiqueta: "Cargando tu día") {
            SkeletonBar(width: 130, height: 15, radius: 5).frame(minHeight: 32)
            SkeletonBar(height: 44, radius: 10)
            SkeletonBar(height: 44, radius: 10).frame(maxWidth: 200)
        } abajo: {
            SkeletonBar(width: 190, height: Theme.Size.accion, radius: Theme.Size.accion / 2)
        }
    }
}
