// Pure controller state machine: port of `reduce`/`reduceServerMessage` in
// `apps/controller/src/state/reducer.ts` and `activatePrompt` in `board/countdown.ts`.
import Foundation

enum ControllerEvent: Equatable, Sendable {
    case connect(JoinTarget)
    case socketOpen
    /// Connection gone (or detected dead). No error screen: the session reconnects.
    case socketClosed
    case reconnectScheduled(attempt: Int)
    case gaveUp(UiErrorCode)
    case server(ServerMessage, receivedAt: ContinuousClock.Instant)
    /// Heartbeat round trip, measured by the session (it owns the clock origin of `t`).
    case rttMeasured(Double)
    case noticeDismissed(id: Int)
    case choiceSent(slot: Int, promptId: Int, option: String)
    case pickSent(slot: Int, character: CharacterId, seq: Int?)
}

enum ControllerReducer {
    /// `PICK_SEQ_MEMORY`
    static let pickSeqMemory = 8

    static func reduce(_ state: ControllerState, _ event: ControllerEvent) -> ControllerState {
        var state = state
        switch event {
        case .connect(let target):
            // New target = new session; same target = keep the old picture until the new context.
            if target != state.target { state = ControllerState(target: target) }
            state.connection = .connecting
            state.welcomed = false
            state.fatal = nil
            state.notice = nil
        case .socketOpen:
            state.connection = .open
        case .socketClosed:
            if state.connection == .closed && !state.welcomed { return state }
            state.connection = .closed
            state.welcomed = false
            state.choices = [:]
            state.picks = [:]
            state.pickSeqs = []
        case .reconnectScheduled(let attempt):
            state.attempt = attempt
        case .gaveUp(let reason):
            state.connection = .closed
            state.welcomed = false
            state.attempt = 0
            state.fatal = reason
        case .rttMeasured(let rtt):
            if rtt.isFinite && rtt >= 0 { state.rttMs = rtt }
        case .noticeDismissed(let id):
            if state.notice?.id == id { state.notice = nil }
        case .choiceSent(let slot, let promptId, let option):
            guard state.contexts[slot]?.prompt?.info.id == promptId else { return state }
            state.choices[slot] = PendingChoice(promptId: promptId, option: option)
        case .pickSent(let slot, let character, let seq):
            if let seq {
                state.pickSeqs = Array((state.pickSeqs + [PickSeq(seq: seq, slot: slot)]).suffix(pickSeqMemory))
            }
            // Only in a lobby with character choice; never pre-mark the character already owned.
            guard let lobby = state.contexts[slot]?.lobby, lobby.character != character else {
                state.picks[slot] = nil
                return state
            }
            state.picks[slot] = character
        case .server(let message, let receivedAt):
            return reduceServerMessage(state, message, receivedAt)
        }
        return state
    }

    private static func reduceServerMessage(
        _ state: ControllerState, _ message: ServerMessage, _ receivedAt: ContinuousClock.Instant
    ) -> ControllerState {
        var state = state
        switch message {
        case .welcome(let welcome):
            // After a rejoin the slots may differ: drop other slots, keep own until the next context.
            let slots = Set(welcome.players.map(\.slot))
            state.welcomed = true
            state.sessionToken = welcome.sessionToken
            state.players = welcome.players
            state.contexts = state.contexts.filter { slots.contains($0.key) }
            state.feedback = state.feedback.filter { slots.contains($0.key) }
            state.choices = [:]
            state.picks = [:]
            state.pickSeqs = []
            state.fatal = nil
            state.attempt = 0
        case .context(let message):
            let previous = state.contexts[message.slot]?.prompt
            let prompt = message.prompt.map { activatePrompt($0, previous: previous, receivedAt: receivedAt) }
            let context = SlotContext(
                phase: message.phase, layout: message.layout, actions: message.actions,
                prompt: prompt, board: message.board, minigame: message.minigame,
                lobby: message.lobby)
            state.contexts[message.slot] = context
            if let pending = state.choices[message.slot], prompt?.info.id != pending.promptId {
                state.choices[message.slot] = nil
            }
            if let pick = state.picks[message.slot], pickSettled(pick, context) {
                state.picks[message.slot] = nil
            }
        case .feedback(let feedback):
            state.counter += 1
            state.feedback[feedback.slot] = FeedbackPulse(kind: feedback.kind, id: state.counter)
        case .error(let error):
            let code = UiErrorCode(error.code)
            let pickSlots = Array(state.picks.keys)
            let noticeSlot: Int? =
                error.code != .characterTaken
                ? nil
                : (state.pickSeqs.first { $0.seq == error.seq }?.slot
                    ?? (pickSlots.count == 1 ? pickSlots[0] : nil))
            // Any rejection (also silent ones) may concern a pick: release it, the next context tells.
            state.picks = [:]
            switch code.severity {
            case .silent:
                break
            case .toast:
                state.counter += 1
                if error.code == .invalidChoice { state.choices = [:] }
                state.notice = Notice(code: code, id: state.counter, slot: noticeSlot)
            case .code:
                state.target = nil
                state.welcomed = false
                state.sessionToken = nil
                state.fatal = code
            case .blocking:
                state.fatal = code
            }
        case .heartbeatAck, .unknown:
            break
        }
        return state
    }

    /// A character pick is settled (confirmed or overtaken) by this context.
    private static func pickSettled(_ pick: CharacterId, _ context: SlotContext) -> Bool {
        guard context.phase == .lobby, let lobby = context.lobby else { return true }
        return lobby.character == pick || lobby.takenCharacters.contains(pick)
    }

    /// Same prompt id keeps the full bar length; the deadline follows the fresh server value.
    static func activatePrompt(
        _ info: Prompt, previous: ActivePrompt?, receivedAt: ContinuousClock.Instant
    ) -> ActivePrompt {
        guard let remaining = info.remainingMs else {
            return ActivePrompt(info: info, deadline: nil, totalMs: nil)
        }
        let previousTotal = previous?.info.id == info.id ? previous?.totalMs : nil
        return ActivePrompt(
            info: info, deadline: receivedAt + .milliseconds(remaining),
            totalMs: previousTotal.map { max($0, remaining) } ?? remaining)
    }
}
