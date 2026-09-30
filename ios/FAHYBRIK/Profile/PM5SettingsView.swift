import SwiftUI

// «CONCEPT2 PM5» — la subpágina de Perfil que dice qué PM5 hay emparejado (si hay alguno) y deja olvidarlo o buscar
// otro. El escáner Bluetooth (`PM5LiveStreamView`) es del entreno en vivo y no se toca: aquí solo se abre.
//
// Sin erg recordado no hay nombre que enseñar: el sujeto ya dice «sin dispositivo emparejado» y «Buscar y emparejar»
// es lo que se hace al respecto, así que no queda un guion ocupando su sitio (§7).

struct PM5SettingsView: View {
    @Bindable var store: PM5ConnectionStore
    @State private var showScanner: Bool = false

    var body: some View {
        PantallaPerfil(titulo: "Concept2 PM5") {
            SujetoDia(
                tono: store.hasRememberedDevice ? .neutro : .acento,
                etiqueta: store.hasRememberedDevice
                    ? "Dispositivo emparejado\(store.rememberedDeviceName.map { ": \($0)" } ?? "")"
                    : "Sin dispositivo emparejado"
            ) {
                KickerDia(store.hasRememberedDevice ? "Dispositivo emparejado" : "Sin dispositivo emparejado") {
                    if store.isConnected { InfoPill(text: "en directo", estilo: .velo, glifo: .check) }
                }
                if let name = store.rememberedDeviceName { TituloDia(name) }
                if store.isConnected { ApoyoDia("Streaming en directo") }
            } abajo: {
                Button {
                    Haptics.light()
                    showScanner = true
                } label: {
                    AccionDia("Buscar y emparejar", glifo: .lupa)
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
            if store.hasRememberedDevice {
                AccionTextoPerfil(titulo: "Olvidar este PM5", peligro: true) { store.forgetPaired() }
            }
        }
        .sheet(isPresented: $showScanner) {
            PM5LiveStreamView(store: store)
        }
    }
}
