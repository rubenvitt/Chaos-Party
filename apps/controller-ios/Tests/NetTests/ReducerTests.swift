import Foundation
import Testing

@testable import ChaosController

private let t0 = ContinuousClock.now

private func reduce(_ state: ControllerState, _ events: ControllerEvent...) -> ControllerState {
    events.reduce(state, ControllerReducer.reduce)
}

private func server(_ message: ServerMessage, at offsetMs: Int = 0) -> ControllerEvent {
    .server(message, receivedAt: t0 + .milliseconds(offsetMs))
}

/// Joined on `testTarget` with slot 1.
private func joined(_ extra: ControllerEvent...) -> ControllerState {
    let base = reduce(ControllerState(), .connect(testTarget), .socketOpen, server(Msg.welcome()))
    return extra.reduce(base, ControllerReducer.reduce)
}

@Suite struct ReducerTests {
    @Test func startsOnJoinScreen() {
        let state = ControllerState()
        #expect(state.screen == .join)
        #expect(state.link == .hidden)
    }

    @Test func connectThenWelcomeShowsController() {
        let connecting = reduce(ControllerState(), .connect(testTarget))
        #expect(connecting.screen == .connecting)
        #expect(connecting.link == .connecting)
        let state = reduce(connecting, .socketOpen, server(Msg.welcome()))
        #expect(state.screen == .controller)
        #expect(state.ownSlot == 1)
        #expect(state.sessionToken == testToken)
        #expect(state.link == .online(rttMs: nil))
    }

    @Test func contextsPerSlotAndSlotScreens() {
        var state = joined(server(Msg.lobby()))
        #expect(state.slotScreen(1) == .lobby)
        #expect(state.slotScreen(2) == .wait)
        state = reduce(state, server(Msg.lobby(layout: .wait)))
        #expect(state.contexts[1]?.layout == .wait)
        state = reduce(state, server(Msg.play()))
        #expect(state.slotScreen(1) == .play)
        state = reduce(state, server(Msg.boardWaiting()))
        #expect(state.slotScreen(1) == .board)
    }

    @Test func slotScreenPriority() {
        let lobbyBasic = joined(server(.context(Context(slot: 1, phase: .lobby, layout: .lobby, actions: [.ready]))))
        #expect(lobbyBasic.slotScreen(1) == .lobbyBasic)
        let paused = joined(
            server(.context(Context(slot: 1, phase: .board, layout: .board, actions: [], board: Msg.board(paused: true)))))
        #expect(paused.slotScreen(1) == .pause)
        let final = joined(
            server(
                .context(
                    Context(slot: 1, phase: .board, layout: .board, actions: [], board: Msg.board(gamePhase: .gameResults)))))
        #expect(final.slotScreen(1) == .final)
    }

    @Test func feedbackCountsUp() {
        let feedback = server(.feedback(Feedback(slot: 1, kind: .hit)))
        let once = joined(feedback)
        let twice = reduce(once, feedback)
        #expect(once.feedback[1] == FeedbackPulse(kind: .hit, id: 1))
        #expect(twice.feedback[1] == FeedbackPulse(kind: .hit, id: 2))
    }

    @Test func badJoinCodeReturnsToJoinScreen() {
        let state = reduce(ControllerState(), .connect(testTarget), .socketOpen, server(Msg.error(.badJoinCode)))
        #expect(state.target == nil)
        #expect(state.screen == .join)
        #expect(state.joinError == UiErrorCode(.badJoinCode))
        #expect(state.sessionToken == nil)
    }

    @Test func toastAndSilentErrors() {
        let toast = joined(server(Msg.error(.rateLimited)))
        #expect(toast.notice == Notice(code: UiErrorCode(.rateLimited), id: 1))
        #expect(toast.screen == .controller)
        let silent = joined(server(Msg.error(.staleSeq)))
        #expect(silent == joined())
        let dismissed = reduce(toast, .noticeDismissed(id: 1))
        #expect(dismissed.notice == nil)
        #expect(reduce(toast, .noticeDismissed(id: 9)).notice != nil)
    }

