import Foundation

// Acción dual del shell Run (Death By, relevo). El live vive en `RunLiveShellView`.

/// La acción de la quinta fila: una, o las dos del Death By.
enum AccionDelHost {
    case una(titulo: String, unicaSalida: Bool, nota: String?, act: () -> Void)
    case deathBy(falle: () -> Void, logre: () -> Void)
}
