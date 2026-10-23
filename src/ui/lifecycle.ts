// Cleanup for things a screen sets up (ResizeObservers, listeners) that must stop when it is replaced.

let disposers: (() => void)[] = [];

export function onDispose(fn: () => void): void {
  disposers.push(fn);
}

export function disposeAll(): void {
  const list = disposers;
  disposers = [];
  list.forEach((fn) => fn());
}
