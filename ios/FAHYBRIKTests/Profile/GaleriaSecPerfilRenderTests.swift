import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE LAS PANTALLAS QUE CUELGAN DE PERFIL (las listas y los formularios), RENDERIZADA DE VERDAD.
//
// Igual que `GaleriaPerfilRenderTests` con la pestaña: no es una prueba de píxeles, es la herramienta de
// REVISIÓN. Falla si una pieza revienta al pintarse y deja los PNG (claro, oscuro, con el acento de un club
// azul y a un tamaño de texto de accesibilidad) donde se pueden abrir, en `FAHYBRIK_CAPTURAS`.
//
// Las pantallas se montan como las monta la app: dentro de una `NavigationStack` (la barra con su «‹»), o
// como hoja con su propio «Cerrar».
final class GaleriaSecPerfilRenderTests: XCTestCase {

    private static let altoDelTelefono: CGFloat = 874

    private struct Variante {
        let nombre: String
        let oscuro: Bool
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro", oscuro: false, club: nil),
        Variante(nombre: "oscuro", oscuro: true, club: nil),
        Variante(nombre: "claro-azul", oscuro: false, club: .pruebaAzul),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    // MARK: Datos de ejemplo

    private func decodifica<T: Decodable>(_ json: String) -> T {
        // swiftlint:disable:next force_try
        try! APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private var nora: AthleteIdentity {
        decodifica(
            #"{"id":"a1","full_name":"Nora Ramos","dob":"1992-01-01","sex":"female","height_cm":172,"weight_kg":64.5,"training_experience_years":6,"goal_type":"improve_hyrox_mark","preferred_language":"es","max_hr_bpm":188}"#
        )
    }

    /// Un store como lo dejaría la caché: identidad, suscripción y pareja ya leídas.
    @MainActor
    private func store(
        suscripcion: SubscriptionInfo? = SubscriptionInfo(subscribed: true, status: "active", tier: "coached", currentPeriodEnd: nil, cancelAtPeriodEnd: false),
        pareja: PartnerEnvelope? = PartnerEnvelope(source: nil, partner: nil, athleteModality: nil, sentInvitation: nil)
    ) -> AppDataStore {
        let store = AppDataStore()
        store.setIdentity(nora)
        if let suscripcion {
            var s = Slice<SubscriptionInfo>()
            s.setLoaded(suscripcion)
            store.subscription = s
        }
        if let pareja {
            var p = Slice<PartnerEnvelope>()
            p.setLoaded(pareja)
            store.partner = p
        }
        return store
    }

    private func invitacion(_ estado: String, dias: Int) -> SentInvitation {
        let caduca = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(dias) * 86_400 + 3_600))
        return SentInvitation(status: estado, inviteeEmail: "biel@correo.com", expiresAt: caduca)
    }

    // MARK: Cómo se monta

    private func empujada<V: View>(_ vista: V) -> some View {
        NavigationStack { vista }
            .background(Theme.Color.background)
    }

    @MainActor
    private func captura<V: View>(
        _ vista: V, nombre: String, todas: Bool = true, tamano: DynamicTypeSize = .large, entera: Bool = true
    ) {
        for v in Self.variantes where todas || v.nombre == "claro" {
            let png = CapturaVentana.png(vista, alto: Self.altoDelTelefono, oscuro: v.oscuro, tamano: tamano, club: v.club, entera: entera)
            CapturaVentana.guarda(png, nombre: "\(nombre)-\(v.nombre)", en: self)
        }
    }

    // MARK: Las puertas

    @MainActor
    func testEntreno() {
        captura(empujada(ProfileEntrenoView(bearer: nil, hasCoach: true, coachName: "Marta")), nombre: "01-entreno")
        captura(empujada(ProfileEntrenoView(bearer: nil, hasCoach: false, coachName: nil)), nombre: "01-entreno-sin-coach", todas: false)
    }

