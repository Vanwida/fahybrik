import SwiftUI
import PhotosUI
import UIKit

// MARK: - Foto de perfil
//
// La cara del atleta donde hasta hoy había iniciales. Un solo sitio para las
// tres cosas que puede hacer: elegirla de la galería, hacerla con la cámara y
// quitarla — y verla antes de confirmarla, porque lo que se previsualiza es
// EXACTAMENTE la imagen ya reducida que se va a subir.
//
// El estado se cuenta entero y sin mentir. Subir los bytes y que el servidor los
// dé por buenos son dos cosas distintas, así que la pantalla las enseña por
// separado y no canta "guardada" hasta que vuelve el perfil con la foto dentro.
// Si algo falla, dice el motivo y deja reintentar sin volver a elegir la foto.
struct FotoPerfilSheet: View {
    let bearer: String?
    let iniciales: String
    let fotoActual: String?
    let onGuardada: (AthleteIdentity) -> Void

    @Environment(\.dismiss) private var dismiss

    /// Lo que se ve confirmado antes de cerrar. Corto: el atleta ya está mirando
    /// su foto puesta, esto solo remata el gesto.
    private static let esperaAlCerrar: Duration = .seconds(0.8)

    /// Diámetro de la previsualización. Grande a propósito: es lo que le deja
    /// juzgar si esa foto le vale antes de dejarla puesta.
    private static let diametroPrevia: CGFloat = 168

    private enum Estado: Equatable {
        /// Nada en marcha: se puede elegir, hacer foto o quitar la que haya.
        case reposo
        /// Reduciendo y recomprimiendo lo que acaba de elegir.
        case preparando
        /// Foto lista y a la vista, TODAVÍA no es su foto de perfil.
        case elegida
        case subiendo(Double)
        case guardando
        case quitando
        case hecho(String)
        case error(String)
    }

    @State private var estado: Estado = .reposo
    /// La imagen ya reducida — lo que se ve y lo que se sube, la misma.
    @State private var previa: UIImage? = nil
    @State private var jpeg: Data? = nil
    @State private var seleccion: PhotosPickerItem? = nil
    /// El selector de galería lleva su propio interruptor para no confundir
    /// "hoja abierta" con "foto ya elegida".
    @State private var mostrandoGaleria: Bool = false
    @State private var mostrarCamara: Bool = false
    @State private var confirmarQuitar: Bool = false

    private var camaraDisponible: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    /// Con algo en marcha no se toca nada más: ni se elige otra, ni se quita, ni
    /// se cierra por accidente a mitad de una subida.
    private var ocupado: Bool {
        switch estado {
        case .preparando, .subiendo, .guardando, .quitando, .hecho: return true
        case .reposo, .elegida, .error: return false
        }
    }

    private var hayFoto: Bool { fotoActual != nil }

