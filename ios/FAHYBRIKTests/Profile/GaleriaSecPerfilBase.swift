import XCTest
import SwiftUI
@testable import FAHYBRIK

// LO QUE COMPARTEN LAS GALERÍAS DE LAS PANTALLAS QUE CUELGAN DE PERFIL: las variantes (claro, oscuro, con el
// acento de un club azul), cómo se monta una pantalla (empujada en una `NavigationStack`, o como hoja), los datos
// de ejemplo y dónde se dejan los PNG (`FAHYBRIK_CAPTURAS`).
//
// No son pruebas de píxeles: fallan si una pieza revienta al pintarse, y dejan las capturas donde se pueden mirar.

class GaleriaSecPerfilBase: XCTestCase {

    /// El alto de un iPhone 17 Pro: la ventana es del tamaño de la pantalla y el scroll hace el resto.
    static let altoDelTelefono: CGFloat = 874

    struct Variante {
        let nombre: String
        let oscuro: Bool
        let club: ClubTheme?
    }

    static let variantes: [Variante] = [
        Variante(nombre: "claro", oscuro: false, club: nil),
        Variante(nombre: "oscuro", oscuro: true, club: nil),
        Variante(nombre: "claro-azul", oscuro: false, club: .pruebaAzul),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    // MARK: Datos de ejemplo

    func decodifica<T: Decodable>(_ json: String) -> T {
        // swiftlint:disable:next force_try
        try! APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    var nora: AthleteIdentity {
        decodifica(
            #"{"id":"a1","full_name":"Nora Ramos","dob":"1992-01-01","sex":"female","height_cm":172,"weight_kg":64.5,"training_experience_years":6,"goal_type":"improve_hyrox_mark","preferred_language":"es","max_hr_bpm":188}"#
        )
    }

    /// Un store como lo dejaría la caché: identidad, suscripción y pareja ya leídas.
    @MainActor
    func store(
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

    // MARK: Cómo se monta

    func empujada<V: View>(_ vista: V) -> some View {
        NavigationStack { vista }
            .background(Theme.Color.background)
    }

    /// Fotografía la vista en cada variante (o solo en «claro») y la deja como `nombre-variante`.
    @MainActor
    func captura<V: View>(
        _ vista: V, nombre: String, todas: Bool = true, tamano: DynamicTypeSize = .large, entera: Bool = true
    ) {
        for v in Self.variantes where todas || v.nombre == "claro" {
            let png = CapturaVentana.png(vista, alto: Self.altoDelTelefono, oscuro: v.oscuro, tamano: tamano, club: v.club, entera: entera)
            CapturaVentana.guarda(png, nombre: "\(nombre)-\(v.nombre)", en: self)
        }
    }
}
