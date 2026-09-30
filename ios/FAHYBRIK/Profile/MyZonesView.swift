import SwiftUI

// «MIS ZONAS» — el atleta ve sus PROPIAS bandas de ritmo por modalidad, igual que las enseña la calculadora
// de su coach. Sale de GET /api/athlete/zones (solo lectura). AGNÓSTICO: los códigos, las etiquetas y los
// colores de zona son los que guardó el coach, así que la pantalla pinta el esquema que use (nunca cablea
// cuántas zonas hay ni su paleta).
//
// Estados honestos: esqueleto con la forma de la lista mientras carga, un vacío con su salida cuando aún no
// hay test (ni bandas inventadas) y un error con su reintento cuando falla la carga. El test que produjo
// un perfil se enseña (nombre + fecha) como una nota, porque aún no hay un endpoint de historial.
//
// La vista se parte en CONTENEDOR (pide los datos) y `MyZonesCuerpo` (pinta un estado ya resuelto).

/// Lo que devuelve `GET /api/athlete/zones`, ya desempaquetado.
struct ZonasDelAtleta {
    var modalities: [ZoneModalityProfile]
    /// The five HR bands the SERVER resolved. Nil = no anchor, so no zones — the screen says exactly that
    /// instead of showing bands off an invented FCmáx.
    var hr: HRZoneProfile?

    var estaVacio: Bool { modalities.isEmpty && hr == nil }
}

struct MyZonesView: View {
    let bearer: String?

    @State private var carga: CargaDePantallaPerfil<ZonasDelAtleta> = .cargando
    @State private var showRegister = false

    var body: some View {
        MyZonesCuerpo(
            carga: carga,
            bearer: bearer,
            alRegistrar: { showRegister = true },
            alReintentar: { Task { await load() } }
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showRegister = true
                } label: {
                    Label("Registrar test", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .accessibilityLabel("Registrar un test")
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterTestView(bearer: bearer) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        guard let bearer else { carga = .error; return }
        if case .error = carga { carga = .cargando }
        do {
            let zones = try await ZonesService.fetch(bearer: bearer)
            carga = .datos(ZonasDelAtleta(modalities: zones.modalities, hr: zones.hr))
        } catch {
            carga = .error
        }
    }
}

/// Lo que se pinta de «Mis zonas» con el estado ya resuelto.
struct MyZonesCuerpo: View {
    let carga: CargaDePantallaPerfil<ZonasDelAtleta>
    var bearer: String?
    var alRegistrar: () -> Void = {}
    var alReintentar: () -> Void = {}

    var body: some View {
        switch carga {
        case .cargando:
            PantallaPerfil(titulo: "Mis zonas") { EsqueletoDeFilasPerfil(filas: 6, conFicha: false) }
        case .error:
            PantallaPerfil(titulo: "Mis zonas", alto: .llena) {
                ErrorDePantallaPerfil(kicker: "Mis zonas", titulo: "No pudimos cargar tus zonas", alReintentar: alReintentar)
            }
        case let .datos(zonas) where zonas.estaVacio:
            PantallaPerfil(titulo: "Mis zonas", alto: .llena) {
                VacioDePantallaPerfil(
                    kicker: "Mis zonas",
                    titulo: "Aún no tienes zonas",
                    apoyo: "Registra un test de ritmo (o pídeselo a tu coach) y calcularemos tus bandas al momento.",
                    accion: ("Registrar test", .mas, alRegistrar)
                )
            }
        case let .datos(zonas):
            PantallaPerfil(titulo: "Mis zonas") {
                Text("Tus bandas de ritmo por modalidad. Cuando un entreno te pide una zona, este es el ritmo real que te toca.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(zonas.modalities) { SeccionDeModalidad(modalidad: $0) }
                SeccionDePulso(hr: zonas.hr, bearer: bearer)
            }
        }
    }
}

// MARK: - Una modalidad

private struct SeccionDeModalidad: View {
    let modalidad: ZoneModalityProfile

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                TituloSeccionDia(modalidad.modalityLabel) { InfoPill(text: modalidad.paceUnitLabel, estilo: .velo) }
                if let fuente { NotaPerfil(fuente) }
            }
            GrupoPerfil {
                ForEach(modalidad.zones) { banda in
                    FilaDeZona(
                        codigo: banda.code, etiqueta: banda.label, rango: banda.rangeLabel,
                        color: Color(zoneHex: banda.color)
                    )
                }
            }
        }
    }

    /// «umbral 4:30 · 20 jun 2026»: solo las partes que de verdad están.
    private var fuente: String? {
        var parts: [String] = []
        if let threshold = modalidad.thresholdLabel { parts.append("umbral \(threshold)") }
        if let date = modalidad.recordedDateLabel { parts.append(date) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Una banda. La fila está aquí por UN número: el rango que tienes que correr. «Z4» es una etiqueta suya, no su
/// par; el rango manda a 17 pt fuerte y con cifras de ancho fijo, para que los seis se lean en columna.
private struct FilaDeZona: View {
    let codigo: String
    let etiqueta: String
    let rango: String
    /// El color que guardó el coach para esa zona (dato suyo, agnóstico). Sin color, un gris neutro.
    let color: Color?

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(color ?? Theme.Color.faint)
                .frame(width: 4, height: 36)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(codigo).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
                Text(etiqueta).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.s)
            Text(rango)
                .papel(.cuerpoFuerte)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.s)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(codigo), \(etiqueta), \(rango)")
    }
}

