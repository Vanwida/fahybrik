import SwiftUI

// Where a run happens — the ONE decision the athlete makes before starting a run
// (Alex's mandate: "correr → dónde: cinta o exterior → cinta: conectar → empezar").
// Chosen in the FULL-SCREEN pre-start sequence (`RunPreStartFlow`, shared by the
// prescribed brief AND the free builder), carried on the session, and used to
// AUTO-OPEN the right live HUD on start — the athlete never lands on a generic
// screen with phantom GPS pace when they said "cinta".
enum RunEnvironment: String {
    case treadmill   // indoor — connect + drive the belt, GPS stays OFF
    case outdoor     // outside — GPS pace/map, no treadmill offer
}
