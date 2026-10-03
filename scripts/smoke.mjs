#!/usr/bin/env node
/**
 * End-to-end smoke test against a production build.
 *
 * Starts `next start` on a throwaway database, then runs a whole swap through
 * the real HTML forms, posted the way a browser without JavaScript posts them:
 * operator sign-in, businesses, a new swap, sending it, the partner accepting,
 * delivery with proof, checking, completion, and a tracking redirect.
 *
 * Usage: npm run build && npm run smoke
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = {
  ADMIN_PASSWORD: "smoke-password",
  SESSION_SECRET: "smoke-session-secret-0123456789",
  CRON_SECRET: "smoke-cron-secret",
  APP_URL: BASE,
};

let failures = 0;
function check(condition, label) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

/** The form containing `marker`: its action field and hidden inputs. */
function findForm(html, marker) {
  for (const chunk of html.split("<form").slice(1)) {
    const body = chunk.split("</form>")[0];
    if (!body.includes(marker)) continue;
    const action = body.match(/name="(\$ACTION_ID_[^"]+)"/);
    if (!action) continue;
    const hidden = {};
    for (const input of body.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = input[0].match(/name="([^"]+)"/)?.[1];
      const value = input[0].match(/value="([^"]*)"/)?.[1] ?? "";
      if (name && !name.startsWith("$ACTION")) hidden[name] = value;
    }
    return { actionField: action[1], hidden };
  }
  throw new Error(`No form containing ${marker}`);
}

