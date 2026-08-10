import Foundation

// Snake_case JSON convention to match shared/schema/* TypeScript Zod schemas.
enum APIBase {
    static var url: URL {
        if let s = Bundle.main.object(forInfoDictionaryKey: "FahybrikApiBase") as? String,
           let u = URL(string: s) {
            return u
        }
        return URL(string: "https://app.fahybrid.com")!
    }

    /// Una referencia de fichero de un DTO, resuelta contra esta base.
    ///
    /// El servidor sirve unas como RUTA («/api/communications/audio/…», que es lo
    /// que sobrevive a cambiar de entorno) y otras ya absolutas. Las dos tienen
    /// que acabar apuntando al mismo sitio, y quien las consume no puede tener
    /// que saber cuál le tocó.
    ///
    /// Una que ya viene absoluta se devuelve TAL CUAL, sin re-normalizar: es la
    /// clave con la que la caché de media guarda sus bytes, y cambiarle un
    /// carácter la haría descargar otra vez lo que ya tiene.
    static func absoluta(_ referencia: String?) -> String? {
        guard let limpia = referencia?.trimmingCharacters(in: .whitespacesAndNewlines),
              !limpia.isEmpty
        else { return nil }
        if limpia.contains("://") { return limpia }
        return URL(string: limpia, relativeTo: url)?.absoluteURL.absoluteString
    }
}

