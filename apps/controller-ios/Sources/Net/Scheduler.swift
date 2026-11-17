// Monotonic time and one-shot timers for the session; tests inject a manual scheduler.
import Foundation

struct ScheduledTimer {
    let cancel: @MainActor () -> Void
}

@MainActor
protocol Scheduler: AnyObject {
    var now: ContinuousClock.Instant { get }
    func after(_ delay: Duration, _ action: @escaping @MainActor () -> Void) -> ScheduledTimer
}

@MainActor
final class LiveScheduler: Scheduler {
    var now: ContinuousClock.Instant { .now }

    func after(_ delay: Duration, _ action: @escaping @MainActor () -> Void) -> ScheduledTimer {
        let task = Task { @MainActor in
            try? await Task.sleep(for: delay)
            if !Task.isCancelled { action() }
        }
        return ScheduledTimer { task.cancel() }
    }
}

/// Reconnect wait before attempt `attempt` (1, 2, …) in ms (`backoffDelay` in `net/backoff.ts`).
/// `random` yields values in [0, 1).
func backoffDelayMs(attempt: Int, random: Double) -> Int {
    let steps = SessionTiming.backoffStepsMs
    let index = max(0, attempt - 1)
    let base = Double(index < steps.count ? steps[index] : SessionTiming.backoffMaxMs)
    let factor = 1 - SessionTiming.backoffJitter + 2 * SessionTiming.backoffJitter * random
    return Int(min(Double(SessionTiming.backoffMaxMs), max(0, base * factor)).rounded())
}