    @Test func blockingErrorShowsErrorScreen() {
        let state = joined(server(Msg.error(.notJoined)))
        #expect(state.screen == .error)
        #expect(state.link == .hidden)
    }

    @Test func socketClosedKeepsPlayersAndShowsOverlay() {
        let state = joined(server(Msg.lobby()), .socketClosed, .reconnectScheduled(attempt: 1))
        #expect(state.screen == .controller)
        #expect(state.players == [blue])
        #expect(state.contexts[1] != nil)
        #expect(state.link == .reconnecting(attempt: 1, hadSession: true))
        let back = reduce(state, .connect(testTarget), .socketOpen, server(Msg.welcome()))
        #expect(back.attempt == 0)
        #expect(back.link == .online(rttMs: nil))
        #expect(back.contexts[1] != nil)
    }

    @Test func unreachablePcBeforeFirstWelcome() {
        let state = reduce(ControllerState(), .connect(testTarget), .socketClosed, .reconnectScheduled(attempt: 2))
        #expect(state.screen == .connecting)
        #expect(state.link == .reconnecting(attempt: 2, hadSession: false))
    }

    @Test func gaveUpShowsReason() {
        let state = joined(.gaveUp(.replaced))
        #expect(state.screen == .error)
        #expect(state.fatal == .replaced)
        #expect(state.attempt == 0)
        #expect(state.connection == .closed)
    }

    @Test func newTargetStartsFresh() {
        let state = joined(server(Msg.lobby()), .connect(otherTarget))
        #expect(state.players.isEmpty)
        #expect(state.contexts.isEmpty)
        #expect(state.target == otherTarget)
    }

    @Test func rejoinWithOtherSlotDropsForeignContexts() {
        let state = joined(
            server(Msg.lobby()), .socketClosed, .connect(testTarget),
            server(Msg.welcome([PlayerInfo(slot: 2, color: "#E69F00", label: "Orange")], token: "tok_new")))
        #expect(state.contexts[1] == nil)
        #expect(state.ownSlot == 2)
        #expect(state.sessionToken == "tok_new")
    }

    @Test func rttFromMeasuredValue() {
        #expect(joined(.rttMeasured(12.5)).rttMs == 12.5)
        #expect(joined(.rttMeasured(-1)).rttMs == nil)
        #expect(joined(.rttMeasured(.nan)).rttMs == nil)
        #expect(joined(.rttMeasured(12.5)).link == .online(rttMs: 12.5))
    }

    @Test func unknownMessageLeavesStateUnchanged() {
        let state = joined(server(Msg.lobby()))
        #expect(reduce(state, server(.unknown(type: "lobby"))) == state)
    }

    // MARK: Board prompts

    @Test func promptGetsLocalDeadline() throws {
        let state = joined(server(Msg.prompt(id: 7, remainingMs: 10_000), at: 1_000))
        let prompt = try #require(state.ownPrompt(1))
        #expect(prompt.deadline == t0 + .milliseconds(11_000))
        #expect(prompt.totalMs == 10_000)
        #expect(prompt.fraction(at: t0 + .milliseconds(6_000)) == 0.5)
        let unlimited = joined(server(Msg.prompt(id: 8, remainingMs: nil)))
        #expect(unlimited.ownPrompt(1)?.deadline == nil)
        #expect(unlimited.ownPrompt(1)?.fraction(at: t0) == nil)
    }

    @Test func samePromptKeepsTotalLength() throws {
        let state = joined(server(Msg.prompt(id: 7, remainingMs: 10_000)), server(Msg.prompt(id: 7, remainingMs: 4_000), at: 6_000))
        let prompt = try #require(state.ownPrompt(1))
        #expect(prompt.totalMs == 10_000)
        #expect(prompt.deadline == t0 + .milliseconds(10_000))
        let fresh = reduce(state, server(Msg.prompt(id: 8, remainingMs: 4_000)))
        #expect(fresh.ownPrompt(1)?.totalMs == 4_000)
    }

    @Test func contextReplacesPreviousCompletely() {
        let state = joined(server(Msg.prompt(id: 7)), server(Msg.boardWaiting()))
        #expect(state.contexts[1]?.prompt == nil)
        #expect(state.ownPrompt(1) == nil)
    }

