// Where to connect (CHAOS-115, ADR-017). Pure, no networking.
//
// The QR code on the PC encodes `http://<addr>:<port>/?code=<JOINCODE>` (`buildJoinUrl` in
// `apps/server/src/network.ts`, ADR-007). The web controller is served from that origin and
// connects to `ws(s)://<same host>/ws` (`controllerSocketUrl` in `net/client.ts`). The native
// app is not same-origin, so it derives the socket URL from the scanned link, or from a
// manually entered address plus code.
import Foundation

struct JoinTarget: Codable, Hashable, Sendable {
    /// `ws://<host>:<port>/ws` (or `wss://` for an `https` link).
    let socketURL: URL
    /// Normalized, valid join code (`JoinCode.isValid`).
    let joinCode: String

    /// Server default (`PORT` in `apps/server/src/main.ts`).
    static let defaultPort = 8787

    /// Key for the token store: a token is only valid for the same server and code.
    var storageKey: String { "\(socketURL.absoluteString)|\(joinCode)" }

    /// From a scanned QR link. `nil` unless scheme is http(s), a host exists and `code` is
    /// valid. `seats`/`mode` are ignored in the first slice (one iPhone = one slot).
    static func fromScannedURL(_ text: String) -> JoinTarget? {
        guard let components = URLComponents(string: text.trimmingCharacters(in: .whitespaces))
        else { return nil }
        let raw = components.queryItems?.first { $0.name == "code" }?.value ?? ""
        // Like `parseLaunchParams`: trim and uppercase only; other characters make it invalid.
        let code = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard JoinCode.isValid(code) else { return nil }
        return make(components, code: code)
    }

    /// From manual entry: `address` is `192.168.1.20`, `192.168.1.20:8787`, `[fe80::1]:8787`
    /// or a full `http://…` link; `code` is normalized like the web code entry.
    static func manual(address: String, code: String) -> JoinTarget? {
        let normalized = JoinCode.normalize(code)
        guard JoinCode.isValid(normalized) else { return nil }
        var text = address.trimmingCharacters(in: .whitespaces)
        if !text.contains("://") { text = "http://\(text)" }
        guard var components = URLComponents(string: text) else { return nil }
        if components.port == nil { components.port = defaultPort }
        return make(components, code: normalized)
    }

    private static func make(_ link: URLComponents, code: String) -> JoinTarget? {
        guard let scheme = link.scheme?.lowercased(), scheme == "http" || scheme == "https",
            let host = link.host, !host.isEmpty
        else { return nil }
        // Copy the components so host formatting (IPv6 brackets) stays as parsed.
        var socket = link
        socket.scheme = scheme == "https" ? "wss" : "ws"
        socket.user = nil
        socket.password = nil
        socket.path = "/ws"
        socket.query = nil
        socket.fragment = nil
        guard let url = socket.url else { return nil }
        return JoinTarget(socketURL: url, joinCode: code)
    }
}
