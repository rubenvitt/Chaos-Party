// Real `LiveControllerSession` against a locally started server (see IMPLEMENTATION.md).
import Foundation
import Testing

@testable import ChaosControllerKit

/// Real transport that records what was sent and can be killed like a dropped network.
@MainActor
private final class RecordingTransport: Transport {
    let inner: URLSessionTransport
    let emit: @MainActor (TransportEvent) -> Void
    private(set) var sentTypes: [String] = []

    init(url: URL, emit: @escaping @MainActor (TransportEvent) -> Void) {
        inner = URLSessionTransport(url: url, onEvent: emit)
        self.emit = emit
    }

    func send(_ text: String) {
        let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]
        sentTypes.append(object?["type"] as? String ?? "?")
        inner.send(text)
    }

    func close() { inner.close() }

    /// Socket dies without a close frame from the server.
    func kill() {
        inner.close()
        emit(.closed(code: nil))
    }
}

@MainActor
private final class Recorder {
    private(set) var transports: [RecordingTransport] = []
    var factory: TransportFactory {
        { [unowned self] url, emit in
            let transport = RecordingTransport(url: url, emit: emit)
            self.transports.append(transport)
            return transport
        }
    }
}

private let integrationTarget: JoinTarget? = {
    let env = ProcessInfo.processInfo.environment
    guard let url = env["CHAOS_SERVER_URL"].flatMap(URL.init(string:)),
        let code = env["CHAOS_JOIN_CODE"], JoinCode.isValid(code)
    else { return nil }
    return JoinTarget(socketURL: url, joinCode: code)
}()

@MainActor
private func eventually(_ timeout: Duration = .seconds(5), _ condition: () -> Bool) async -> Bool {
    let end = ContinuousClock.now + timeout
    while ContinuousClock.now < end {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return condition()
}

@MainActor
@Suite(.serialized, .enabled(if: integrationTarget != nil, "CHAOS_SERVER_URL und CHAOS_JOIN_CODE fehlen"))
struct ServerIntegrationTests {

    @Test func fullLoopReconnectAndReplace() async throws {
        let target = try #require(integrationTarget)
        let defaults = try #require(UserDefaults(suiteName: "chaos-integration-\(UUID().uuidString)"))
        let recorder = Recorder()
        let session = LiveControllerSession(defaults: defaults, makeTransport: recorder.factory, watchesNetwork: false)

        // 1. Join (no host connected): welcome + lobby context.
        session.join(target, name: "Swifty")
        #expect(await eventually { session.state.ownContext?.lobby != nil })
        let slot = try #require(session.state.ownSlot)
        #expect(session.state.players.first?.label == "Swifty")
        #expect(session.state.slotScreen(slot) == .lobby)

        // 2. Pick a character that is still free (earlier runs may hold slots for 60 s).
        let taken = session.state.ownContext?.lobby?.takenCharacters ?? []
        let character = try #require(CharacterId.known.last { !taken.contains($0) })
        session.pickCharacter(slot: slot, character)
        #expect(await eventually { session.state.ownContext?.lobby?.character == character })
        #expect(session.state.picks.isEmpty)

        // 3. Ready → layout wait.
        session.setReady(slot: slot)
        #expect(await eventually { session.state.ownContext?.layout == .wait })

        // 4. Heartbeat ack → RTT.
        #expect(await eventually(.seconds(7)) { session.state.rttMs != nil })

        // 5. Socket dies → reconnect with the token to the same slot, no new join.
        let first = try #require(recorder.transports.first)
        #expect(first.sentTypes.first == "join")
        first.kill()
        #expect(session.state.link == .reconnecting(attempt: 1, hadSession: true))
        #expect(await eventually { recorder.transports.count == 2 && session.state.link == .online(rttMs: session.state.rttMs) })
        let second = try #require(recorder.transports.last)
        #expect(second.sentTypes.first == "reconnect")
        #expect(!second.sentTypes.contains("join"))
        #expect(session.state.ownSlot == slot)
        #expect(await eventually { session.state.ownContext?.lobby?.character == character })

        // Close 4003: a second app with the same token takes the slot over.
        let other = LiveControllerSession(defaults: defaults, watchesNetwork: false)
        other.join(target, name: nil)
        #expect(await eventually { other.state.ownSlot == slot && other.state.link != .connecting })
        #expect(await eventually { session.state.fatal == .replaced })
        #expect(session.state.screen == .error)
        try? await Task.sleep(for: .seconds(1))
        #expect(recorder.transports.count == 2, "kein automatisches Zurückdrängeln")

        // 6. Leave.
        other.leave()
        session.leave()
        #expect(session.state == ControllerState())
        #expect(TokenStore(defaults: defaults).load(target.storageKey) == nil)
    }

    @Test func serverRejectsOldProtocolVersion() async throws {
        let target = try #require(integrationTarget)
        var events: [TransportEvent] = []
        let transport = URLSessionTransport(url: target.socketURL) { events.append($0) }
        #expect(await eventually { events.contains(.opened) })
        transport.send(#"{"v":3,"type":"join","joinCode":"\#(target.joinCode)","seats":1}"#)
        #expect(await eventually { events.count > 1 })
        guard case .text(let text)? = events.dropFirst().first,
            case .error(let error) = try ServerMessage.decode(text)
        else {
            Issue.record("keine Fehlerantwort: \(events)")
            return
        }
        #expect(error.code == .versionMismatch)
        transport.close()
    }
}