    var body: some View {
        PantallaPerfil(titulo: "Ponle cara a tu perfil", sobretitulo: "Tu foto", cierre: .cerrar, cierreActivo: !ocupado) {
            NotaPerfil("Se ve en tu perfil y en tu inicio. Puedes cambiarla o quitarla cuando quieras.")
            previsualizacion
                .frame(maxWidth: .infinity)
            estadoActual
        } pie: {
            acciones
        }
        .interactiveDismissDisabled(ocupado)
        .photosPicker(
            isPresented: $mostrandoGaleria,
            selection: $seleccion,
            matching: .images,
            photoLibrary: .shared()
        )
        .onChange(of: seleccion) { _, item in
            guard let item else { return }
            Task { await prepararDesdeGaleria(item) }
        }
        .fullScreenCover(isPresented: $mostrarCamara) {
            // La misma cámara que ya usa el resto de la app; devuelve la foto y
            // se cierra sola.
            CameraPicker { imagen in aceptar(imagen) }
                .ignoresSafeArea()
        }
        .confirmationDialog(
            "¿Quitar tu foto?",
            isPresented: $confirmarQuitar,
            titleVisibility: .visible
        ) {
            Button("Quitar foto", role: .destructive) { Task { await quitar() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Tu avatar volverá a mostrar tus iniciales. Puedes poner otra cuando quieras.")
        }
    }

    // MARK: - Piezas

    /// El círculo grande. Debajo siempre el avatar de siempre (iniciales o
    /// silueta), y encima la foto: la recién elegida si la hay, si no la que ya
    /// tiene guardada. Así nunca se ve un hueco.
    private var previsualizacion: some View {
        ZStack {
            Circle().fill(Theme.Color.accent)
            if iniciales.isEmpty {
                IconoDia(.silueta, tam: Self.diametroPrevia * 0.42, peso: .semibold)
                    .foregroundStyle(Theme.Color.accentOn)
            } else {
                Text(iniciales)
                    .font(.system(size: Self.diametroPrevia * 0.34, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentOn)
            }
        }
        .frame(width: Self.diametroPrevia, height: Self.diametroPrevia)
        .overlay {
            if let previa {
                Image(uiImage: previa)
                    .resizable()
                    .scaledToFill()
                    .clipShape(Circle())
            } else {
                AvatarPhoto(url: fotoActual)
            }
        }
        .overlay(Circle().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var estadoActual: some View {
        switch estado {
        case .reposo:
            EmptyView()
        case .elegida:
            Text("Así se va a ver. Guárdala para dejarla puesta.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        case .preparando:
            trabajando("Preparando la foto…")
        case .subiendo(let avance):
            VStack(spacing: Theme.Spacing.s) {
                trabajando("Subiendo tu foto… \(Int((avance * 100).rounded()))%")
                ProgressView(value: avance)
                    .tint(Theme.Color.accent)
            }
        case .guardando:
            trabajando("Guardando en tu perfil…")
        case .quitando:
            trabajando("Quitando la foto…")
        case .hecho(let texto):
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                    .accessibilityHidden(true)
                Text(texto).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity)
        case .error(let motivo):
            VStack(spacing: Theme.Spacing.s) {
                AvisoEnLineaPerfil(tono: .peligro, texto: motivo)
                // Reintentar NO obliga a volver a elegir la foto: los bytes ya
                // preparados siguen aquí.
                if jpeg != nil {
                    AccionTextoPerfil(titulo: "Reintentar") { Task { await guardar() } }
                }
            }
        }
    }

    private func trabajando(_ texto: String) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            ProgressView()
            Text(texto).papel(.cuerpo).foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
    }

    /// Las acciones, ancladas abajo: UNA principal según dónde esté el atleta (elegir, guardar) y, debajo, lo que
    /// pesa menos. Con algo en marcha nada se puede tocar.
    @ViewBuilder
    private var acciones: some View {
        // Ya guardada: no queda nada que ofrecer, la hoja se aparta sola.
        if case .hecho = estado {
            EmptyView()
        } else {
            VStack(spacing: Theme.Spacing.xs) {
                if previa != nil {
                    AccionAncladaPerfil(titulo: "Guardar foto", habilitada: !ocupado) {
                        Task { await guardar() }
                    }
                    AccionTextoPerfil(titulo: "Elegir otra") { descartarElegida() }
                        .disabled(ocupado)
                } else {
                    AccionAncladaPerfil(titulo: "Elegir de la galería", habilitada: !ocupado) {
                        mostrandoGaleria = true
                    }
                    if camaraDisponible {
                        AccionTextoPerfil(titulo: "Hacer una foto") { mostrarCamara = true }
                            .disabled(ocupado)
                    }
                    if hayFoto {
                        AccionTextoPerfil(titulo: "Quitar foto", peligro: true) { confirmarQuitar = true }
                            .disabled(ocupado)
                    }
                }
            }
        }
    }

    // MARK: - Flujo

    /// La galería entrega bytes. Decodificar una foto de 12 MP y redibujarla
    /// cuesta décimas, así que se hace FUERA del hilo principal: si no, la hoja
    /// se queda congelada justo después de elegir.
    private func prepararDesdeGaleria(_ item: PhotosPickerItem) async {
        estado = .preparando
        // Se suelta SIEMPRE al terminar, salga bien o mal: si la selección se
        // quedara puesta, volver a elegir esa misma foto no dispararía nada.
        defer { seleccion = nil }
        do {
            guard let original = try await item.loadTransferable(type: Data.self) else {
                fallar(AthletePhotoError.noSePudoPreparar)
                return
            }
            let reducida = await Task.detached(priority: .userInitiated) {
                AthletePhotoImage.jpegParaSubir(desde: original)
            }.value
            guard let reducida, let imagen = UIImage(data: reducida) else {
                fallar(AthletePhotoError.noSePudoPreparar)
                return
            }
            previa = imagen
            jpeg = reducida
            estado = .elegida
        } catch {
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    /// La cámara entrega la imagen ya decodificada y de un solo disparo: aquí
    /// reducirla es un pestañeo, no hace falta salir del hilo principal.
    private func aceptar(_ imagen: UIImage) {
        guard let reducida = AthletePhotoImage.jpegParaSubir(imagen),
              let vista = UIImage(data: reducida) else {
            fallar(AthletePhotoError.noSePudoPreparar)
            return
        }
        previa = vista
        jpeg = reducida
        estado = .elegida
    }

    private func descartarElegida() {
        Haptics.light()
        previa = nil
        jpeg = nil
        seleccion = nil
        estado = .reposo
    }

    private func guardar() async {
        guard let jpeg else { return }
        guard let bearer else { fallarSinSesion(); return }
        estado = .subiendo(0)
        do {
            let actualizada = try await AthletePhotoService.subir(bearer: bearer, jpeg: jpeg) { paso in
                switch paso {
                case .subiendo(let avance): estado = .subiendo(avance)
                case .guardando: estado = .guardando
                }
            }
            await cerrarConExito(actualizada, texto: "Foto guardada")
        } catch {
            Haptics.error()
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    private func quitar() async {
        guard let bearer else { fallarSinSesion(); return }
        estado = .quitando
        do {
            let actualizada = try await AthletePhotoService.quitar(bearer: bearer)
            await cerrarConExito(actualizada, texto: "Foto quitada")
        } catch {
            Haptics.error()
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    /// Solo aquí se da algo por hecho: con el perfil que devolvió el servidor en
    /// la mano. Se avisa al padre ANTES de la pausa para que el avatar de detrás
    /// ya esté cambiado cuando la hoja se aparta.
    private func cerrarConExito(_ identidad: AthleteIdentity, texto: String) async {
        Haptics.success()
        onGuardada(identidad)
        estado = .hecho(texto)
        try? await Task.sleep(for: Self.esperaAlCerrar)
        dismiss()
    }

    private func fallar(_ error: AthletePhotoError) {
        Haptics.error()
        estado = .error(error.mensaje)
    }

    /// Sin sesión no hay nada que guardar. No se calla ni se deja un botón que
    /// no hace nada: se dice, que es lo único honesto.
    private func fallarSinSesion() {
        Haptics.error()
        estado = .error("Tu sesión no está activa. Vuelve a entrar en la app e inténtalo otra vez.")
    }
}
