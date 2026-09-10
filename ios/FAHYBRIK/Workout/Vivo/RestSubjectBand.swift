import SwiftUI

// Sujeto de descanso dentro del shell Run global — no una app aparte.
// `LiveOrientationStrip` vive en los apoyos del shell (`EntrenoVivoShellView`).

struct RestSubjectBand: View {
    let session: WorkoutSession

    var body: some View {
        RestSurface(session: session)
    }
}
