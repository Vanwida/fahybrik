import SwiftUI

// EL SUJETO DE PERFIL: EL ATLETA — un bloque editorial con el tinte de la marca, su foto, su nombre
// en el display de la marca y, debajo, sus propias métricas. Es lo único grande de la pantalla;
// todo lo demás se le subordina. Espejo de `screens/perfil-rehecho/identidad.tsx`.
//
// Cuatro momentos, que decide `DecidePerfil.modoIdentidad`:
//  · completo       nombre + al menos una métrica: subtítulo y «Editar perfil».
//  · porCompletar   recién dado de alta, o sin nombre aún: el sujeto se vuelve la invitación honesta
//                   a completarlo, con UNA salida.
//  · cargando       esqueleto con la MISMA forma (nada salta al llegar el dato).
//  · error          «No pudimos cargar tu perfil» con su «Reintentar».
//
// La acción es una pastilla de tinta invertida y sola: el sujeto es lo que miras, la acción es lo
// que tocas. La foto NO es una segunda acción del sujeto sino la chapita de su avatar: nunca se
// obliga a poner la cara.

struct SujetoDePerfil: View {
    let lectura: LecturaPerfil
    let alEditar: () -> Void
    let alFoto: () -> Void
    let alReintentar: () async -> Void

    var body: some View {
        switch DecidePerfil.modoIdentidad(lectura) {
        case .cargando:
            SujetoCargandoPerfil()
        case .error:
            SujetoErrorDia(
                kicker: "Tu perfil", titulo: "No pudimos cargar tu perfil",
                apoyo: "Revisa tu conexión e inténtalo de nuevo.", alReintentar: alReintentar)
        case .completo, .porCompletar:
            SujetoCompletoPerfil(lectura: lectura, alEditar: alEditar, alFoto: alFoto)
        }
    }
}

// MARK: - Completo

private struct SujetoCompletoPerfil: View {
    let lectura: LecturaPerfil
    let alEditar: () -> Void
    let alFoto: () -> Void

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    private var coach: String? { lectura.conCoach ? lectura.coach : nil }

    private var pareja: String? {
        if case let .conPareja(nombre)? = lectura.dobles { return nombre }
        return nil
    }

    var body: some View {
        let id = lectura.identidad
        let texto = DecidePerfil.subtituloIdentidad(id) ?? DecidePerfil.apoyoDeIdentidad(lectura)
        SujetoDia(tono: .acento, etiqueta: "Tu perfil") {
            cabecera(id)
            TituloDia(DecidePerfil.tituloIdentidad(id), ajuste: .reduce())
            if let texto { ApoyoDia(texto) }
        } abajo: {
            Button(action: alEditar) {
                AccionDia(DecidePerfil.accionIdentidad(lectura), glifo: .lapiz)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
    }

    /// La cara y, a su lado, lo que dice quién eres: el kicker y las marcas. Con el texto del sistema en
    /// tamaños de accesibilidad no hay ancho para las dos columnas (el nombre de tu pareja acababa en cuatro
    /// líneas de una sola palabra): las marcas pasan debajo de la cara.
    @ViewBuilder
    private func cabecera(_ id: IdentidadPerfil) -> some View {
        let avatar = AvatarDePerfil(iniciales: DecidePerfil.iniciales(id.nombre), fotoURL: id.fotoURL, alTocar: alFoto)
        let quien = VStack(alignment: .leading, spacing: 6) {
            KickerDia("Tu perfil")
            if let coach { InfoPill(text: "Con \(coach)", estilo: .velo, glifo: .coach) }
            if let pareja { InfoPill(text: TextosPerfil.unir("Dobles", "con \(pareja)"), estilo: .velo, glifo: .equipo) }
        }
        if tamanoDeTexto.isAccessibilitySize {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                avatar
                quien.frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(spacing: Theme.Spacing.l) {
                avatar
                quien.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: - Cargando y error

private struct SujetoCargandoPerfil: View {
    var body: some View {
        SujetoDia(tono: .neutro, etiqueta: "Cargando tu perfil") {
            HStack(spacing: Theme.Spacing.l) {
                SkeletonBar(width: AvatarDePerfil.tam, height: AvatarDePerfil.tam, radius: AvatarDePerfil.tam / 2)
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBar(width: 96, height: 15, radius: 5).frame(minHeight: 32)
                    SkeletonBar(width: 112, height: 32, radius: 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            SkeletonBar(height: 44, radius: 10).frame(maxWidth: 230)
            SkeletonBar(height: 17, radius: 6).frame(maxWidth: 300)
            SkeletonBar(height: 17, radius: 6).frame(maxWidth: 180)
        } abajo: {
            SkeletonBar(width: 190, height: 52, radius: 26)
        }
    }
}

// MARK: - Las piezas del sujeto

/// El avatar del atleta y la puerta a su foto: la cara del color de la marca con sus iniciales (o la
/// silueta si aún no hay nombre) y, encima, la foto cuando la hay. La chapita de cámara es lo que
/// cuenta que el círculo se toca.
struct AvatarDePerfil: View {
    static let tam: CGFloat = 88

    /// Vacías = todavía sin nombre: silueta.
    let iniciales: String
    let fotoURL: String?
    let alTocar: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            CoachAvatar(initials: iniciales, size: Self.tam, photoURL: fotoURL, relleno: true)
                .overlay(alignment: .bottomTrailing) {
                    ChapitaDia(.camara, tam: 34, conSombra: true).offset(x: 4, y: 4)
                }
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.94))
        .accessibilityLabel(fotoURL == nil ? "Poner tu foto de perfil" : "Cambiar tu foto de perfil")
    }
}
