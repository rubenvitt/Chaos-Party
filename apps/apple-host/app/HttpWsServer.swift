import CryptoKit
import Foundation
import Network

/// One TCP port for the controller files (HTTP GET) and the controller socket at `/ws` (same origin, see
/// `apps/controller/src/net/client.ts`). RFC 6455 is hand-rolled because a listener with `NWProtocolWebSocket`
/// in its stack only accepts upgrade requests. All state lives on `queue` (the JS queue).
final class HttpWsServer {
    var onOpen: (Int) -> Void = { _ in }
    var onMessage: (Int, String) -> Void = { _, _ in }
    var onClosed: (Int) -> Void = { _ in }

    private let queue: DispatchQueue
    private let webRoot: URL
    private var listener: NWListener?
    private var sockets: [Int: Socket] = [:]
    private var nextId = 1
    private static let maxMessage = 1 << 20
    var connectionCount: Int { sockets.count }

    private final class Socket {
        let conn: NWConnection
        var buffer = Data()
        var fragments = Data()
        init(_ conn: NWConnection) { self.conn = conn }
    }

    private struct Frame { let fin: Bool; let opcode: UInt8; let payload: Data }
    private struct ProtocolError: Error { let code: Int }

    init(queue: DispatchQueue, webRoot: URL) {
        self.queue = queue
        self.webRoot = webRoot.standardizedFileURL
    }

