import { describe, expect, it } from "vitest";
import { InMemoryRunRateLimiter } from "@/lib/run-rate-limit";

describe("InMemoryRunRateLimiter", () => {
  it("limits verified learners independently and expires requests after the window", () => {
    let now = 1_000;
    const limiter = new InMemoryRunRateLimiter(() => now);

    for (let request = 0; request < 5; request += 1) {
      expect(limiter.consume({ kind: "learner", userId: "learner-a" }).allowed).toBe(true);
    }
    expect(limiter.consume({ kind: "learner", userId: "learner-a" })).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume({ kind: "learner", userId: "learner-b" }).allowed).toBe(true);

    now += 60_000;
    expect(limiter.consume({ kind: "learner", userId: "learner-a" }).allowed).toBe(true);
  });

  it("uses a shared anonymous bucket rather than trusting client identity headers", () => {
    const limiter = new InMemoryRunRateLimiter(() => 1_000);

    for (let request = 0; request < 20; request += 1) {
      expect(limiter.consume({ kind: "anonymous" }).allowed).toBe(true);
    }
    expect(limiter.consume({ kind: "anonymous" }).allowed).toBe(false);
  });
});
