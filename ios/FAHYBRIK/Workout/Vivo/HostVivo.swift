import Foundation

// HostVivo eliminado (FH-107): un solo `RunLiveShellView` para todo el live.
// Solo queda el tipo de acción dual que usaba el host antiguo.

/// La acción de la quinta fila: una, o las dos del Death By.
enum AccionDelHost {
    case una(titulo: String, unicaSalida: Bool, nota: String?, act: () -> Void)
    case deathBy(falle: () -> Void, logre: () -> Void)
}
