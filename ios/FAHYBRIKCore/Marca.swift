import Foundation

// LA MARCA, LADO SWIFT.
//
// Este código se vende a otros entrenadores, así que antes o después hay una
// SEGUNDA app con otro nombre y otro dominio. Hasta ahora el nombre visible
// estaba escrito a mano en una veintena de pantallas y el dominio en cuatro
// ficheros distintos (dos pantallas legales, la web de cuenta, el origen que
// valida el reproductor incrustado). Nada de eso rompe la build al olvidarse:
// sale a la cara del atleta —un permiso o una alerta nombrando a otra marca— o
// abre la web de otro.
//
// Los dos valores VIENEN DEL BUNDLE, y el bundle los recibe de `project.yml`
// (BRAND_DISPLAY_NAME / BRAND_WEB_DOMAIN). Es decir: la misma línea que pone el
// nombre bajo el icono y en las hojas de permisos del sistema pone el nombre en
// las alertas de la app. No hay dos verdades posibles.
//
// Compila en el teléfono Y en el reloj (vive en FAHYBRIKCore), así que la muñeca
// dice el mismo nombre sin repetirlo.
//
// LO QUE NO SALE DE AQUÍ, a propósito: el backend (`APIBase`, que se resuelve
// por configuración de build y puede apuntar a otro entorno sin cambiar de
// marca) y las claves de almacenamiento con prefijo `fahybrik.`, que están
// CONGELADAS — renombrarlas le borraría la sesión y el estado al atleta que ya
// tiene la app instalada. Ver docs/ios-clonabilidad.md.
enum Marca {

    /// Nombre visible al atleta, tal cual aparece bajo el icono y en Ajustes.
    ///
    /// Se lee de `CFBundleDisplayName`, que es LA misma clave que el sistema usa
    /// para nombrarnos en sus propias hojas de permiso. Así, el texto de la app
    /// y el del sistema no pueden discrepar.
    static let nombre: String = {
        let info = Bundle.main.infoDictionary
        if let n = info?["CFBundleDisplayName"] as? String, !n.isEmpty { return n }
        if let n = info?["CFBundleName"] as? String, !n.isEmpty { return n }
        // Último recurso inalcanzable en cualquier build de este repo:
        // `project.yml` escribe siempre CFBundleDisplayName en los tres bundles.
        // Existe para que un bundle mal formado degrade a un nombre, no a "".
        return "FAHYBRID"
    }()

    /// Dominio público de la marca (sin esquema y sin `www.`).
    ///
    /// Es el mismo valor que declaran los `applinks:` del entitlement, así que un
    /// enlace universal y la web que abre la app no pueden apuntar a sitios
    /// distintos.
    static let dominioWeb: String = {
        if let d = Bundle.main.object(forInfoDictionaryKey: "BrandWebDomain") as? String,
           !d.isEmpty {
            return d
        }
        return "fahybrid.com"
    }()

    /// Portada pública. Con `www.` porque es el host que sirve la landing.
    static var web: URL { URL(string: "https://www.\(dominioWeb)")! }

    /// Política de privacidad y términos. Las pantallas legales (bienvenida,
    /// acceso con Apple, perfil) enlazan aquí; antes cada una llevaba su literal.
    static var privacidad: URL { URL(string: "https://\(dominioWeb)/privacy")! }
    static var terminos: URL { URL(string: "https://\(dominioWeb)/terms")! }

    /// Rutas legales sin esquema, para el copy que las ENSEÑA en vez de
    /// enlazarlas (la ficha de Perfil pinta «fahybrid.com/privacy» como
    /// subtítulo). Mismo sitio, escrito una sola vez.
    static var privacidadTexto: String { "\(dominioWeb)/privacy" }
    static var terminosTexto: String { "\(dominioWeb)/terms" }

    /// Buzón de contacto que aparece en el aviso de privacidad.
    static var soporteEmail: String { "hello@\(dominioWeb)" }

    /// Página de cuenta / facturación en la web. La app NUNCA abre un checkout
    /// (Apple, guía 3.1.3(b)): abre la cuenta.
    static var cuentaWeb: URL { URL(string: "https://\(dominioWeb)/account")! }

    /// Origen que se le entrega al reproductor de YouTube incrustado. Tiene que
    /// ser un origen https real que el reproductor pueda validar, y el nuestro
    /// es el de la propia marca.
    static var origenIncrustado: String { "https://www.\(dominioWeb)" }

    /// Base del backend cuando el Info.plist no trae `FahybrikApiBase`.
    ///
    /// No es la fuente normal —eso es `APIBase.url`, que se resuelve por
    /// configuración de build— sino el suelo para un bundle sin la clave. Se
    /// deriva del dominio de marca para que un clon no acabe hablando con el
    /// backend de otro por un literal olvidado.
    static var apiPorDefecto: URL { URL(string: "https://app.\(dominioWeb)")! }
}
