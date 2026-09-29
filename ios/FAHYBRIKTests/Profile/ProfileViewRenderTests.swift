import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA VISTA REAL DE PERFIL, LEYENDO UN STORE — el camino que las demás pruebas se saltan.
//
// `GaleriaPerfilRenderTests` pinta `PerfilContenido` con la lectura ya hecha; aquí se monta `ProfileView`
// entera, con su `AppDataStore` sembrado como lo dejaría la caché de un atleta, y sin sesión (bearer nil:
// ninguna petición sale, ningún `activate` vacía el store). Comprueba que la raíz LEE el store y traduce
// bien (lo que hay se pinta, lo que no ha llegado sigue en esqueleto: la batería, las marcas y el VO₂ se
// piden por su cuenta y sin red no contestan) y que un store en frío no revienta.

final class ProfileViewRenderTests: XCTestCase {

    private static let altoDelTelefono: CGFloat = 874

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private func decodifica<T: Decodable>(_ json: String) -> T {
        // swiftlint:disable:next force_try
        try! APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    @MainActor
    private func storeDeNora() -> AppDataStore {
        let store = AppDataStore()
        let identidad: AthleteIdentity = decodifica(
            #"{"id":"a1","full_name":"Nora Ramos","dob":"1992-01-01","height_cm":172,"weight_kg":64.5,"training_experience_years":6,"goal_type":"improve_hyrox_mark","hr_zones":{"lthr_bpm":163,"estimated":false,"source":"lthr_measured","source_label":"Medido en tu test de umbral","confidence":"measured","zones":[{"zone":1,"code":"Z1","label":"Recuperación","max_bpm":132,"range_label":"< 132 ppm"}]}}"#
        )
        store.setIdentity(identidad)
        var fuerza = Slice<[StrengthMaxProfile]>()
        fuerza.setLoaded([
            decodifica(#"{"exercise_slug":"dl","exercise_label":"Peso muerto","one_rm_kg":165,"unit":"kg","source":"athlete_test","history":[]}"#),
        ])
        store.strengthMaxes = fuerza
        var suscripcion = Slice<SubscriptionInfo>()
        suscripcion.setLoaded(SubscriptionInfo(subscribed: true, status: "past_due", tier: "coached", currentPeriodEnd: nil, cancelAtPeriodEnd: false))
        store.subscription = suscripcion
        return store
    }

    @MainActor
    private func pestana(_ store: AppDataStore, conCoach: Bool = true) -> some View {
        ProfileView(bearer: nil, hasCoach: conCoach, onSignOut: {})
            .environment(store)
            .background(Theme.Color.background)
    }

    @MainActor
    func testLaRaizLeeElStoreYLoQueNoHaLlegadoSigueEnEsqueleto() {
        let png = CapturaVentana.png(pestana(storeDeNora()), alto: Self.altoDelTelefono, entera: true)
        CapturaVentana.guarda(png, nombre: "vista-real-nora", en: self)
    }

    @MainActor
    func testLaRaizEnFrioNoReviventaYPintaSuEsqueleto() {
        let png = CapturaVentana.png(pestana(AppDataStore()), alto: Self.altoDelTelefono, entera: true)
        CapturaVentana.guarda(png, nombre: "vista-real-en-frio", en: self)
    }

    @MainActor
    func testLaRaizSinCoachNoPintaNingunaPiezaDeCoach() {
        let png = CapturaVentana.png(pestana(storeDeNora(), conCoach: false), alto: Self.altoDelTelefono, entera: true)
        CapturaVentana.guarda(png, nombre: "vista-real-sin-coach", en: self)
    }

    /// La misma lectura que pinta la vista, sin pintarla: con la suscripción en `past_due` el store de Nora
    /// reclama el pago, y sin coach no reclama nada.
    @MainActor
    func testElStoreDeNoraProduceLaLecturaQueEsperaElDiseno() {
        let store = storeDeNora()
        var leido = LoLeidoPerfil()
        leido.identidad = store.identity
        leido.fuerza = store.strengthMaxes
        leido.suscripcion = store.subscription
        let l = LecturaPerfil.desde(leido)
        XCTAssertEqual(DecidePerfil.pendientes(l), [.suscripcion(.pagoPendiente)])
        XCTAssertEqual(l.rendimiento.zonas, .contesto(ZonasPerfil(umbralPpm: 163, origen: "Medido en tu test de umbral")))
        XCTAssertEqual(l.rendimiento.bateria, .cargando, "sin pedir, sigue en el aire")

        leido.conCoach = false
        XCTAssertEqual(DecidePerfil.pendientes(LecturaPerfil.desde(leido)), [])
    }
}
