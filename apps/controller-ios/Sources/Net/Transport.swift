// WebSocket transport behind a small protocol (`SocketLike` in `net/client.ts`); text frames only.
import Foundation

enum TransportEvent: Equatable, Sendable {
    case opened
    case text(String)
    /// Binary frame: not part of the protocol, dropped by the session.
    case binary
    /// Socket gone. `code` is the server's close code (e.g. 4003), `nil` without a close frame.
    case closed(code: Int?)
}

@MainActor
protocol Transport: AnyObject {
    func send(_ text: String)
    /// Close from our side; no further events are delivered.
    func close()
}

typealias TransportFactory =
    @MainActor (URL, @escaping @MainActor (TransportEvent) -> Void) -> any Transport

@MainActor
final class URLSessionTransport: Transport {
    static let make: TransportFactory = { URLSessionTransport(url: $0, onEvent: $1) }

    private let session: URLSession
    private let task: URLSessionWebSocketTask
    private var onEvent: (@MainActor (TransportEvent) -> Void)?

    init(url: URL, onEvent: @escaping @MainActor (TransportEvent) -> Void) {
        let delegate = SocketDelegate()
        // Main queue so the delegate can hop onto the main actor synchronously and keep order.
        session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: .main)
        task = session.webSocketTask(with: url)
        self.onEvent = onEvent
        delegate.owner = self
        task.resume()
        receiveLoop()
    }

    func send(_ text: String) {
        guard onEvent != nil else { return }
        // A failed send shows up as a close (delegate) or via the session's watchdog.
        task.send(.string(text)) { _ in }
    }

    func close() {
        onEvent = nil
        task.cancel(with: .normalClosure, reason: nil)
        session.invalidateAndCancel()
    }

    fileprivate func opened() {
        onEvent?(.opened)
    }

    fileprivate func finish(code: Int?) {
        guard let onEvent else { return }
        self.onEvent = nil
        session.finishTasksAndInvalidate()
        onEvent(.closed(code: code))
    }

    private func receiveLoop() {
        let task = task
        Task { @MainActor [weak self] in
            // Ends when the socket fails; the delegate reports the close with its code.
            while let message = try? await task.receive() {
                guard let self else { return }
                if case .string(let text) = message {
                    self.onEvent?(.text(text))
                } else {
                    self.onEvent?(.binary)
                }
            }
        }
    }
}

private final class SocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    /// Only touched on the main queue (`delegateQueue: .main`).
    weak var owner: URLSessionTransport?

    func urlSession(
        _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        MainActor.assumeIsolated { owner?.opened() }
    }

    func urlSession(
        _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
    ) {
        MainActor.assumeIsolated { owner?.finish(code: closeCode.rawValue) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        MainActor.assumeIsolated { owner?.finish(code: nil) }
    }
}
