const WINDOW_MS = 60_000;
const AUTHENTICATED_LIMIT = 5;
const ANONYMOUS_LIMIT = 20;

export type RunRateLimitIdentity = { kind: "learner"; userId: string } | { kind: "anonymous" };

export class InMemoryRunRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(identity: RunRateLimitIdentity): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    const key = identity.kind === "learner" ? `learner:${identity.userId}` : "anonymous:shared";
    const limit = identity.kind === "learner" ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT;
    const recent = (this.events.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

    if (recent.length >= limit) {
      this.events.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)),
      };
    }

    recent.push(now);
    this.events.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const processState = globalThis as typeof globalThis & { __vortexaRunRateLimiter?: InMemoryRunRateLimiter };
const rateLimiter = processState.__vortexaRunRateLimiter
  ?? (processState.__vortexaRunRateLimiter = new InMemoryRunRateLimiter());

export function consumeRunRateLimit(identity: RunRateLimitIdentity) {
  return rateLimiter.consume(identity);
}
