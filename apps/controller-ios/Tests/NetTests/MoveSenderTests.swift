import Foundation
import Testing

@testable import ChaosControllerKit

@Suite struct MovePlanTests {
    private let t0 = ContinuousClock.now

    @Test func firstValueIsSentImmediately() {
        #expect(MovePlan.plan(lastSent: nil, lastSentAt: nil, now: t0, stick: Stick(x: 0.5, y: 0)) == .send)
    }

    @Test func unchangedValueIsSkipped() {
        let stick = Stick(x: 0.5, y: 0)
        #expect(MovePlan.plan(lastSent: stick, lastSentAt: t0, now: t0 + .seconds(1), stick: stick) == .skip)
    }

    @Test func changeWithinIntervalIsDeferred() {
        let plan = MovePlan.plan(
            lastSent: Stick(x: 0.5, y: 0), lastSentAt: t0, now: t0 + .milliseconds(10), stick: Stick(x: 0.6, y: 0))
        #expect(plan == .deferred(.milliseconds(23)))
        let later = MovePlan.plan(
            lastSent: Stick(x: 0.5, y: 0), lastSentAt: t0, now: t0 + .milliseconds(33), stick: Stick(x: 0.6, y: 0))
        #expect(later == .send)
    }

    @Test func releaseIsSentImmediately() {
        let plan = MovePlan.plan(lastSent: Stick(x: 0.5, y: 0), lastSentAt: t0, now: t0 + .milliseconds(1), stick: .zero)
        #expect(plan == .send)
    }

    @Test func clampKeepsLengthAtMostOne() {
        let clamped = Stick(x: 3, y: 4).clamped
        #expect(abs(clamped.x - 0.6) < 1e-12 && abs(clamped.y - 0.8) < 1e-12)
        #expect((clamped.x * clamped.x + clamped.y * clamped.y).squareRoot() <= 1 + ProtocolConstants.stickEpsilon)
        #expect(Stick(x: 0.3, y: -0.4).clamped == Stick(x: 0.3, y: -0.4))
        #expect(Stick(x: .nan, y: 1).clamped == .zero)
        #expect(Stick(x: .infinity, y: 0).clamped == .zero)
    }
}

@MainActor
@Suite struct MoveSenderTests {
    @Test func throttlesAndDeliversTrailingValue() {
        let scheduler = ManualScheduler()
        var sent: [Stick] = []
        let sender = MoveSender(scheduler: scheduler) { sent.append($0) }
        sender.update(Stick(x: 0.1, y: 0))
        scheduler.advance(ms: 5)
        sender.update(Stick(x: 0.2, y: 0))
        scheduler.advance(ms: 5)
        sender.update(Stick(x: 0.3, y: 0))
        #expect(sent == [Stick(x: 0.1, y: 0)])
        scheduler.advance(ms: 23)
        #expect(sent == [Stick(x: 0.1, y: 0), Stick(x: 0.3, y: 0)])
        scheduler.advance(ms: 100)
        #expect(sent.count == 2)
    }

    @Test func releaseIsImmediateAndDropsDeferredValue() {
        let scheduler = ManualScheduler()
        var sent: [Stick] = []
        let sender = MoveSender(scheduler: scheduler) { sent.append($0) }
        sender.update(Stick(x: 0.1, y: 0))
        scheduler.advance(ms: 5)
        sender.update(Stick(x: 0.2, y: 0))
        sender.update(.zero)
        #expect(sent == [Stick(x: 0.1, y: 0), .zero])
        scheduler.advance(ms: 100)
        #expect(sent == [Stick(x: 0.1, y: 0), .zero])
    }

    @Test func returningToSentValueSendsNothing() {
        let scheduler = ManualScheduler()
        var sent: [Stick] = []
        let sender = MoveSender(scheduler: scheduler) { sent.append($0) }
        sender.update(Stick(x: 0.1, y: 0))
        scheduler.advance(ms: 5)
        sender.update(Stick(x: 0.2, y: 0))
        sender.update(Stick(x: 0.1, y: 0))
        scheduler.advance(ms: 100)
        #expect(sent == [Stick(x: 0.1, y: 0)])
        #expect(scheduler.pendingCount == 0)
    }

    @Test func resetForgetsStateAndTimer() {
        let scheduler = ManualScheduler()
        var sent: [Stick] = []
        let sender = MoveSender(scheduler: scheduler) { sent.append($0) }
        sender.update(Stick(x: 0.1, y: 0))
        sender.update(Stick(x: 0.2, y: 0))
        sender.reset()
        #expect(scheduler.pendingCount == 0)
        sender.update(Stick(x: 0.1, y: 0))
        #expect(sent == [Stick(x: 0.1, y: 0), Stick(x: 0.1, y: 0)])
    }
}

@Suite struct BackoffTests {
    @Test func stepsWithoutJitterAtMidpoint() {
        #expect((1...7).map { backoffDelayMs(attempt: $0, random: 0.5) } == [500, 1000, 2000, 4000, 5000, 5000, 5000])
    }

    @Test func jitterIsPlusMinusTwentyPercentAndCapped() {
        #expect(backoffDelayMs(attempt: 1, random: 0) == 400)
        #expect(backoffDelayMs(attempt: 1, random: 0.999_999) == 600)
        #expect(backoffDelayMs(attempt: 9, random: 0.999_999) == 5000)
        #expect(backoffDelayMs(attempt: 0, random: 0.5) == 500)
    }
}
