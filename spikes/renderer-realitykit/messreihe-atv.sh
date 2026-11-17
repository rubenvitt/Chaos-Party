#!/usr/bin/env bash
# CHAOS-114: Messreihe auf der echten Apple TV (oder einem anderen gekoppelten Gerät).
# Startet die installierte Spike-App nacheinander mit jeder Variante, Metal-HUD an, und fasst zusammen:
# Anzeige-fps aus SPIKE-ERGEBNIS und GPU-Zeit je Bild aus den metal-HUD-Zeilen.
#
#   ./messreihe-atv.sh <geraete-id> [sekunden] [variante …]
#   ./messreihe-atv.sh --auswerten <ordner>        # nur Zusammenfassung vorhandener Logs
#
# Geräte-ID: `xcrun devicectl list devices`. Ohne Variantenliste laufen alle unten.
set -euo pipefail
export LC_ALL=C   # Dezimalpunkt in awk/printf, auch unter deutscher Locale

BUNDLE=dev.rubeen.chaosparty.renderspike

# name|argumente
VARIANTEN=(
  "arview|"
  "hoch-0.5-metalfx|--hochskalieren=1 --skala=0.5"
  "hoch-0.5-metalfx-msaa0|--hochskalieren=1 --skala=0.5 --msaa=0"
  "hoch-0.5-bilinear|--hochskalieren=1 --skala=0.5 --skalierer=bilinear"
  "hoch-0.667-metalfx|--hochskalieren=1 --skala=0.667"
  "hoch-0.667-metalfx-msaa0|--hochskalieren=1 --skala=0.667 --msaa=0"
  "hoch-0.5-imflug1|--hochskalieren=1 --skala=0.5 --imflug=1"
  "hoch-0.5-imflug3|--hochskalieren=1 --skala=0.5 --imflug=3"
  # Diagnose bei nativer Auflösung (pixelgebunden, also sichtbare Unterschiede): wo entstehen die Kosten?
  "diag-4k|--hochskalieren=1 --skala=1 --skalierer=bilinear"
  "diag-4k-msaa0|--hochskalieren=1 --skala=1 --skalierer=bilinear --msaa=0"
  "diag-4k-tonemapping0|--hochskalieren=1 --skala=1 --skalierer=bilinear --tonemapping=0"
  "diag-4k-ibl0|--hochskalieren=1 --skala=1 --skalierer=bilinear --ibl=0"
  "diag-4k-einfach|--hochskalieren=1 --skala=1 --skalierer=bilinear --material=einfach"
  "diag-4k-unbeleuchtet|--hochskalieren=1 --skala=1 --skalierer=bilinear --material=unbeleuchtet"
  "diag-4k-minimum|--hochskalieren=1 --skala=1 --skalierer=bilinear --msaa=0 --tonemapping=0 --ibl=0 --material=unbeleuchtet --schatten=0 --gras=0"
)

# Median und p95 der GPU-Zeiten aus metal-HUD-Zeilen:
# "metal-HUD: n, Speicher, Speicher, Bildabstand, GPU, Bildabstand, GPU, …" (Paare in ms).
hud_gpu() {
  grep -o 'metal-HUD:.*' "$1" | awk -F', *' '
    { sub(/^metal-HUD: */, "", $1); for (i = 5; i <= NF; i += 2) if ($i + 0 > 0) print $i + 0 }
  ' | sort -n | awk '
    { v[NR] = $1 }
    END {
      if (NR == 0) { print "–\t–"; exit }
      m = v[int((NR - 1) * 0.5 + 0.5) + 1]; p = v[int((NR - 1) * 0.95 + 0.5) + 1]
      printf "%.1f\t%.1f\n", m, p
    }'
}

# Ein Zahlenfeld aus der SPIKE-ERGEBNIS-Zeile (JSON, Schlüssel sortiert).
feld() {
  grep -o 'SPIKE-ERGEBNIS .*' "$1" | tail -1 | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '"' || true
}

auswerten() {
  local dir=$1
  printf 'variante\tfps\tmedian_ms\tp95_ms\tintern\tskalierer\tgpu_hud_median_ms\tgpu_hud_p95_ms\thochskal_gpu_ms\tausgelassen\n' \
    | tee "$dir/zusammenfassung.tsv"
  for log in "$dir"/*.log; do
    local name fps med p95 intern skal hud hs aus
    name=$(basename "$log" .log)
    fps=$(feld "$log" fps_mittel); med=$(feld "$log" bildabstand_ms_median); p95=$(feld "$log" bildabstand_ms_p95)
    intern=$(grep -o 'SPIKE-ERGEBNIS .*' "$log" | tail -1 | grep -o '"intern":\[[0-9]*,[0-9]*\]' | grep -o '[0-9]*,[0-9]*' | tr , x || true)
    skal=$(feld "$log" skalierer); hs=$(feld "$log" hochskalieren_gpu_ms_median); aus=$(feld "$log" ausgelassene_takte)
    hud=$(hud_gpu "$log")
    printf '%s\t%.4s\t%.5s\t%.5s\t%s\t%s\t%s\t%.4s\t%s\n' "$name" "${fps:-–}" "${med:-–}" "${p95:-–}" "${intern:-nativ}" \
      "${skal:-–}" "$hud" "${hs:-–}" "${aus:-–}" | tee -a "$dir/zusammenfassung.tsv"
  done
}

if [[ ${1:-} == --auswerten ]]; then
  auswerten "${2:?Ordner mit .log-Dateien}"
  exit 0
fi

DEVICE=${1:?Geräte-ID aus xcrun devicectl list devices}
DAUER=${2:-20}
shift $(( $# >= 2 ? 2 : 1 ))
OUT=${OUT:-messreihe-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$OUT"
echo "Ausgabe: $OUT"

for eintrag in "${VARIANTEN[@]}"; do
  name=${eintrag%%|*}
  args=${eintrag#*|}
  if (( $# > 0 )) && [[ " $* " != *" $name "* ]]; then continue; fi
  echo "== $name: $args"
  # shellcheck disable=SC2086  # args absichtlich in Wörter zerlegen
  xcrun devicectl device process launch --device "$DEVICE" --console --terminate-existing \
    --environment-variables '{"MTL_HUD_ENABLED":"1","MTL_HUD_LOG_ENABLED":"1"}' \
    "$BUNDLE" --sekunden="$DAUER" $args >"$OUT/$name.log" 2>&1 || echo "   (Exit-Code $?, siehe $OUT/$name.log)"
  grep -o 'SPIKE-ERGEBNIS .*' "$OUT/$name.log" | tail -1 || echo "   kein SPIKE-ERGEBNIS"
  sleep 3   # Gerät abkühlen lassen / App sauber beendet
done

auswerten "$OUT"