    @Test func choiceLocksUntilAnotherPrompt() {
        var state = joined(server(Msg.prompt(id: 7)), .choiceSent(slot: 1, promptId: 7, option: "roll"))
        #expect(state.isLocked(1))
        state = reduce(state, server(Msg.prompt(id: 7, remainingMs: 5_000)))
        #expect(state.isLocked(1))
        state = reduce(state, server(Msg.prompt(id: 8)))
        #expect(!state.isLocked(1))
        #expect(state.choices.isEmpty)
    }

    @Test func choiceOnlyLocksTheShownPrompt() {
        let state = joined(server(Msg.prompt(id: 7)), .choiceSent(slot: 1, promptId: 6, option: "roll"))
        #expect(state.choices.isEmpty)
        #expect(!state.isLocked(1))
    }

    @Test func invalidChoiceUnlocksWithNotice() {
        let state = joined(
            server(Msg.prompt(id: 7)), .choiceSent(slot: 1, promptId: 7, option: "roll"),
            server(Msg.error(.invalidChoice)))
        #expect(!state.isLocked(1))
        #expect(state.notice?.code == UiErrorCode(.invalidChoice))
    }

    @Test func connectionLossAndWelcomeUnlock() {
        let locked = joined(server(Msg.prompt(id: 7)), .choiceSent(slot: 1, promptId: 7, option: "roll"))
        #expect(reduce(locked, .socketClosed).choices.isEmpty)
        #expect(reduce(locked, server(Msg.welcome())).choices.isEmpty)
    }

    // MARK: Character picks

    @Test func pickIsPendingUntilConfirmed() {
        var state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 1))
        #expect(state.picks[1] == .cactus)
        #expect(state.pickSeqs == [PickSeq(seq: 1, slot: 1)])
        state = reduce(state, server(Msg.lobby(character: .cactus)))
        #expect(state.picks.isEmpty)
    }

    @Test func pickOvertakenWhenTakenByOther() {
        let state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 1), server(Msg.lobby(taken: [.cactus])))
        #expect(state.picks.isEmpty)
    }

    @Test func unrelatedLobbyContextKeepsPick() {
        let state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 1), server(Msg.lobby(taken: [.robot])))
        #expect(state.picks[1] == .cactus)
    }

    @Test func characterTakenNoticeNamesSlotBySeq() {
        let state = joined(
            server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 3),
            server(Msg.lobby(taken: [.cactus])), server(Msg.error(.characterTaken, seq: 3)))
        #expect(state.notice == Notice(code: UiErrorCode(.characterTaken), id: 1, slot: 1))
        #expect(state.picks.isEmpty)
    }

    @Test func characterTakenNoticeFallsBackToOnlyPick() {
        let state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: nil), server(Msg.error(.characterTaken, seq: 9)))
        #expect(state.notice?.slot == 1)
    }

    @Test func silentErrorReleasesPick() {
        let state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 1), server(Msg.error(.staleSeq)))
        #expect(state.picks.isEmpty)
        #expect(state.notice == nil)
    }

    @Test func pickOutsideLobbyOrOwnCharacterIsNotMarked() {
        #expect(joined(server(Msg.boardWaiting()), .pickSent(slot: 1, character: .cactus, seq: 1)).picks.isEmpty)
        #expect(joined(server(Msg.lobby(character: .cactus)), .pickSent(slot: 1, character: .cactus, seq: 1)).picks.isEmpty)
    }

    @Test func pickSeqMemoryIsBounded() {
        var state = joined(server(Msg.lobby()))
        for seq in 1...10 { state = reduce(state, .pickSent(slot: 1, character: .sock, seq: seq)) }
        #expect(state.pickSeqs.map(\.seq) == Array(3...10))
    }

    @Test func connectionLossReleasesPick() {
        let state = joined(server(Msg.lobby()), .pickSent(slot: 1, character: .cactus, seq: 1), .socketClosed)
        #expect(state.picks.isEmpty)
        #expect(state.pickSeqs.isEmpty)
    }
}
