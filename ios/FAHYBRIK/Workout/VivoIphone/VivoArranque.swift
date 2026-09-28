import Foundation

/// EL PUNTO DE PARTIDA DEL VIVO — lo que el vivo sabe y el motor no, cuando se
/// monta a mitad de sesión (espejo de `InicioSecuencia` + `Registro` del doble):
/// qué datos de qué series ya declaró el atleta en la anotación, qué dato tiene
/// encendido y el aviso de deshacer que estaba en pantalla. Por defecto, nada:
/// el vivo arranca como siempre. Lo usan las capturas (`VivoIphoneCapturasTests`)
/// para montar los escenarios del contrato sobre el motor real.
struct VivoArranque {
    /// Por id de paso (`Vivo.Paso.id`), los campos declarados.
    var declaradas: [String: Set<Vivo.CampoAnotar>] = [:]
    var foco: VivoFoco? = nil
    /// El aviso de deshacer que estaba en pantalla (sin acción que deshacer).
    var aviso: String? = nil
}
