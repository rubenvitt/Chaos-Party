// UI logic behind the screens (CHAOS-115): ports of the web view functions and the intents
// the tap handlers send to `FakeControllerSession`. No XCUITest target exists (project.yml),
// so the handlers are exercised here the way the views call them.
import Foundation
import Testing

@testable import ChaosControllerKit

@Suite struct JoystickMathTests {
    @Test func deadZoneIsExactlyZero() {
        #expect(StickInput(dx: 10, dy: 5, radius: 100) == .zero)
    }

    @Test func fullDeflectionRightIsOne() {
        #expect(StickInput(dx: 100, dy: 0, radius: 100) == StickInput(x: 1, y: 0))
    }

    @Test func screenUpIsPositiveY() {
        #expect(StickInput(dx: 0, dy: -100, radius: 100) == StickInput(x: 0, y: 1))
    }

    @Test func outsideTheRingIsClampedAndNeverLongerThanOne() {
        for (dx, dy) in [(300.0, 300.0), (-170.0, 90.0), (71.0, -71.0), (1e6, 3.0)] {
            let stick = StickInput(dx: dx, dy: dy, radius: 100)
            #expect((stick.x * stick.x + stick.y * stick.y).squareRoot() <= 1)
        }
    }

    @Test func valuesAreTruncatedTowardZeroOnTheGrid() {
        let stick = StickInput(dx: 55.5, dy: -33.3, radius: 100)
        #expect(stick.x >= 0 && stick.y >= 0)
        #expect(abs(stick.x * 100 - (stick.x * 100).rounded()) < 1e-9)
        #expect(StickInput.quantize(-0.0049) == 0)
        #expect(StickInput.quantize(0.999) == 0.99)
    }

    @Test func invalidInputIsReleased() {
        #expect(StickInput(dx: .nan, dy: 1, radius: 100) == .zero)
        #expect(StickInput(dx: 50, dy: 1, radius: 0) == .zero)
    }

    @Test func knobStaysOnTheRing() {
        let knob = knobOffset(CGSize(width: 300, height: 400), radius: 50)
        #expect(abs(knob.width - 30) < 1e-9 && abs(knob.height - 40) < 1e-9)
    }
}

@MainActor
@Suite struct PadInputTests {
    /// Same edge handling as `PadButton.update()`: touch state AND connection.
    private func drive(_ steps: [(touching: Bool, online: Bool)]) -> [String] {
        let session = FakeControllerSession(.minigamePlaySample)
        var hold = Hold()
        for step in steps {
            switch hold.update(touching: step.touching, online: step.online) {
            case .press: session.press(slot: 1, .a)
            case .release: session.release(slot: 1, .a)
            case nil: break
            }
        }
        return session.sent
    }

    @Test func tapIsOnePressReleasePair() {
        #expect(drive([(true, true), (true, true), (false, true)]) == ["press 1 a", "release 1 a"])
    }

    @Test func connectionLossReleasesOnceAndLiftSendsNothingMore() {
        #expect(drive([(true, true), (true, false), (false, false), (false, true)]) == ["press 1 a", "release 1 a"])
    }

    @Test func fingerHeldThroughReconnectStaysInert() {
        #expect(drive([(true, true), (true, false), (true, true)]) == ["press 1 a", "release 1 a"])
        #expect(drive([(true, true), (true, false), (true, true), (false, true), (true, true)])
            == ["press 1 a", "release 1 a", "press 1 a"])
    }

    @Test func holdOnlyStartsWhileOnline() {
        #expect(drive([(true, false), (false, false)]).isEmpty)
    }
}

@MainActor
@Suite struct LayoutModelTests {
    @Test func minigamePlayShowsStickAndLabelledA() throws {
        let context = try #require(ControllerState.minigamePlaySample.contexts[1])
        let layout = PlayLayout(actions: context.actions, minigame: context.minigame)
        #expect(layout.stick)
        #expect(layout.stickHint == "Ziehen: Lenken")
        #expect(layout.buttons.map(\.button) == [.a])
        #expect(layout.buttons.map(\.label) == ["Pumpen"])
        #expect(layout.title == "Pump-Rennen")
    }

    @Test func arenaWithoutMinigameShowsLettersOnly() {
        let layout = PlayLayout(actions: [.move, .buttonA, .buttonB], minigame: nil)
        #expect(layout.stick && layout.title == nil)
        #expect(layout.buttons.map(\.button) == [.a, .b])
        #expect(layout.buttons.allSatisfy { $0.label == nil })
        #expect(layout.stickHint == "Ziehen zum Laufen")
    }