enum APIError: Error {
    case invalidResponse
    case http(Int, Data)
    case offline
    case decoding(Error)
}

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = APIClient.makeJSONDecoder()

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    /// Shared JSON decoder configuration (snake_case keys + lenient ISO 8601
    /// dates with OR without fractional seconds). Used by the actor's request
    /// methods AND by streaming callers (the chat SSE consumer) that decode
    /// outside the actor — single source of truth for the wire decode strategy.
    nonisolated static func makeJSONDecoder() -> JSONDecoder {
        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        // The default `.iso8601` strategy rejects fractional seconds, so a wire
        // value like `2026-05-29T11:06:13.234Z` (the chat timestamps) fails to
        // decode and takes the whole payload down with it. Accept ISO 8601 with
        // OR without a fractional component so both shapes round-trip.
        dec.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601DateFormatters.parse(raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected ISO 8601 date, got \(raw)"
            )
        }
        return dec
    }

    // AUDIT-B4 — the ONE network round-trip: sends the request and maps a connectivity
    // URLError to `APIError.offline` (previously never thrown, so the offline `catch`
    // arms in EmailSignInView / ExecutedWorkoutView were dead). Every verb goes through
    // here, so the offline signal is uniform.
    private func perform(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
            return (data, http)
        } catch let error as URLError where Self.offlineCodes.contains(error.code) {
            throw APIError.offline
        }
    }

    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
        .timedOut, .cannotConnectToHost, .cannotFindHost,
    ]

    func post<TBody: Encodable, TResp: Decodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try encoder.encode(body)

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        if let empty = Empty() as? TResp {
            return empty
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func postRaw<TBody: Encodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws {
        let _: Empty = try await post(path: path, body: body, bearer: bearer)
    }

    /// POST a pre-encoded JSON body EXACTLY as stored. The offline RequestQueue
    /// persists the original encoded bytes, so its replay must send them
    /// verbatim — never re-encode (the in-memory DTO that produced them is
    /// long gone). Success is any 2xx; the body is ignored.
    func postJSONData(
        path: String,
        data: Data,
        bearer: String? = nil
    ) async throws {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.httpBody = data

        let (respData, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, respData)
        }
    }

    /// PATCH with a JSON body. Mirrors `post(...)` exactly, differing only in
    /// the HTTP method. Used by the athlete profile-edit flow.
    func patch<TBody: Encodable, TResp: Decodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "PATCH"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try encoder.encode(body)

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        if let empty = Empty() as? TResp {
            return empty
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func put<TBody: Encodable, TResp: Decodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "PUT"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try encoder.encode(body)

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        if let empty = Empty() as? TResp {
            return empty
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func get<TResp: Decodable>(
        path: String,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "GET"
        req.addValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// Raw GET that returns the response body bytes + a sensible filename.
    /// Used by data-export (RGPD): backend ships JSON with
    /// `Content-Disposition: attachment` and we hand the bytes to a Share Sheet.
    func getData(
        path: String,
        bearer: String? = nil
    ) async throws -> (data: Data, filename: String, mimeType: String) {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "GET"
        req.addValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        let mime = (http.value(forHTTPHeaderField: "Content-Type") ?? "application/json")
            .split(separator: ";")
            .first
            .map { String($0).trimmingCharacters(in: .whitespaces) } ?? "application/json"
        let filename = Self.parseFilename(
            from: http.value(forHTTPHeaderField: "Content-Disposition")
        ) ?? "fahybrid-export.json"
        return (data, filename, mime)
    }

    /// Multipart POST of a single image part, plus optional plain-text form
    /// fields. Used by nutrition photo analysis and workout-capture vision (both
    /// expect `multipart/form-data` with one image file; the latter adds an
    /// optional `app` text field). Returns the decoded response. HTTP errors
    /// (incl. 501 when the vision model is not configured) surface as
    /// `APIError.http(status, data)`.
    func postImage<TResp: Decodable>(
        path: String,
        imageData: Data,
        fieldName: String = "image",
        filename: String = "meal.jpg",
        mimeType: String = "image/jpeg",
        fields: [String: String] = [:],
        bearer: String? = nil
    ) async throws -> TResp {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "POST"
        req.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        var body = Data()
        // Plain-text fields first (e.g. `app=concept2`), then the image part.
        for (name, value) in fields {
            let part = "--\(boundary)\r\n"
                + "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
                + "\(value)\r\n"
            body.append(Data(part.utf8))
        }
        let prologue = "--\(boundary)\r\n"
            + "Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n"
            + "Content-Type: \(mimeType)\r\n\r\n"
        body.append(Data(prologue.utf8))
        body.append(imageData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        req.httpBody = body

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// DELETE with optional JSON body. Used by account-deletion (RGPD).
    func delete<TBody: Encodable, TResp: Decodable>(
        path: String,
        body: TBody?,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "DELETE"
        req.addValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.addValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }

        let (data, http) = try await perform(req)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        // Empty-typed responses + empty bodies on DELETE both map to Empty.
        if let empty = Empty() as? TResp {
            return empty
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    // MARK: - Helpers

    /// Builds a request URL from a path that MAY include a query string
    /// ("a/b?x=1&y=2"). `appendingPathComponent` percent-encodes "?", which
    /// breaks query params, so split it off and attach it as a real query.
    /// Callers already percent-encode their query values.
    private static func requestURL(path: String) -> URL {
        let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let base = APIBase.url.appendingPathComponent(String(parts[0]))
        guard parts.count == 2, !parts[1].isEmpty,
              var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            return base
        }
        comps.percentEncodedQuery = String(parts[1])
        return comps.url ?? base
    }

    /// Best-effort filename extraction from a `Content-Disposition` header.
    /// Handles RFC 6266 `filename*=UTF-8''...` and plain `filename="..."`.
    private static func parseFilename(from header: String?) -> String? {
        guard let header else { return nil }
        // RFC 6266 ext form first (UTF-8 percent-encoded).
        if let range = header.range(of: "filename\\*=UTF-8''", options: .regularExpression) {
            let raw = String(header[range.upperBound...])
                .split(separator: ";").first.map(String.init) ?? ""
            return raw.removingPercentEncoding ?? raw
        }
        // Plain form: filename="foo.json" | filename=foo.json
        if let range = header.range(of: "filename=", options: .caseInsensitive) {
            var raw = String(header[range.upperBound...])
                .split(separator: ";").first.map(String.init) ?? ""
            raw = raw.trimmingCharacters(in: .whitespaces)
            if raw.hasPrefix("\""), raw.hasSuffix("\""), raw.count >= 2 {
                raw = String(raw.dropFirst().dropLast())
            }
            return raw.isEmpty ? nil : raw
        }
        return nil
    }
}

struct Empty: Codable {}

// Shared ISO 8601 parsing for API date fields. The backend may send timestamps
// with or without fractional seconds (e.g. chat `created_at` carries millis,
// other endpoints don't), so we try the fractional formatter first and fall
// back to the plain one. Both formatters are reused (instantiating
// ISO8601DateFormatter is comparatively expensive).
enum ISO8601DateFormatters {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ raw: String) -> Date? {
        withFraction.date(from: raw) ?? plain.date(from: raw)
    }
}
