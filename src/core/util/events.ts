export interface Disposable {
  dispose(): void;
}

/** Minimal typed event emitter, so the engine needs no host event API. */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(value: T): void {
    this.listeners.forEach((listener) => listener(value));
  }

  dispose(): void {
    this.listeners.clear();
  }
}