    @MainActor
    func testCuenta() {
        captura(empujada(ProfileCuentaView(bearer: "t", hasCoach: true, coachName: "Marta", partnerName: nil, onSignOut: {})), nombre: "02-cuenta")
        captura(empujada(ProfileCuentaView(bearer: "t", hasCoach: false, coachName: nil, partnerName: nil, onSignOut: {})), nombre: "02-cuenta-sin-coach", todas: false)
    }

    @MainActor
    func testAyudaYLegal() {
        captura(empujada(ProfileAyudaLegalView(bearer: nil, hasCoach: true)), nombre: "03-ayuda")
    }

    @MainActor
    func testIdentidad() {
        let conPareja = PartnerEnvelope(
            source: "doubles_pair",
            partner: decodifica(#"{"athlete_id":"p1","full_name":"Biel Puig"}"#),
            athleteModality: "dobles",
            sentInvitation: nil
        )
        let dobles = SubscriptionInfo(subscribed: true, status: "trialing", planType: "dobles", tier: "coached", currentPeriodEnd: nil, cancelAtPeriodEnd: false)
        let casos: [(String, AppDataStore)] = [
            ("individual", store()),
            ("dobles-sin-invitar", store(suscripcion: dobles)),
            ("invitacion-pendiente", store(suscripcion: dobles, pareja: PartnerEnvelope(source: nil, partner: nil, athleteModality: "dobles", sentInvitation: invitacion("pending", dias: 13)))),
            ("invitacion-caducada", store(suscripcion: dobles, pareja: PartnerEnvelope(source: nil, partner: nil, athleteModality: "dobles", sentInvitation: invitacion("expired", dias: -1)))),
            ("con-pareja", store(suscripcion: dobles, pareja: conPareja)),
            ("pago-pendiente", store(suscripcion: SubscriptionInfo(subscribed: true, status: "past_due", tier: "coached", currentPeriodEnd: nil, cancelAtPeriodEnd: false))),
        ]
        for (i, (id, store)) in casos.enumerated() {
            captura(
                empujada(ProfileIdentidadView(bearer: nil, hasCoach: true).environment(store)),
                nombre: String(format: "04-identidad-%02d-%@", i + 1, id), todas: i < 3
            )
        }
        captura(
            empujada(ProfileIdentidadView(bearer: nil, hasCoach: true).environment(AppDataStore())),
            nombre: "04-identidad-07-en-frio", todas: false
        )
    }

    @MainActor
    func testPrivacidad() {
        captura(empujada(ProfilePrivacidadView(bearer: nil)), nombre: "05-privacidad")
    }

    // MARK: Las hojas

    @MainActor
    func testEditarPerfil() {
        captura(EditProfileView(bearer: "t", identity: nora, onSaved: { _ in }), nombre: "06-editar-perfil")
        captura(EditProfileView(bearer: "t", identity: nil, onSaved: { _ in }), nombre: "06-editar-perfil-vacio", todas: false)
    }

    @MainActor
    func testHojasDeLectura() {
        captura(MethodologySheet(), nombre: "07-metodologia")
        captura(CoachSheet(coachName: "Marta Vidal"), nombre: "07-coach")
        captura(LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms(hasCoach: true)), nombre: "07-legal")
    }

    // MARK: A tamaño de texto de accesibilidad

    @MainActor
    func testATamanoDeTextoDeAccesibilidad() {
        let ax = DynamicTypeSize.accessibility3
        captura(empujada(ProfileEntrenoView(bearer: nil, hasCoach: true, coachName: "Marta")), nombre: "ax3-entreno", todas: false, tamano: ax, entera: false)
        captura(empujada(ProfileIdentidadView(bearer: nil, hasCoach: true).environment(store())), nombre: "ax3-identidad", todas: false, tamano: ax, entera: false)
        captura(EditProfileView(bearer: "t", identity: nora, onSaved: { _ in }), nombre: "ax3-editar-perfil", todas: false, tamano: ax, entera: false)
        captura(empujada(ProfilePrivacidadView(bearer: nil)), nombre: "ax3-privacidad", todas: false, tamano: ax, entera: false)
    }
}
