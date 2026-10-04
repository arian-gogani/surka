import { describe, expect, it } from "vitest";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const WINDOW = 60_000;
const START = 1_000_000;

/** Each test uses its own key, since the limiter keeps module-level state. */
let seq = 0;
const nextKey = () => `key-${seq++}`;

describe("rate limit", () => {
  it("allows requests up to the limit", () => {
    const key = nextKey();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, WINDOW, START).ok).toBe(true);
    }
  });

  it("refuses the one past the limit", () => {
    const key = nextKey();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, WINDOW, START);
    expect(rateLimit(key, 3, WINDOW, START)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("counts down the retry as the window elapses", () => {
    const key = nextKey();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, WINDOW, START);
    const result = rateLimit(key, 3, WINDOW, START + 45_000);
    expect(result).toEqual({ ok: false, retryAfterSeconds: 15 });
  });

  it("starts a fresh window once the old one expires", () => {
    const key = nextKey();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, WINDOW, START);
    expect(rateLimit(key, 3, WINDOW, START + WINDOW).ok).toBe(true);
  });

  it("keeps separate counts per key, so one caller can't exhaust another", () => {
    const noisy = nextKey();
    const quiet = nextKey();
    for (let i = 0; i < 3; i++) rateLimit(noisy, 3, WINDOW, START);
    expect(rateLimit(noisy, 3, WINDOW, START).ok).toBe(false);
    expect(rateLimit(quiet, 3, WINDOW, START).ok).toBe(true);
  });
});

describe("client key", () => {
  it("takes the first entry of x-forwarded-for, which is the original client", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
    expect(clientKey(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" }))).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("buckets unknown callers together rather than letting them through unlimited", () => {
    expect(clientKey(new Headers())).toBe("unknown");
    // An empty forwarded header must not produce an empty key per caller.
    expect(clientKey(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