    @Test func controlsCanHideOfferedElements() throws {
        var minigame = try #require(ControllerState.minigamePlaySample.contexts[1]?.minigame)
        minigame.controls = MinigameControls(joystick: nil, a: "Springen", b: nil)
        let layout = PlayLayout(actions: [.move, .buttonA, .buttonB], minigame: minigame)
        #expect(!layout.stick)
        #expect(layout.buttons.map(\.button) == [.a])
    }

    @Test func rollPromptHasDiceMainAndItemExtra() throws {
        let prompt = try #require(ControllerState.rollPromptSample.ownPrompt(1))
        let layout = PromptLayout(prompt.info)
        #expect(layout.main.map(\.id) == ["roll"])
        #expect(layout.main.first?.tone == .roll)
        #expect(layout.extra.map(\.id) == ["item:double-dice"])
        #expect(layout.extra.first?.tone == .item)
    }

    @Test func targetPromptColorsPlayersAndMovesCancelToExtra() throws {
        let prompt = try #require(ControllerState.targetPromptSample.ownPrompt(1))
        let layout = PromptLayout(prompt.info)
        #expect(layout.main.map(\.slot) == [2, 3])
        #expect(layout.main.allSatisfy { $0.tone == .target })
        #expect(layout.extra.map(\.tone) == [.cancel])
    }

    @Test func unknownPromptKindIsAPlainList() {
        let prompt = Prompt(
            id: 1, slot: 1, kind: "vote", title: "?", options: [PromptOption(id: "x", label: "X")],
            remainingMs: nil)
        let layout = PromptLayout(prompt)
        #expect(layout.kind == "other" && layout.main.map(\.tone) == [.plain])
    }

    @Test func lobbyMarksTakenOwnerAndPendingPick() throws {
        let context = try #require(ControllerState.lobbySample.contexts[1])
        let fresh = try #require(LobbyModel(context: context, pending: nil))
        #expect(fresh.cards.map(\.state) == [.taken, .free, .free, .free])
        #expect(fresh.cards[0].ownerSlot == 2 && fresh.cards[0].tag == "Orange hat sie")
        #expect(fresh.hint == "Tippe auf eine Figur.")
        #expect(fresh.roundsLabel == "5 Runden")

        let picked = try #require(LobbyModel(context: context, pending: .cactus))
        #expect(picked.cards[1].state == .mine && picked.cards[1].pending)
        #expect(picked.cards[1].tag == "Wird gewählt …")
        // A pending pick of a taken character does not count.
        #expect(LobbyModel(context: context, pending: .robot)?.character == nil)
    }

    @Test func readyLobbyShowsReadyHint() throws {
        let context = try #require(ControllerState.lobbyReadySample.contexts[1])
        let model = try #require(LobbyModel(context: context, pending: nil))
        #expect(model.ready && !model.canReady)
        #expect(model.cards[1].state == .mine && !model.cards[1].pending)
    }
}

@MainActor
@Suite struct FakeIntentTests {
    @Test func lobbyTapsSendPickAndReady() throws {
        let session = FakeControllerSession(.lobbySample)
        let context = try #require(session.state.contexts[1])
        let card = try #require(LobbyModel(context: context, pending: nil)?.cards.first { $0.selectable })
        session.pickCharacter(slot: 1, card.id)
        session.setReady(slot: 1)
        #expect(session.sent == ["pick-character 1 cactus", "ready 1"])
        #expect(session.state.slotScreen(1) == .lobby)
        #expect(session.state.contexts[1]?.layout == .wait)
    }

    @Test func choiceIsSentOncePerPrompt() {
        let session = FakeControllerSession(.rollPromptSample)
        #expect(session.choose(slot: 1, promptId: 7, option: "roll"))
        #expect(!session.choose(slot: 1, promptId: 7, option: "item:double-dice"))
        #expect(session.sent == ["choose 1 7 roll"])
        #expect(session.state.isLocked(1))
    }
}

@Suite struct HapticTests {
    @Test func feedbackKindsMapToPatterns() {
        #expect(haptic(.confirm) == .impact)
        #expect(haptic(.hit) == .impact)
        #expect(haptic(.win) == .success)
        #expect(haptic(.lose) == .warning)
        #expect(haptic(.miss) != nil)
        #expect(haptic("future-kind") == nil)
        #expect(haptic(nil) == nil)
    }
}
