import XCTest
@testable import FAHYBRIK

// Chat attachment domain + wire round-trips. Covers the two things most likely
// to silently break the 2-way attachment flow:
//   1. ChatAttachmentMeta / ChatMessageDTO must round-trip through BOTH coders —
//      the wire decoder (snake_case) AND the store's plain camelCase disk coder.
//   2. The client-side size guard must mirror the server's per-kind limits.
final class ChatAttachmentTests: XCTestCase {

    // MARK: - Size-limit guard (mirrors web/lib/chat/upload.ts MAX_BYTES_BY_KIND)

    func testWithinLimitAtBoundaries() {
        XCTAssertTrue(ChatAttachmentLimits.withinLimit(kind: .voice, bytes: 25 * 1024 * 1024))
        XCTAssertFalse(ChatAttachmentLimits.withinLimit(kind: .voice, bytes: 25 * 1024 * 1024 + 1))

        XCTAssertTrue(ChatAttachmentLimits.withinLimit(kind: .video, bytes: 200 * 1024 * 1024))
        XCTAssertFalse(ChatAttachmentLimits.withinLimit(kind: .video, bytes: 200 * 1024 * 1024 + 1))

        XCTAssertTrue(ChatAttachmentLimits.withinLimit(kind: .image, bytes: 30 * 1024 * 1024))
        XCTAssertFalse(ChatAttachmentLimits.withinLimit(kind: .image, bytes: 30 * 1024 * 1024 + 1))

        XCTAssertTrue(ChatAttachmentLimits.withinLimit(kind: .file, bytes: 25 * 1024 * 1024))
        XCTAssertFalse(ChatAttachmentLimits.withinLimit(kind: .file, bytes: 25 * 1024 * 1024 + 1))
    }

    func testOverLimitMessageNamesTheCap() {
        XCTAssertTrue(ChatAttachmentLimits.overLimitMessage(for: .video).contains("200 MB"))
        XCTAssertTrue(ChatAttachmentLimits.overLimitMessage(for: .image).contains("30 MB"))
        XCTAssertTrue(ChatAttachmentLimits.overLimitMessage(for: .voice).contains("25 MB"))
    }

    // MARK: - ChatAttachmentMeta

    func testMetaDurationAndAspectDerivations() {
        var voice = ChatAttachmentMeta(); voice.durationMs = 4200
        XCTAssertEqual(voice.durationSeconds ?? 0, 4.2, accuracy: 0.0001)

        var img = ChatAttachmentMeta(); img.width = 1200; img.height = 800
        XCTAssertEqual(img.aspectRatio ?? 0, 1.5, accuracy: 0.0001)

        let empty = ChatAttachmentMeta()
        XCTAssertTrue(empty.isEmpty)
        XCTAssertNil(empty.durationSeconds)
        XCTAssertNil(empty.aspectRatio)
    }

    /// The send path encodes meta through the APIClient encoder (convertToSnakeCase).
    /// Verify the wire keys + that nil fields are omitted (encodeIfPresent).
    func testMetaEncodesToSnakeCaseAndOmitsNils() throws {
        var meta = ChatAttachmentMeta()
        meta.durationMs = 4200
        meta.sizeBytes = 81_000
        meta.mimeType = "audio/mp4"

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let data = try enc.encode(meta)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(obj["duration_ms"] as? Int, 4200)
        XCTAssertEqual(obj["size_bytes"] as? Int, 81_000)
        XCTAssertEqual(obj["mime_type"] as? String, "audio/mp4")
        XCTAssertNil(obj["width"])   // nil → omitted, not encoded as null
        XCTAssertNil(obj["height"])
    }

    // MARK: - ChatMessageDTO dual-coder round-trip

    /// Off the wire: snake_case + ISO8601 (with millis) decode, meta populated.
    func testMessageDTODecodesFromWireSnakeCase() throws {
        let json = """
        {
          "id": "42",
          "thread_id": "7",
          "sender_user_id": "9",
          "body": null,
          "attachment_url": "https://app.fahybrid.com/api/chat/attachments/chat/9/2026/07/abc.m4a",
          "attachment_kind": "voice",
          "attachment_meta": { "duration_ms": 4200, "size_bytes": 81000, "mime_type": "audio/mp4" },
          "created_at": "2026-07-20T11:06:13.234Z",
          "read_at": null,
          "edited_at": null
        }
        """
        let dto = try APIClient.makeJSONDecoder().decode(ChatMessageDTO.self, from: Data(json.utf8))
        XCTAssertEqual(dto.attachmentKind, "voice")
        XCTAssertEqual(dto.attachmentMeta?.durationMs, 4200)
        XCTAssertEqual(dto.attachmentMeta?.sizeBytes, 81_000)
        XCTAssertEqual(dto.attachmentMeta?.mimeType, "audio/mp4")
        XCTAssertEqual(dto.attachmentMeta?.durationSeconds ?? 0, 4.2, accuracy: 0.0001)
        XCTAssertNil(dto.attachmentMeta?.width)
        XCTAssertNil(dto.body)
    }

