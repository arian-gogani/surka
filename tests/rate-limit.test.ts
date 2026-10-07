import { afterEach, describe, expect, it, vi } from "vitest";
import { signNotice, verifyNotice } from "@/lib/notice";
import { constantTimeEquals } from "@/lib/compare";
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
  it("prefers the header the platform sets, which a caller cannot forge", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.5",
      "x-forwarded-for": "10.0.0.1, 203.0.113.5",
    });
    expect(clientKey(headers)).toBe("203.0.113.5");
  });

  it("takes the last entry of x-forwarded-for, not the first", () => {
    // The platform appends the real address to whatever the client sent, so the
    // first entry is attacker-controlled. Keying on it meant a loop with a
    // different fake address each time got a fresh bucket every request, and
    // the public listing form's three-per-hour cap never engaged at all.
    const spoofed = new Headers({ "x-forwarded-for": "10.0.0.1, 150.172.238.178" });
    expect(clientKey(spoofed)).toBe("150.172.238.178");
  });

  it("trims whitespace around the address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "70.41.3.18,  203.0.113.5  " }))).toBe("203.0.113.5");
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

describe("constant time compare", () => {
  it("matches identical secrets", () => {
    expect(constantTimeEquals("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("rejects a secret that differs only in the last character", () => {
    expect(constantTimeEquals("Bearer abc123", "Bearer abc124")).toBe(false);
  });

  it("rejects a secret that differs only in the first character", () => {
    expect(constantTimeEquals("Bearer abc123", "Xearer abc123")).toBe(false);
  });

  it("rejects a prefix, which a short-circuiting compare would also reject but sooner", () => {
    expect(constantTimeEquals("Bearer abc", "Bearer abc123")).toBe(false);
  });

  it("rejects empty against a real secret", () => {
    expect(constantTimeEquals("", "Bearer abc123")).toBe(false);
  });
});

describe("result banners are the app's words, not a caller's", () => {
  const SECRET = "smoke-session-secret-0123456789";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a message it signed", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const signed = await signNotice({ ok: "Swap accepted. Your dates are below." });
    expect(await verifyNotice(signed.ok, signed.s)).toBe("Swap accepted. Your dates are below.");
  });

  it("drops a message nobody signed", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    // In the normal flow the proposer holds the partner's link, so they can
    // hand over a URL with whatever first-party-looking copy they like.
    expect(await verifyNotice("Wire the fee to restore this swap.", undefined)).toBeNull();
    expect(await verifyNotice("Wire the fee to restore this swap.", "0".repeat(20))).toBeNull();
  });

  it("drops a real signature attached to different words", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const signed = await signNotice({ ok: "Saved. Your listing is live." });
    expect(await verifyNotice("Your listing was removed for fraud.", signed.s)).toBeNull();
  });

  it("signs nothing, and so shows nothing, without a secret", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const signed = await signNotice({ ok: "Saved." });
    expect(signed.s).toBeUndefined();
    expect(await verifyNotice(signed.ok, signed.s)).toBeNull();
  });
});