// MARK: - Pulso

/// Las bandas de FC, o la frase honesta de que no hay.
///
/// Esta sección es la razón de que la app dejara de calcular zonas: enseñaba bandas derivadas de una FC máx
/// que, para todos los atletas de la base, nadie había medido jamás. Ahora enseña lo que el servidor resolvió
/// desde el UMBRAL, y cuando no hay umbral que las ancle, lo dice y señala el test, en vez de inventar cinco
/// números verosímiles.
private struct SeccionDePulso: View {
    let hr: HRZoneProfile?
    let bearer: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if let hr {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    TituloSeccionDia("Zonas de FC") { InfoPill(text: Vocab.ppm, estilo: .velo) }
                    // El ancla, siempre. Una banda sobre un test medido y una inferida de un cumpleaños no son la
                    // misma afirmación, y el atleta tiene que poder distinguirlas. El aviso de «estimada» va en la
                    // marca (el punto ámbar), no en el color del texto.
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        if hr.estimated {
                            Circle().fill(Theme.Color.warning).frame(width: 10, height: 10).accessibilityHidden(true)
                        }
                        NotaPerfil("umbral \(hr.lthrBpm) ppm · \(hr.sourceLabel.lowercased())")
                    }
                }
                GrupoPerfil {
                    ForEach(hr.zones, id: \.zone) { banda in
                        FilaDeZona(
                            codigo: banda.code, etiqueta: banda.label, rango: banda.rangeLabel,
                            color: banda.hrZone?.color
                        )
                    }
                }
                // Tres niveles, tres frases. Una banda sobre su propio número y una sobre su cumpleaños no son la
                // misma afirmación, y agruparlas en «estimadas» decía que habíamos adivinado cuando nos lo había dicho.
                if let note = Self.aviso(hr) {
                    NotaPerfil(note)
                    EnlaceAlTestDeUmbral(bearer: bearer, hr: hr)
                }
            } else {
                TituloSeccionDia("Zonas de FC")
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Aún no tenemos tus zonas de pulso").papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    Text("Se calculan desde tu umbral, y todavía no lo sabemos. Pon tu fecha de nacimiento o tu FC máxima en el perfil para una primera estimación, o haz el test de umbral para tenerlas de verdad.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Theme.Spacing.l)
                .frame(maxWidth: .infinity, alignment: .leading)
                .tarjetaDia()
                EnlaceAlTestDeUmbral(bearer: bearer, hr: nil)
            }
        }
    }

    /// Qué decir bajo las bandas, según cómo se obtuvo el umbral. Nil cuando se MIDIÓ: entonces no hay nada que
    /// matizar ni que ofrecer, y la sección deja de insistir a quien ya hizo el test.
    static func aviso(_ hr: HRZoneProfile) -> String? {
        // `confidence` falta en payloads de antes de que existiera el escalón «declarado»; `estimated` es el
        // respaldo honesto para ésos.
        switch hr.confidence ?? (hr.estimated ? "estimated" : "measured") {
        case "measured":
            return nil
        case "declared":
            return "Están calculadas con el umbral que nos diste. Si haces el test de 30 min las ajustamos a lo que aguantas hoy."
        default:
            return "Son una estimación mientras no midas tu umbral. Un test de 30 min las ajusta a lo que aguantas de verdad."
        }
    }
}

/// La SALIDA de un umbral estimado (CONTRATO-UI §5: un estado que declara su límite ofrece la salida). Los dos
/// estados del pulso —«estimadas» y «todavía no las tenemos»— tienen el MISMO remedio, y hasta que esto existió
/// la pantalla nombraba el test de 30 min en prosa y dejaba al atleta sin nada que tocar. Empuja el centro de
/// tests, donde el test de umbral está a un «Probarme», en vez de lanzar un esfuerzo máximo desde unos ajustes.
private struct EnlaceAlTestDeUmbral: View {
    let bearer: String?
    let hr: HRZoneProfile?

    var body: some View {
        GrupoPerfil {
            NavigationLink {
                TestsHubView(bearer: bearer, hrZones: hr)
            } label: {
                FilaPerfil(glifo: .test, titulo: "Haz el test de umbral")
            }
            .filaTocablePerfil()
            .accessibilityLabel("Haz el test de umbral para medir tus zonas de pulso")
        }
    }
}

// Hex → Color mínimo para los colores de zona que manda el backend (agnóstico, dato del coach). Privado al
// fichero para no chocar con una utilidad de color más amplia. Acepta «#RRGGBB» / «RRGGBB» / «#RGB»; devuelve
// nil con cualquier otra cosa, de modo que quien llama cae en una muestra neutra en vez de pintar un color equivocado.
private extension Color {
    init?(zoneHex: String?) {
        guard var hex = zoneHex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
