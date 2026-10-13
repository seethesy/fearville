// Durable Object input gates end at awaits. This queue covers the entire
// operation, including authentication and post-commit D1 synchronization.
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
