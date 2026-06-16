import Foundation

// Snake_case JSON convention to match shared/schema/* TypeScript Zod schemas.
enum APIBase {
    static var url: URL {
        if let s = Bundle.main.object(forInfoDictionaryKey: "FahybrikApiBase") as? String,
           let u = URL(string: s) {
            return u
        }
        return URL(string: "https://fahybrik-web.vercel.app")!
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
        self.decoder = dec

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

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

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
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

    func get<TResp: Decodable>(
        path: String,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "GET"
        req.addValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
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

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
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

    /// Multipart POST of a single image part. Used by nutrition photo analysis
    /// (the vision endpoint expects `multipart/form-data` with one image file).
    /// Returns the decoded response. HTTP errors (incl. 501 when the vision
    /// model is not configured) surface as `APIError.http(status, data)`.
    func postImage<TResp: Decodable>(
        path: String,
        imageData: Data,
        fieldName: String = "image",
        filename: String = "meal.jpg",
        mimeType: String = "image/jpeg",
        bearer: String? = nil
    ) async throws -> TResp {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: Self.requestURL(path: path))
        req.httpMethod = "POST"
        req.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        var body = Data()
        let prologue = "--\(boundary)\r\n"
            + "Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n"
            + "Content-Type: \(mimeType)\r\n\r\n"
        body.append(Data(prologue.utf8))
        body.append(imageData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        req.httpBody = body

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
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

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
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
