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

function unescapeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * Every hidden input of the form containing `marker`, which is what a browser
 * with no JavaScript would send back.
 *
 * The $ACTION fields are included deliberately. A plain server-action form
 * carries one $ACTION_ID_<hash>; a useActionState form instead carries
 * $ACTION_REF_1 plus $ACTION_1:0, $ACTION_1:1 and $ACTION_KEY, whose values
 * are HTML-escaped JSON. Keeping only the first shape meant a form converted
 * to useActionState silently stopped being covered here.
 */
function findForm(html, marker) {
  for (const chunk of html.split("<form").slice(1)) {
    const body = chunk.split("</form>")[0];
    if (!body.includes(marker)) continue;
    const hidden = {};
    for (const input of body.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = input[0].match(/name="([^"]+)"/)?.[1];
      if (name) hidden[name] = unescapeHtml(input[0].match(/value="([^"]*)"/)?.[1] ?? "");
    }
    if (!Object.keys(hidden).some((name) => name.startsWith("$ACTION"))) continue;
    return { hidden };
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
  for (const [key, value] of Object.entries({ ...form.hidden, ...fields })) body.set(key, value);
  const res = await fetch(BASE + pathname, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { origin: BASE, ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie?.startsWith("surka_operator=")) cookie = setCookie.split(";")[0];
  // A useActionState form answers a rejected submit with the page itself
  // rather than a redirect, so the body is the only place the error appears.
  return { status: res.status, location: res.headers.get("location") ?? "", body: await res.text() };
}

/**
 * The rendered document, without the RSC payload.
 *
 * Next inlines the flight data in <script> tags in the same document, and that
 * data contains the page's props, so a searchParams value appears in the HTML
 * whether or not anything rendered it. Asserting on raw HTML therefore cannot
 * tell "shown to the user" from "passed to the component and dropped".
 */
function visible(html) {
  return (
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      // React separates two adjacent text nodes with an empty comment, so a
      // sentence with a name or a number in the middle of it is not one string
      // in the HTML, and an includes() for the sentence a reader sees never
      // matches however right the page is.
      .replaceAll("<!-- -->", "")
  );
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
  check(home.status === 200 && visible(home.html).includes("Partner swaps that actually happen"), "landing page renders");
  // Claims the code does not support have crept onto this page twice. These
  // are the three that were there, each describing a table or a sender that
  // does not exist.
  const promises = ["Drafts the copy and assets", "short report to both sides", "approve them once"];
  check(
    promises.every((claim) => !home.html.includes(claim)),
    "the home page does not promise work the code cannot do",
  );
  check(
    // Without the apostrophe: JSX writes it as &apos; in the HTML.
    visible(home.html).includes("What if they just don") && home.html.includes("no money held"),
    "the home page answers the objection it invites",
  );

  const partners = await get("/partners");
  check(partners.status === 200 && visible(partners.html).includes("Nobody is listed yet"), "empty partner list renders");
  check((await get("/list")).status === 200, "the public listing form renders");
  check((await get("/p/not-a-real-token")).status === 404, "an unknown listing link is a 404");
  check((await get("/d/not-a-real-token")).status === 404, "unknown swap link is a 404");
  check((await get("/admin")).location?.endsWith("/admin/login"), "dashboard redirects to sign in");

  console.log("Operator sign in");
  const wrong = await submit("/admin/login", 'name="password"', { password: "nope" });
  check(query(wrong.location, "error") === "That password isn't right.", "wrong password is refused");
  await submit("/admin/login", 'name="password"', { password: ENV.ADMIN_PASSWORD });
  check(cookie.startsWith("surka_operator="), "right password starts a session");
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
  check(
    oneSided.location === "" && oneSided.body.includes("Both sides need to give something"),
    "a swap where only one side gives is refused, and says so without a redirect",
  );

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
  check(visible(partnerPage.html).includes("wants to swap with you"), "partner sees the proposal");

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
  check(
    linkMade.location.startsWith(swapPath) && !linkMade.location.includes("error="),
    "operator creates a tracking link",
  );
  const code = (await get(swapPath)).html.match(/\/r\/([2-9a-zA-Z]{7})/)?.[1];
  const redirect = await get(`/r/${code}`);
  check(redirect.status === 302 && redirect.location === "https://clinicscheduler.example/?ref=pmw", "tracking link redirects");
  check((await get(`/d/${partnerToken}`)).html.includes(`/r/${code}`), "partner sees its link for the placement");

  const received = await get(`/d/${proposerToken}`);
  check(
    // The label and the count, which is the whole point: a side reporting
    // signups could not tell what traffic the figure came off.
    visible(received.html).includes("Clicks Practice Manager Weekly sent you") &&
      visible(received.html).includes("Next issue") &&
      visible(received.html).includes("1 click"),
    "the other side sees what the placement drew",
  );
  // The raw HTML on purpose, not visible(): props reach the browser in the
  // flight payload whether or not anything renders them, and a code is the
  // placing side's to publish.
  check(!received.html.includes(`/r/${code}`) && !received.html.includes(`"${code}"`), "but never its code");

  // The cross-side case, which nothing covered: side A's page must not carry
  // side B's tracking code anywhere, rendered or not.
  const proposerView = await get(`/d/${proposerToken}`);
  check(
    proposerView.status === 200 && !proposerView.html.includes(code),
    "one side's page never carries the other side's tracking code",
  );

  const retired = await submit(swapPath, "Retire this link", {});
  check(query(retired.location, "ok")?.startsWith("Link retired") ?? false, "operator retires a link");
  check((await get(`/r/${code}`)).status === 404, "a retired link stops redirecting");
  const afterRetire = await get(`/d/${partnerToken}`);
  check(
    !afterRetire.html.includes(`/r/${code}`) && visible(afterRetire.html).includes("has been retired"),
    "the side that placed it is told, with nothing left to copy",
  );

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

  // The side that was owed it answers, through the real form.
  const partnerSees = await get(`/d/${partnerToken}`);
  check(visible(partnerSees.html).includes("Did this actually arrive?"), "the other side is asked");
  const confirmed = await submit(`/d/${partnerToken}`, "Yes, it arrived", {
    token: partnerToken,
    commitmentId,
  });
  check(query(confirmed.location, "ok")?.includes("arrived") ?? false, "the other side confirms it");
  check(
    visible((await get(swapPath)).html).includes("confirms it arrived"),
    "the operator sees the answer where they decide",
  );
  check(
    visible((await get(`/d/${proposerToken}`)).html).includes("Confirmed by the other side"),
    "the delivering side sees it too",
  );

  const operatorView = await get(swapPath);
  const toCheck = [...operatorView.html.matchAll(/name="commitmentId" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
  check(toCheck.length === 2, "operator can check both commitments");
  for (const id of toCheck) {
    await submit(swapPath, `value="${id}"`, { outcome: "kept" });
  }
  const finished = await get(`/d/${partnerToken}`);
  check(visible(finished.html).includes("This swap is complete"), "swap completes when everything is checked");

  console.log("The partner list, and proposing from it");
  // The swap link is shared with the counterparty by design, so it cannot be
  // the proof of who the business is. Listing starts by claiming a link that is.
  const claimed = await submit(`/d/${partnerToken}`, "Set up your listing", { token: partnerToken });
  const ownPath = new URL(claimed.location, BASE).pathname;
  check(/^\/p\/[A-Za-z0-9_-]{24}$/.test(ownPath), "a swap link claims a listing link once");
  check(!ownPath.includes(partnerToken), "the claimed link is a new one, not the swap link");

  const again = await submit(`/d/${partnerToken}`, "Set up your listing", { token: partnerToken });
  check(
    query(again.location, "error")?.includes("already has a listing link") ?? false,
    "a second claim from a swap link is refused",
  );

  const ownToken = ownPath.slice("/p/".length);
  const noSite = await submit(ownPath, 'name="offers"', {
    token: ownToken,
    listed: "yes",
    website: "",
    offers: "A dedicated section to 9,000 practice managers",
    needs: "A scheduling tool my readers would use daily",
  });
  check(
    query(noSite.location, "error")?.includes("website") ?? false,
    "a listing needs the one thing a reader can check",
  );

  const thin = await submit(ownPath, 'name="offers"', {
    token: ownToken,
    listed: "yes",
    website: "https://pmweekly.example",
    offers: "stuff",
    needs: "",
  });
  check(query(thin.location, "error") !== null, "a listing has to say something useful");

  const listed = await submit(ownPath, 'name="offers"', {
    token: ownToken,
    listed: "yes",
    website: "https://pmweekly.example",
    offers: "A dedicated section to 9,000 practice managers",
    needs: "A scheduling tool my readers would use daily",
  });
  check(query(listed.location, "ok")?.includes("Saved") ?? false, "partner asks to be listed");
  const askedNotShown = await get("/partners");
  check(
    askedNotShown.status === 200 && !askedNotShown.html.includes("Practice Manager Weekly"),
    "asking is not appearing",
  );

  const pendingPage = await get("/admin/listings");
  const pendingId = pendingPage.html.match(/name="partyId" value="([0-9a-f-]{36})"/)?.[1];
  await submit("/admin/listings", 'name="partyId"', { partyId: pendingId });

  const list = await get("/partners");
  check(visible(list.html).includes("Practice Manager Weekly"), "the list shows the business");
  check(visible(list.html).includes("9,000 practice managers"), "the list shows what it offers");
  // The whole reason the page is worth reading: the record beside the name.
  check(visible(list.html).includes("Kept 1 of 1 commitment"), "the list shows the kept record");
    check(
    list.status === 200 && !list.html.includes("sam@pmweekly.example"),
    "the list never publishes an email",
  );

  const listedId = list.html.match(/\/start\?with=([0-9a-f-]{36})/)?.[1];
  check(Boolean(listedId), "the list offers a way to propose");
  const aimed = await get(`/start?with=${listedId}`);
  check(visible(aimed.html).includes("Propose a swap to Practice Manager Weekly"), "proposing from the list names them");
  check(visible(aimed.html).includes("readers would use daily"), "proposing from the list shows what they want");

  const fromList = await submit(`/start?with=${listedId}`, 'name="partnerGive"', {
    with: listedId,
    title: "Swap found through the list",
    yourName: "Invoice Nudge",
    yourKind: "app",
    yourGive: "A spot in our onboarding email to 2,000 new users",
    yourDue: due,
    partnerGive: "A dedicated section in the December issue",
    partnerDue: due,
  });
  check(fromList.location.startsWith("/start/sent"), "a stranger can propose straight from the list");

  // The listed business's token is its own proof of identity. Handing it to the
  // proposer let them rewrite that business's public listing, name, website and
  // reminder address, from a party id read off the public directory.
  check(!fromList.location.includes("b="), "proposing from the list never hands over the partner's token");
  const sent = await get(fromList.location);
  const shown = [...new Set([...sent.html.matchAll(/\/d\/([A-Za-z0-9_-]{24})/g)].map((m) => m[1]))];
  check(shown.length === 1, "the sent page shows only the proposer's own link");
  const proposerPage = await get(`/d/${shown[0]}`);
  // Any token here other than the reader's own is a leak. There is normally
  // none at all, since a page has no reason to link to itself.
  const onPage = [...new Set([...proposerPage.html.matchAll(/\/d\/([A-Za-z0-9_-]{24})/g)].map((m) => m[1]))];
  check(
    proposerPage.status === 200 && onPage.every((t) => t === shown[0]),
    "the proposer's own page never exposes the listed partner's link either",
  );

  // Reusing the listed business is the point: a fresh row would reset the very
  // record the list is advertising.
  const businesses = await get("/admin/parties");
  // The rendered rows, not raw occurrences: Next inlines the RSC payload in the
  // same document, so every visible string appears in the HTML twice.
  const names = [...businesses.html.matchAll(/class="font-medium">([^<]+)</g)].map((m) => m[1]);
  check(
    names.filter((n) => n === "Practice Manager Weekly").length === 1,
    "proposing from the list reuses the business instead of copying it",
  );
  check(names.includes("Invoice Nudge"), "the proposing stranger is recorded as its own business");

  console.log("Listing with no swap behind it");
  const thinListing = await submit("/list", 'name="needs"', {
    name: "Invoice Nudge",
    kind: "app",
    website: "https://invoicenudge.example",
    offers: "stuff",
    needs: "A billing tool my users would pay for",
  });
  check(
    thinListing.location === "" && thinListing.body.includes("what you can offer"),
    "a listing that says nothing is refused, with the form still filled in",
  );
  check(thinListing.body.includes("Invoice Nudge"), "a refused listing keeps what was typed");

  const madeListing = await submit("/list", 'name="needs"', {
    name: "Receipt Butler",
    kind: "app",
    website: "https://receiptbutler.example",
    email: "pat@receiptbutler.example",
    offers: "A slot in our onboarding email to 2,000 new users a month",
    needs: "A billing or scheduling tool my users would pay for",
  });
  const managePath = new URL(madeListing.location, BASE).pathname;
  check(/^\/p\/[A-Za-z0-9_-]{24}$/.test(managePath), "listing mints a private link and lands on it");

  const manage = await get(managePath);
  check(visible(manage.html).includes("Receipt Butler"), "the private link opens the listing");
  check(visible(manage.html).includes("No swaps through Surka yet"), "a brand new listing says it has no record");
  // Nothing verifies the name typed into that form, and the directory is an
  // indexable page, so a person reads it before a stranger can.
  const beforeApproval = await get("/partners");
  check(
    // The control is a business already approved earlier in this run, so the
    // absence below means "not listed" rather than "page failed to render".
    beforeApproval.status === 200 &&
      visible(beforeApproval.html).includes("Practice Manager Weekly") &&
      !beforeApproval.html.includes("Receipt Butler"),
    "a new listing is not public on submit",
  );
  check(visible(manage.html).includes("by hand before it goes public"), "the holder is told it is being read");

  const queue = await get("/admin/listings");
  check(visible(queue.html).includes("1 waiting on you"), "the operator sees the request");
  const waitingId = queue.html.match(/name="partyId" value="([0-9a-f-]{36})"/)?.[1];
  const approved = await submit("/admin/listings", 'name="partyId"', { partyId: waitingId });
  check(query(approved.location, "ok")?.includes("public partner list") ?? false, "the operator approves it");
  check((await get("/partners")).html.includes("Receipt Butler"), "the approved listing is on the public list");

  const removed = await submit(managePath, 'name="needs"', {
    token: managePath.slice("/p/".length),
    offers: "A slot in our onboarding email to 2,000 new users a month",
    needs: "A billing or scheduling tool my users would pay for",
  });
  check(query(removed.location, "ok")?.includes("Removed") ?? false, "the holder can take the listing down");
  const afterRemoval = await get("/partners");
  check(
    afterRemoval.status === 200 && !afterRemoval.html.includes("Receipt Butler"),
    "a removed listing leaves the public list",
  );
  // Delisting is not deleting: the link has to still work or they can never return.
  check((await get(managePath)).status === 200, "the private link still works after removal");

  // The proposer legitimately holds the partner's link in the normal flow, so
  // they can hand over a URL carrying any copy they like unless it is signed.
  const forged = await get(`/d/${partnerToken}?ok=${encodeURIComponent("Wire the fee to keep this swap.")}`);
  check(!visible(forged.html).includes("Wire the fee"), "an unsigned banner is not rendered");
  const real = await get(`/d/${partnerToken}`);
  check(real.status === 200 && forged.status === 200, "dropping the banner does not break the page");

  console.log("Operator moderation of the public list");
  const relisted = await submit(managePath, 'name="needs"', {
    token: managePath.slice("/p/".length),
    listed: "yes",
    website: "https://receiptbutler.example",
    offers: "A slot in our onboarding email to 2,000 new users a month",
    needs: "A billing or scheduling tool my users would pay for",
  });
  check(query(relisted.location, "ok")?.includes("Saved") ?? false, "the holder can ask to go back on");

  const moderation = await get("/admin/listings");
  check(visible(moderation.html).includes("Receipt Butler"), "the operator sees every listing");
  // Back in the queue after re-requesting, so approve it before taking it off.
  const requeuedId = moderation.html.match(/name="partyId" value="([0-9a-f-]{36})"/)?.[1];
  await submit("/admin/listings", "Put it on the list", { partyId: requeuedId });
  // By button text, not by field name: the approve and decline forms both
  // carry a partyId, so a field marker picks whichever comes first.
  const tookDown = await submit("/admin/listings", "Take off the list", { partyId: requeuedId });
  check(query(tookDown.location, "ok")?.includes("Taken off") ?? false, "the operator can take a listing down");
  const afterTakedown = await get("/partners");
  check(
    afterTakedown.status === 200 && !afterTakedown.html.includes("Receipt Butler"),
    "a moderated listing leaves the public page",
  );
  // A public form anyone can post to needs a remedy that is not destructive.
  check((await get(managePath)).status === 200, "a moderated business keeps its own link");

  console.log("Reminders");
  const cronDenied = await fetch(BASE + "/api/cron/reminders");
  check(cronDenied.status === 401, "reminder cron needs its secret");

  // Nothing in the run above is ever inside a reminder window, so the only
  // thing the next call proved was the bearer check: a wrong window, an empty
  // query, or dueReminderKind always returning null all left it green. This
  // swap is genuinely due, which is the only shape that tests the query.
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const dueSwap = await submit("/admin/swaps/new", 'name="partyAId"', {
    title: "Due in two days",
    partyAId: idFor("Clinic Scheduler"),
    partyBId: idFor("Practice Manager Weekly"),
    "commitments.0.side": "a",
    "commitments.0.description": "Something due very soon",
    "commitments.0.dueDate": soon,
    "commitments.1.side": "b",
    "commitments.1.description": "Something else due very soon",
    "commitments.1.dueDate": soon,
  });
  const duePath = new URL(dueSwap.location, BASE).pathname;
  await submit(duePath, "Mark as sent", {});
  const dueTokens = [
    ...new Set([...(await get(duePath)).html.matchAll(/\/d\/([A-Za-z0-9_-]{24})/g)].map((m) => m[1])),
  ];
  const accepted2 = await submit(`/d/${dueTokens[0]}`, 'name="message"', {
    token: dueTokens[0],
    decision: "accept",
    email: "sam@pmweekly.example",
  });
  check(query(accepted2.location, "ok")?.startsWith("Swap accepted") ?? false, "a swap due in two days is agreed");

  const cron = await fetch(BASE + "/api/cron/reminders", { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } });
  const run = await cron.json();
  // No RESEND_API_KEY in this environment, so nothing can be delivered. The
  // run must find the due reminders and refuse to record them, rather than
  // booking them as sent and burning the window for good.
  check(run.undeliverable >= 1, "the cron finds a reminder that is actually due");
  check(run.sent === 0 && run.provider === "log", "it sends nothing when nothing can deliver");
  check(cron.status === 503, "and says so loudly rather than reporting success");

  const again2 = await fetch(BASE + "/api/cron/reminders", {
    headers: { authorization: `Bearer ${ENV.CRON_SECRET}` },
  });
  const rerun = await again2.json();
  check(rerun.undeliverable >= 1, "the reminder is still due on the next run, not consumed");
}

const dataDir = mkdtempSync(path.join(tmpdir(), "surka-smoke-"));
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