    /// Tries `port`, then the next ones; calls `ready` with the bound port.
    func start(port: UInt16, attempts: Int = 10, ready: @escaping (UInt16) -> Void) {
        guard let listener = try? NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!) else {
            return retry(port, attempts, ready, "NWListener nicht erstellt")
        }
        listener.stateUpdateHandler = { [weak self] state in
            hostLog("Listener :\(port) \(state)")
            switch state {
            case .ready: ready(listener.port?.rawValue ?? port)
            case .failed(let error):
                listener.cancel()
                self?.retry(port, attempts, ready, "\(error)")
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] conn in
            conn.start(queue: self?.queue ?? .main)
            self?.readRequest(conn, Data())
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func retry(_ port: UInt16, _ attempts: Int, _ ready: @escaping (UInt16) -> Void, _ reason: String) {
        if attempts > 1 { start(port: port + 1, attempts: attempts - 1, ready: ready) } else { hostLog("FEHLER kein Port frei: \(reason)") }
    }

    // MARK: HTTP

    private func readRequest(_ conn: NWConnection, _ buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                handle(conn, String(decoding: buffer[..<end.lowerBound], as: UTF8.self), Data(buffer[end.upperBound...]))
            } else if done || error != nil || buffer.count > 16384 {
                conn.cancel()
            } else {
                readRequest(conn, buffer)
            }
        }
    }

    private func handle(_ conn: NWConnection, _ head: String, _ rest: Data) {
        let lines = head.components(separatedBy: "\r\n")
        let parts = lines[0].split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else {
            return respond(conn, "405 Method Not Allowed", "text/plain", Data("method not allowed".utf8))
        }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let path = String(parts[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0])
        if path == "/ws", headers["upgrade"]?.lowercased() == "websocket", let key = headers["sec-websocket-key"] {
            upgrade(conn, key, rest)
        } else {
            serveFile(conn, path, headOnly: parts[0] == "HEAD")
        }
    }

    private func serveFile(_ conn: NWConnection, _ path: String, headOnly: Bool) {
        let relative = path == "/" ? "index.html" : String((path.removingPercentEncoding ?? path).drop(while: { $0 == "/" }))
        let file = webRoot.appending(path: relative).standardizedFileURL
        // Trust boundary: nothing outside the bundled controller folder.
        guard file.path.hasPrefix(webRoot.path + "/"), let body = try? Data(contentsOf: file) else {
            return respond(conn, "404 Not Found", "text/plain", Data("not found".utf8), headOnly: headOnly)
        }
        respond(conn, "200 OK", Self.mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream", body, headOnly: headOnly)
    }

    private static let mimeTypes = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "svg": "image/svg+xml", "webp": "image/webp", "png": "image/png", "woff2": "font/woff2",
        "txt": "text/plain; charset=utf-8", "json": "application/json", "wasm": "application/wasm", "ico": "image/x-icon",
    ]

    private func respond(_ conn: NWConnection, _ status: String, _ type: String, _ body: Data, headOnly: Bool = false) {
        let head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n"
        conn.send(content: Data(head.utf8) + (headOnly ? Data() : body), contentContext: .finalMessage, isComplete: true,
                  completion: .contentProcessed { _ in conn.cancel() })
    }

    // MARK: WebSocket

    private func upgrade(_ conn: NWConnection, _ key: String, _ rest: Data) {
        let accept = Data(Insecure.SHA1.hash(data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8))).base64EncodedString()
        let response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
        conn.send(content: Data(response.utf8), completion: .idempotent)
        let id = nextId
        nextId += 1
        let socket = Socket(conn)
        socket.buffer = rest
        sockets[id] = socket
        onOpen(id)
        parseFrames(id)
        receive(id)
    }

    private func receive(_ id: Int) {
        sockets[id]?.conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            guard let self, let socket = sockets[id] else { return }
            if let data {
                socket.buffer.append(data)
                parseFrames(id)
            }
            if done || error != nil { drop(id, cancel: true) } else { receive(id) }
        }
    }

    private func parseFrames(_ id: Int) {
        while let socket = sockets[id] {
            let frame: Frame
            do {
                guard let next = try Self.nextFrame(&socket.buffer) else { return }
                frame = next
            } catch let error as ProtocolError {
                return close(id, code: error.code, reason: "")
            } catch { return }
            switch frame.opcode {
            case 0, 1:
                socket.fragments.append(frame.payload)
                if socket.fragments.count > Self.maxMessage { return close(id, code: 1009, reason: "too big") }
                if frame.fin {
                    let text = String(decoding: socket.fragments, as: UTF8.self)
                    socket.fragments = Data()
                    onMessage(id, text)
                }
            case 8:
                let code = frame.payload.count >= 2 ? Int(frame.payload[0]) << 8 | Int(frame.payload[1]) : 1000
                return close(id, code: code, reason: "")
            case 9: write(id, opcode: 10, frame.payload)
            case 10: break
            default: return close(id, code: 1003, reason: "text only")
            }
        }
    }

    /// Returns nil until the buffer holds a whole frame; consumes it otherwise.
    private static func nextFrame(_ buffer: inout Data) throws -> Frame? {
        let head = [UInt8](buffer.prefix(14))
        guard head.count >= 2 else { return nil }
        guard head[1] & 0x80 != 0 else { throw ProtocolError(code: 1002) } // clients must mask
        var length = Int(head[1] & 0x7f)
        var offset = 2
        if length == 126 {
            guard head.count >= 4 else { return nil }
            length = Int(head[2]) << 8 | Int(head[3])
            offset = 4
        } else if length == 127 {
            guard head.count >= 10 else { return nil }
            length = head[2..<10].reduce(0) { $0 << 8 | Int($1) }
            offset = 10
        }
        guard (0...maxMessage).contains(length) else { throw ProtocolError(code: 1009) }
        guard head.count >= offset + 4 else { return nil }
        let mask = Array(head[offset..<offset + 4])
        offset += 4
        guard buffer.count >= offset + length else { return nil }
        var payload = [UInt8](buffer.dropFirst(offset).prefix(length))
        for i in payload.indices { payload[i] ^= mask[i & 3] }
        buffer = Data(buffer.dropFirst(offset + length))
        return Frame(fin: head[0] & 0x80 != 0, opcode: head[0] & 0x0f, payload: Data(payload))
    }

    func send(_ id: Int, _ text: String) { write(id, opcode: 1, Data(text.utf8)) }

    func close(_ id: Int, code: Int, reason: String) {
        guard let socket = sockets[id] else { return }
        var payload = Data([UInt8(truncatingIfNeeded: code >> 8), UInt8(truncatingIfNeeded: code)])
        payload.append(contentsOf: reason.utf8.prefix(120))
        socket.conn.send(content: Self.frame(opcode: 8, payload), contentContext: .finalMessage, isComplete: true,
                         completion: .contentProcessed { _ in socket.conn.cancel() })
        drop(id, cancel: false)
    }

    private func write(_ id: Int, opcode: UInt8, _ payload: Data) {
        sockets[id]?.conn.send(content: Self.frame(opcode: opcode, payload), completion: .contentProcessed { [weak self] error in
            if error != nil { self?.drop(id, cancel: true) }
        })
    }

    private static func frame(opcode: UInt8, _ payload: Data) -> Data {
        var frame = Data([0x80 | opcode])
        let n = payload.count
        if n < 126 {
            frame.append(UInt8(n))
        } else if n <= 0xffff {
            frame.append(contentsOf: [126, UInt8(n >> 8), UInt8(n & 0xff)])
        } else {
            frame.append(127)
            for shift in stride(from: 56, through: 0, by: -8) { frame.append(UInt8((n >> shift) & 0xff)) }
        }
        return frame + payload
    }

    /// `closed` runs exactly once per connection and never re-enters a running JS call.
    private func drop(_ id: Int, cancel: Bool) {
        guard let socket = sockets.removeValue(forKey: id) else { return }
        if cancel { socket.conn.cancel() }
        queue.async { self.onClosed(id) }
    }
}

/// First non-link-local IPv4 of an `en*` interface, en0 preferred.
func lanIPv4() -> String? {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return nil }
    defer { freeifaddrs(list) }
    var found: [(name: String, ip: String)] = []
    for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
        let ifa = ptr.pointee
        guard let addr = ifa.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET), ifa.ifa_flags & UInt32(IFF_UP) != 0 else { continue }
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        guard getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
        let name = String(cString: ifa.ifa_name), ip = String(cString: host)
        if name.hasPrefix("en"), !ip.hasPrefix("169.254.") { found.append((name, ip)) }
    }
    hostLog("IPv4: \(found.map { "\($0.name)=\($0.ip)" }.joined(separator: " "))")
    return (found.first { $0.name == "en0" } ?? found.first)?.ip
}
