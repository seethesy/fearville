type VersionedView = {
  code: string;
  me: string;
  version: number;
  serverNow: number;
};

// A slow read must never roll back a newer action result or another update.
export function newestView<T extends VersionedView>(
  current: T | null,
  incoming: T,
): T {
  if (
    current &&
    current.code === incoming.code &&
    current.me === incoming.me &&
    (incoming.version < current.version ||
      (incoming.version === current.version &&
        incoming.serverNow < current.serverNow))
  )
    return current;
  return incoming;
}