    /// To/from disk: the store uses a PLAIN JSONEncoder/Decoder (camelCase, default
    /// dates). The DTO (and its meta) must survive that exact round-trip — this is
    /// why neither type may carry custom CodingKeys.
    func testMessageDTORoundTripsThroughPlainDiskCoder() throws {
        var meta = ChatAttachmentMeta()
        meta.width = 1200; meta.height = 800; meta.sizeBytes = 512_000; meta.mimeType = "image/jpeg"
        let original = ChatMessageDTO(
            id: "100", threadId: "7", senderUserId: "9",
            body: nil,
            attachmentUrl: "https://app.fahybrid.com/api/chat/attachments/chat/9/2026/07/x.jpg",
            attachmentKind: "image",
            attachmentMeta: meta,
            createdAt: Date(timeIntervalSince1970: 1_770_000_000),
            readAt: nil, editedAt: nil
        )
        let data = try JSONEncoder().encode(original)               // plain (store) coder
        let decoded = try JSONDecoder().decode(ChatMessageDTO.self, from: data)
        XCTAssertEqual(decoded, original)                          // Equatable — meta included
        XCTAssertEqual(decoded.attachmentMeta?.aspectRatio ?? 0, 1.5, accuracy: 0.0001)
    }

    /// A text-only message (no attachment fields) still round-trips + maps.
    func testTextMessageHasNoAttachment() throws {
        let json = """
        {"id":"1","thread_id":"7","sender_user_id":"9","body":"hola",
         "attachment_url":null,"attachment_kind":null,"attachment_meta":null,
         "created_at":"2026-07-20T11:06:13Z","read_at":null,"edited_at":null}
        """
        let dto = try APIClient.makeJSONDecoder().decode(ChatMessageDTO.self, from: Data(json.utf8))
        XCTAssertEqual(dto.body, "hola")
        XCTAssertNil(dto.attachmentUrl)
        XCTAssertNil(dto.attachmentMeta)
    }

    // MARK: - Upload result decode (jsonOk returns the object directly)

    func testUploadResultDecodes() throws {
        let json = #"{"url":"https://x/api/chat/attachments/chat/9/2026/07/a.jpg","mime_type":"image/jpeg","size_bytes":12345,"kind":"image"}"#
        let r = try APIClient.makeJSONDecoder().decode(ChatUploadResult.self, from: Data(json.utf8))
        XCTAssertEqual(r.url, "https://x/api/chat/attachments/chat/9/2026/07/a.jpg")
        XCTAssertEqual(r.mimeType, "image/jpeg")
        XCTAssertEqual(r.sizeBytes, 12345)
        XCTAssertEqual(r.kind, "image")
    }

    // MARK: - Inference helpers (mirror the server's allowed sets)

    func testKindForExtension() {
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "m4a"), .voice)
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "MP4"), .video)   // case-insensitive
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "jpeg"), .image)
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "heic"), .image)
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "pdf"), .file)
        XCTAssertEqual(ChatAttachmentInfer.kind(forExtension: "docx"), .file)
        XCTAssertNil(ChatAttachmentInfer.kind(forExtension: "exe"))
    }

    func testReceivedFileNameAndExtension() {
        let url = "https://app.fahybrid.com/api/chat/attachments/chat/9/2026/07/abc123.pdf"
        XCTAssertEqual(ChatAttachmentInfer.fileExtension(fromURLString: url), "pdf")
        XCTAssertEqual(ChatAttachmentInfer.receivedFileName(remoteURLString: url), "Archivo PDF")
        XCTAssertEqual(ChatAttachmentInfer.receivedFileName(remoteURLString: nil), "Archivo")
    }

    func testDurationLabel() {
        XCTAssertEqual(DurationLabel.mmss(42), "0:42")
        XCTAssertEqual(DurationLabel.mmss(75), "1:15")
        XCTAssertEqual(DurationLabel.mmss(0), "0:00")
    }
}
