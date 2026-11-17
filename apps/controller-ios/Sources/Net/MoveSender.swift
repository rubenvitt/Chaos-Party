// `move` throttling: port of `planMoveSend` + `createMoveSender` (`input/moveSender.ts`).
import Foundation

struct Stick: Equatable, Sendable {
    var x: Double
    var y: Double

    static let zero = Stick(x: 0, y: 0)

    /// Length ≤ 1 (the server rejects > 1 + ε); non-finite input counts as released.
    var clamped: Stick {
        guard x.isFinite, y.isFinite else { return .zero }
        let length = (x * x + y * y).squareRoot()
        return length > 1 ? Stick(x: x / length, y: y / length) : self
    }
}

enum MovePlan: Equatable {
    case send, skip
    case deferred(Duration)

    static func plan(
        lastSent: Stick?, lastSentAt: ContinuousClock.Instant?, now: ContinuousClock.Instant,
        stick: Stick, interval: Duration = SessionTiming.moveInterval
    ) -> MovePlan {
        if lastSent == stick { return .skip }
        // Never delay a release: the figure should stop at once.
        if stick == .zero { return .send }
        guard let lastSentAt else { return .send }
        let elapsed = now - lastSentAt
        return elapsed >= interval ? .send : .deferred(interval - elapsed)
    }
}

@MainActor
final class MoveSender {
    private let scheduler: Scheduler
    private let send: @MainActor (Stick) -> Void
    private var lastSent: Stick?
    private var lastSentAt: ContinuousClock.Instant?
    private var pending: Stick?
    private var timer: ScheduledTimer?

    init(scheduler: Scheduler, send: @escaping @MainActor (Stick) -> Void) {
        self.scheduler = scheduler
        self.send = send
    }

    func update(_ stick: Stick) {
        switch MovePlan.plan(lastSent: lastSent, lastSentAt: lastSentAt, now: scheduler.now, stick: stick) {
        case .send:
            clearTimer()
            pending = nil
            lastSent = stick
            lastSentAt = scheduler.now
            send(stick)
        case .skip:
            // Back on the sent value: a deferred intermediate value is obsolete.
            pending = nil
            clearTimer()
        case .deferred(let wait):
            pending = stick
            if timer == nil {
                timer = scheduler.after(wait) { [weak self] in self?.flush() }
            }
        }
    }

    func reset() {
        clearTimer()
        pending = nil
        lastSent = nil
        lastSentAt = nil
    }

    private func flush() {
        timer = nil
        guard let stick = pending else { return }
        pending = nil
        update(stick)
    }

    private func clearTimer() {
        timer?.cancel()
        timer = nil
    }
}
