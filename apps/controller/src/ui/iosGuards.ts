/**
 * Schutz gegen iOS-Safari-Eigenheiten beim Spielen (Annahme A4, ADR-006).
 *
 * CSS (`styles.css`) schaltet Zoom-Gesten, Auswahl, Callout und Überscrollen
 * schon weitgehend ab; diese Handler fangen ab, was Safari trotz
 * `user-scalable=no` und `touch-action` noch durchlässt:
 * - `gesturestart`/`gesturechange`/`gestureend` (Pinch-Zoom, nur WebKit),
 * - `dblclick` (Doppeltipp-Zoom),
 * - `touchmove` außerhalb von Eingabefeldern (Scrollen, Gummiband, Pull-to-Refresh),
 * - `contextmenu` und `selectstart` (Lupe, Kopieren-Menü bei langem Drücken).
 *
 * Ob das auf echter Hardware reicht, prüft nur die Gerätecheckliste.
 */

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, [contenteditable="true"]') !== null
  );
}

export function installIosGuards(doc: Document = document): () => void {
  const prevent = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const preventOutsideInputs = (event: Event) => {
    if (!isEditable(event.target) && event.cancelable) event.preventDefault();
  };
  const preventTouchMove = (event: TouchEvent) => {
    // Mehrere Finger (Pinch) immer abfangen, sonst nur außerhalb von Eingabefeldern.
    if ((event.touches.length > 1 || !isEditable(event.target)) && event.cancelable) {
      event.preventDefault();
    }
  };

  const active = { passive: false } as const;
  doc.addEventListener('gesturestart', prevent, active);
  doc.addEventListener('gesturechange', prevent, active);
  doc.addEventListener('gestureend', prevent, active);
  doc.addEventListener('dblclick', prevent, active);
  doc.addEventListener('touchmove', preventTouchMove, active);
  doc.addEventListener('contextmenu', preventOutsideInputs, active);
  doc.addEventListener('selectstart', preventOutsideInputs, active);

  return () => {
    doc.removeEventListener('gesturestart', prevent);
    doc.removeEventListener('gesturechange', prevent);
    doc.removeEventListener('gestureend', prevent);
    doc.removeEventListener('dblclick', prevent);
    doc.removeEventListener('touchmove', preventTouchMove);
    doc.removeEventListener('contextmenu', preventOutsideInputs);
    doc.removeEventListener('selectstart', preventOutsideInputs);
  };
}
