// CHAOS-147: Prüfung der Startparameter und Messvarianten ohne Xcode-Testziel.
// Läuft auf macOS und Linux:
//   swiftc app/Settings.swift app/Variants.swift tests/main.swift -o build/variants-check && build/variants-check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition {
        failures += 1
        print("FEHLER (Zeile \(line)): \(message)")
    }
}

let app = "/Applications/ChaosRenderSpike"
let upscaled05 = Variant.named("hoch-0.5-metalfx")!
let upscaled0667Bilinear = Variant.named("hoch-0.667-bilinear")!

// Ohne Startparameter und ohne Wahl: Standard, ARView nativ.
do {
    let s = Settings(arguments: [app])
    check(s.source == .standard, "Quelle Standard")
    check(!s.upscale, "Standard ist ARView")
    check(s.variantLabel == "Nativ (ARView)", "Etikett \(s.variantLabel)")
    check(s.matches(.native), "Standard entspricht nativ")
}

// Ohne Startparameter mit gespeicherter Wahl: die Wahl gilt.
do {
    let s = Settings(arguments: [app], stored: upscaled0667Bilinear)
    check(s.source == .stored, "Quelle gespeichert")
    check(s.upscale, "hochskaliert")
    check(abs(s.scale - 0.667) < 0.0001, "Skala \(s.scale)")
    check(s.scaler == "bilinear", "Skalierer \(s.scaler)")
    check(s.variantLabel == "Hochskaliert ×0,667, bilinear", "Etikett \(s.variantLabel)")
    check(s.matches(upscaled0667Bilinear) && !s.matches(upscaled05), "Häkchen nur bei der Wahl")
}

// Startparameter haben Vorrang, auch wenn sie die Variante gar nicht nennen (messreihe-atv.sh, Variante „arview“).
do {
    let s = Settings(arguments: [app, "--sekunden=20"], stored: upscaled05)
    check(s.source == .launch, "Quelle Startparameter")
    check(!s.upscale, "gespeicherte Wahl darf Startparameter nicht ergänzen")
    check(s.quitAfterMeasurement, "messreihe: beendet sich nach der Messung")
}
do {
    let s = Settings(arguments: [app, "--sekunden=20", "--hochskalieren=1", "--skala=0.667", "--msaa=0"],
                     stored: .native)
    check(s.upscale && abs(s.scale - 0.667) < 0.0001 && s.msaa == 0, "Startparameter wirken unverändert")
    check(s.scaler == "metalfx", "Skalierer Standard metalfx")
}
// Argumente ohne `--` (z. B. von Xcode) zählen nicht als Startparameter.
do {
    let s = Settings(arguments: [app, "-NSDocumentRevisionsDebugMode", "YES"], stored: upscaled05)
    check(s.source == .stored && s.upscale, "Xcode-Argumente verdrängen die Wahl nicht")
}

// Wahl im Menü: nur die Variantenschlüssel ändern sich.
do {
    let launched = Settings(arguments: [app, "--server=ws://pc:8787/ws", "--skalierer=bilinear", "--hochskalieren=1"])
    let s = launched.with(.native)
    check(s.source == .menu, "Quelle Menü")
    check(!s.upscale && s.raw["skalierer"] == nil, "Variantenschlüssel ersetzt")
    check(s.server == "ws://pc:8787/ws", "übrige Startparameter bleiben")
    let t = s.with(upscaled05)
    check(t.upscale && t.scale == 0.5 && t.scaler == "metalfx" && t.matches(upscaled05), "nativ → hochskaliert")
}

// Jede Variante überlebt den Weg über ihre Startparameter.
for variant in Variant.all {
    let args = [app] + variant.arguments.map { "--\($0.key)=\($0.value)" }
    let s = Settings(arguments: args)
    check(s.matches(variant), "\(variant.id) aus Startparametern")
    check(Variant.all.filter { s.matches($0) }.count == 1, "\(variant.id) eindeutig")
    check(Settings(arguments: [app], stored: variant).matches(variant), "\(variant.id) gespeichert")
}
check(Set(Variant.all.map(\.id)).count == Variant.all.count, "IDs eindeutig")

// Speichern und Laden, SpikeRun zählt Läufe.
do {
    let suite = "chaos-variants-check-\(ProcessInfo.processInfo.processIdentifier)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    check(VariantStore.load(defaults) == nil, "anfangs nichts gespeichert")
    var run = SpikeRun.atLaunch(arguments: [app], defaults: defaults)
    check(run.generation == 0 && run.settings.source == .standard, "erster Lauf Standard")
    run.choose(upscaled05, defaults: defaults)
    check(run.generation == 1 && run.settings.matches(upscaled05), "Wahl gilt sofort")
    check(VariantStore.load(defaults) == upscaled05, "Wahl gespeichert")
    let next = SpikeRun.atLaunch(arguments: [app], defaults: defaults)
    check(next.settings.source == .stored && next.settings.matches(upscaled05), "nächster Start nutzt die Wahl")
    let measured = SpikeRun.atLaunch(arguments: [app, "--sekunden=20"], defaults: defaults)
    check(!measured.settings.upscale, "nächster Start mit Startparametern ignoriert die Wahl")
    defaults.set("unbekannt", forKey: VariantStore.key)
    check(VariantStore.load(defaults) == nil, "unbekannte ID wird ignoriert")
}

if failures > 0 {
    print("\(failures) Prüfung(en) fehlgeschlagen")
    exit(1)
}
print("Varianten-Prüfung: alles grün")