let cookie = "";
async function get(pathname) {
  const res = await fetch(BASE + pathname, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

/** Submits the form containing `marker` on `pathname`, like a browser would. */
async function submit(pathname, marker, fields) {
  const page = await get(pathname);
  const form = findForm(page.html, marker);
  const body = new FormData();
  body.set(form.actionField, "");
  for (const [key, value] of Object.entries({ ...form.hidden, ...fields })) body.set(key, value);
  const res = await fetch(BASE + pathname, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { origin: BASE, ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie?.startsWith("ambo_operator=")) cookie = setCookie.split(";")[0];
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

function query(location, key) {
  return new URL(location, BASE).searchParams.get(key);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE + "/");
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not start");
}

async function run() {
  console.log("Public pages");
  const home = await get("/");
  check(home.status === 200 && home.html.includes("Partner swaps that actually happen"), "landing page renders");
  check((await get("/d/not-a-real-token")).status === 404, "unknown swap link is a 404");
  check((await get("/admin")).location?.endsWith("/admin/login"), "dashboard redirects to sign in");

  console.log("Operator sign in");
  const wrong = await submit("/admin/login", 'name="password"', { password: "nope" });
  check(query(wrong.location, "error") === "That password isn't right.", "wrong password is refused");
  await submit("/admin/login", 'name="password"', { password: ENV.ADMIN_PASSWORD });
  check(cookie.startsWith("ambo_operator="), "right password starts a session");
  check((await get("/admin")).status === 200, "dashboard opens with the session");

  console.log("Businesses and a new swap");
  await submit("/admin/parties", 'name="offers"', {
    name: "Clinic Scheduler",
    kind: "app",
    website: "https://clinicscheduler.example",
    email: "dana@clinicscheduler.example",
  });
  const added = await submit("/admin/parties", 'name="offers"', { name: "Practice Manager Weekly", kind: "newsletter" });
  check(query(added.location, "ok") === "Business added.", "businesses are added");

  const newSwapPage = await get("/admin/swaps/new");
  const ids = [...newSwapPage.html.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)<\/option>/g)];
  const idFor = (name) => ids.find((m) => m[2] === name)?.[1];
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const oneSided = await submit("/admin/swaps/new", 'name="partyAId"', {
    title: "One-sided",
    partyAId: idFor("Clinic Scheduler"),
    partyBId: idFor("Practice Manager Weekly"),
    "commitments.0.side": "a",
    "commitments.0.description": "Feature them",
    "commitments.0.dueDate": due,
  });
  check(query(oneSided.location, "error") !== null, "a swap where only one side gives is refused");

  const created = await submit("/admin/swaps/new", 'name="partyAId"', {
    title: "Newsletter feature for an extended trial",
    partyAId: idFor("Clinic Scheduler"),
    partyBId: idFor("Practice Manager Weekly"),
    "commitments.0.side": "a",
    "commitments.0.description": "An extra free month for readers",
    "commitments.0.dueDate": due,
    "commitments.1.side": "b",
    "commitments.1.description": "A dedicated section in the next issue",
    "commitments.1.dueDate": due,
  });
  const swapPath = new URL(created.location, BASE).pathname;
  check(/^\/admin\/swaps\/[0-9a-f-]{36}$/.test(swapPath), "swap is created");

  const swapPage = await get(swapPath);
  const tokens = [...swapPage.html.matchAll(/\/d\/([A-Za-z0-9_-]{24})/g)].map((m) => m[1]);
  const [partnerToken, proposerToken] = [...new Set(tokens)];
  check(Boolean(partnerToken && proposerToken), "both private links are shown");

  console.log("Sending and the partner's answer");
  const draftView = (await get(`/d/${partnerToken}`)).html;
  check(/isn(&#x27;|')t ready yet/.test(draftView), "partner can't see a draft");
  await submit(swapPath, "Mark as sent", {});
  const partnerPage = await get(`/d/${partnerToken}`);
  check(partnerPage.html.includes("wants to swap with you"), "partner sees the proposal");

  const counterless = await submit(`/d/${partnerToken}`, 'name="message"', { token: partnerToken, decision: "counter" });
  check(query(counterless.location, "error")?.includes("rework the terms") ?? false, "a counter needs a message");

  const accepted = await submit(`/d/${partnerToken}`, 'name="message"', {
    token: partnerToken,
    decision: "accept",
    email: "sam@pmweekly.example",
  });
  check(query(accepted.location, "ok")?.startsWith("Swap accepted") ?? false, "partner accepts");

  console.log("Tracking");
  const linkMade = await submit(swapPath, 'name="destinationUrl"', {
    side: "b",
    label: "Next issue",
    destinationUrl: "https://clinicscheduler.example/?ref=pmw",
  });
  check(linkMade.location.includes("error=") === false, "operator creates a tracking link");
  const code = (await get(swapPath)).html.match(/\/r\/([2-9a-zA-Z]{7})/)?.[1];
  const redirect = await get(`/r/${code}`);
  check(redirect.status === 302 && redirect.location === "https://clinicscheduler.example/?ref=pmw", "tracking link redirects");
  check((await get(`/d/${partnerToken}`)).html.includes(`/r/${code}`), "partner sees its link for the placement");

  console.log("Delivery, checking, and completion");
  const room = await get(`/d/${proposerToken}`);
  const commitmentId = room.html.match(/name="commitmentId" value="([0-9a-f-]{36})"/)?.[1];
  check(Boolean(commitmentId), "proposer sees a delivery form for its commitment");
  const badProof = await submit(`/d/${proposerToken}`, 'name="proofUrl"', {
    token: proposerToken,
    commitmentId,
    proofUrl: "not a link",
  });
  check(query(badProof.location, "error") !== null, "proof must be a link");
  const delivered = await submit(`/d/${proposerToken}`, 'name="proofUrl"', {
    token: proposerToken,
    commitmentId,
    proofUrl: "https://clinicscheduler.example/promo",
  });
  check(query(delivered.location, "ok")?.startsWith("Marked delivered") ?? false, "proposer marks it delivered");

  const operatorView = await get(swapPath);
  const toCheck = [...operatorView.html.matchAll(/name="commitmentId" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
  check(toCheck.length === 2, "operator can check both commitments");
  for (const id of toCheck) {
    await submit(swapPath, `value="${id}"`, { outcome: "kept" });
  }
  const finished = await get(`/d/${partnerToken}`);
  check(finished.html.includes("This swap is complete"), "swap completes when everything is checked");

  console.log("Reminders");
  const cronDenied = await fetch(BASE + "/api/cron/reminders");
  check(cronDenied.status === 401, "reminder cron needs its secret");
  const cron = await fetch(BASE + "/api/cron/reminders", { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } });
  check(cron.ok, "reminder cron runs with its secret");
}

const dataDir = mkdtempSync(path.join(tmpdir(), "ambo-smoke-"));
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, ...ENV, DATABASE_URL: "", PGLITE_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

try {
  await waitForServer();
  await run();
} catch (error) {
  failures += 1;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  server.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
