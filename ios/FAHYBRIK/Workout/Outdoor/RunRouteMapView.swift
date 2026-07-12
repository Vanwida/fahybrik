import SwiftUI
import MapKit
import CoreLocation

// The live map for an outdoor run (#64): the traversed GPS trace as a Fabrik-orange
// polyline that follows the athlete, with an HONEST GPS-quality badge. Non-
// interactive (a glance surface mid-run, not a map to pan) and auto-centred on the
// latest fix. Renders cleanly with no trace yet (searching → just the map + badge).

struct RunRouteMapView: View {
    let coordinates: [CLLocationCoordinate2D]
    let quality: GPSSignalQuality
    var paused: Bool = false

    /// Span (degrees) of the auto-follow window — ~450 m across, tight enough to read
    /// the immediate path without constant re-zoom.
    private static let followSpan = MKCoordinateSpan(latitudeDelta: 0.004, longitudeDelta: 0.004)

    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $camera, interactionModes: []) {
            if coordinates.count >= 2 {
                MapPolyline(coordinates: coordinates)
                    .stroke(Theme.Color.accent,
                            style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
            }
            if let last = coordinates.last {
                Annotation("", coordinate: last) { RunHeadDot(paused: paused) }
                    .annotationTitles(.hidden)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .overlay(alignment: .topLeading) {
            GPSQualityBadge(quality: quality).padding(Theme.Spacing.s)
        }
        .onChange(of: coordinates.count) { _, _ in recenter() }
        .onAppear { recenter() }
    }

    private func recenter() {
        guard let last = coordinates.last else { return }
        withAnimation(.easeInOut(duration: 0.4)) {
            camera = .region(MKCoordinateRegion(center: last, span: Self.followSpan))
        }
    }
}

// The athlete's current position — a filled orange dot with a soft ring while
// running, hollow while (auto-)paused so the map itself reads the paused state.
private struct RunHeadDot: View {
    let paused: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.Color.accent.opacity(0.22))
                .frame(width: 26, height: 26)
            Circle()
                .fill(paused ? Theme.Color.surface : Theme.Color.accent)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(Theme.Color.accent, lineWidth: paused ? 2.5 : 0))
                .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: paused ? 0 : 2))
        }
        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
    }
}

// A STATIC mini-map of a FINISHED run's route (#64) — non-interactive, fitted to the
// whole trace, with start/end dots. Used on the post-workout summary and the
// executed-session detail. Renders nothing when there are fewer than 2 points.
struct RouteMiniMap: View {
    let coordinates: [CLLocationCoordinate2D]

    init(coordinates: [CLLocationCoordinate2D]) { self.coordinates = coordinates }
    /// Decode an encoded polyline directly — the caller (summary / detail) then needs
    /// no CoreLocation, just the stored string.
    init(polyline: String) { self.coordinates = PolylineCodec.decode(polyline).map(\.coordinate) }

    var body: some View {
        Map(initialPosition: .region(Self.region(for: coordinates)), interactionModes: []) {
            if coordinates.count >= 2 {
                MapPolyline(coordinates: coordinates)
                    .stroke(Theme.Color.accent,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                if let start = coordinates.first {
                    Annotation("", coordinate: start) { RouteEndpointDot(filled: false) }.annotationTitles(.hidden)
                }
                if let end = coordinates.last {
                    Annotation("", coordinate: end) { RouteEndpointDot(filled: true) }.annotationTitles(.hidden)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .allowsHitTesting(false)
    }

    /// The region that frames the whole trace, with padding and a floor span so a
    /// short run isn't zoomed to street level.
    static func region(for coords: [CLLocationCoordinate2D]) -> MKCoordinateRegion {
        guard let first = coords.first else {
            return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 41.3874, longitude: 2.1686),
                                      span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05))
        }
        var minLat = first.latitude, maxLat = first.latitude
        var minLon = first.longitude, maxLon = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude); maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude); maxLon = max(maxLon, c.longitude)
        }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2),
            span: MKCoordinateSpan(latitudeDelta: max((maxLat - minLat) * 1.4, 0.003),
                                   longitudeDelta: max((maxLon - minLon) * 1.4, 0.003))
        )
    }
}

private struct RouteEndpointDot: View {
    let filled: Bool   // true = finish (solid), false = start (hollow)
    var body: some View {
        Circle()
            .fill(filled ? Theme.Color.accent : Theme.Color.surface)
            .frame(width: 11, height: 11)
            .overlay(Circle().stroke(filled ? .white.opacity(0.9) : Theme.Color.accent, lineWidth: 2))
            .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
    }
}

extension RoutePoint {
    /// Bridge to MapKit for rendering (PolylineCodec itself stays CoreLocation-free).
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

// The honest signal badge: a tight lock reads "GPS fuerte" (positive), a loose one
// "GPS débil" (amber), no usable fix "Buscando GPS" (neutral). Never over-promises.
struct GPSQualityBadge: View {
    let quality: GPSSignalQuality

    private var tint: Color {
        switch quality {
        case .strong:    return Theme.Color.ok
        case .weak:      return Theme.Color.warning
        case .searching: return Theme.Color.muted
        }
    }

    private var symbol: String {
        switch quality {
        case .strong:    return "location.fill"
        case .weak:      return "location"
        case .searching: return "location.slash"
        }
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
            Text(quality.label)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.vertical, 5)
        .background(Theme.Color.surface.opacity(0.92), in: Capsule())
        .overlay(Capsule().stroke(tint.opacity(0.35), lineWidth: 1))
        .accessibilityLabel(quality.label)
    }
}
