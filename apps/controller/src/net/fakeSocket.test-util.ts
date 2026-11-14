/** Nachgebauter WebSocket für Unit-Tests von Client und Sitzung (kein Netzwerk). */
import type { SocketFactory, SocketLike } from './client.ts';

export class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closedByClient = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    if (this.readyState !== 1) throw new Error('nicht offen');
    this.sent.push(data);
  }

  close() {
    this.closedByClient = true;
    this.readyState = 3;
  }

  // --- Steuerung durch den Test ---

  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  receive(data: unknown) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: text } as MessageEvent);
  }

  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  sentMessages(): Record<string, unknown>[] {
    return this.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
  }
}

export function fakeSocketFactory(): { factory: SocketFactory; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}
