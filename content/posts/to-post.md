# Ready to post

Drafts only. Nothing here has been sent anywhere, and nothing will be: posting
is yours. Each item says where it goes, what it assumes, and what is true.

**Facts these drafts rely on, all verified 2026-10-07:**

- Live: https://surka.vercel.app
- Source: https://github.com/arian-gogani/surka (public, 0 stars)
- Zero listings in the directory, zero users, no swap has ever run through it
- Email delivery is not configured, so no reminder has ever been sent
- 130 tests, 5 test files, ~7,100 lines of TypeScript under `src/`

**Do not claim** users, traction, waitlist numbers, or that reminders work.
Every draft below is written to be true today. If you edit one, keep it true.

---

## 1. Show HN

The highest-leverage single post, and the one most likely to go badly if the
framing is wrong. HN punishes a launch with no users dressed up as a product
launch. It rewards a specific, honest technical account.

**Title** (80 char limit, no "launch", no exclamation marks):

```
Show HN: I built a tool that holds two founders to a promotion swap
```

**URL field:** `https://surka.vercel.app`

**First comment** (post this yourself immediately after submitting; HN
convention, and it is where the honesty lives):

```
Two founders agree to promote each other, then nothing happens. No deadline
anyone owns, no proof either side shipped, nobody follows up. I have watched
this fail three times and wanted to see if the boring part could be a tool.

So: you write down what each side gives and by when. Your partner gets a link,
no account, and can accept, suggest changes, or decline. Then each side marks
its part delivered with a link that proves it, and the delivery gets checked
against that proof rather than assumed. What gets checked becomes a public
record of kept and missed commitments, which is the only part of a listing a
business cannot write about itself.

What it does not do, since the page used to imply otherwise and I would rather
say it here: nothing makes anyone deliver. There is no contract and no money
held. What exists is a deadline neither side can quietly move, a nudge either
side of it, a check against real proof, and a record that outlives the swap.

State of it: zero users, zero listings, no swap has run through it end to end
with real people. Email delivery is not even configured yet, so the chasing is
by hand right now, and the app says so instead of pretending. I am posting it
because the directory is useless until two people are on it and I would rather
find out now whether the premise is wrong.

Built with Next.js 15, Postgres, no accounts anywhere. Control is a 144-bit
unguessable link, which turned out to be the hard part: I shipped a hole where
proposing to a business from the public directory handed you that business's
own link, which let you rewrite its name, its website and the address its
reminders go to. Found it by pointing an adversarial review at my own patch for
a narrower version of the same bug. Source is public:
https://github.com/arian-gogani/surka

If you have ever had a swap stall on you, I would like to know where it died.
```

**Why this shape:** it leads with the problem, states the mechanism in one
paragraph, volunteers the limitation before anyone finds it, and the technical
detail is a real specific thing rather than a stack list. The security
admission is the strongest part. Do not remove it.

**Timing:** weekday, roughly 8-11am US Eastern. Reply to every comment for the
first three hours or do not post at all.

---

## 2. Reddit

Rules vary per subreddit and several ban self-promotion outright for new
accounts. A research pass is running to verify which ones currently allow this
and what their rules actually say today, so **do not post to Reddit until that
lands.** Posting a link from a new account into the wrong subreddit gets you
shadowbanned and burns the name.

When it does land, this is the body to adapt. Reddit wants text, not a pitch,
and wants the link last or in a comment.

```
I kept agreeing to cross-promotion swaps with other founders and then watching
them die. Not because anyone was dishonest. Because the terms were vague, no
deadline belonged to anyone, and nobody wanted to be the person who followed
up.

So I built the boring part. You write down what each side gives and by when.
Your partner gets a link, no account needed, and accepts or counters. Each side
marks its part delivered with a link that proves it. Deliveries get checked
against that proof, and what gets checked becomes a public record of kept and
missed commitments.

It is new and empty. Nobody is listed yet, no swap has run through it with real
people, and email reminders are not wired up, so I am doing the chasing by
hand. I am not trying to sell anything, there is nothing to sell yet.

What I actually want to know: when a swap of yours stalled, what killed it? I
have a guess (nobody owned the date) but I would rather hear it than assume it.
```

---

## 3. Indie Hackers

Fits better as a build-in-public post than a launch.

**Title:**

```
I built the boring half of cross-promotion swaps, and immediately found a way to hijack someone's listing
```

**Body:**

```
The idea is small: two founders agree to promote each other, and something
holds them both to the dates and checks each side actually shipped. Write down
what each gives and by when, partner gets a link with no account, each side
marks delivery with proof, and what gets verified becomes a public record of
kept and missed commitments.

The part worth writing about is what went wrong.

There are no accounts. Control of a swap is an unguessable link, which is
lovely for the person who has never heard of you and does not want another
password. But a link is a bearer token, and I had one link mean two different
things: "I am this side of this swap" and "I am this business".

Those have to be different, because the normal flow deliberately hands the
proposer the partner's link. Somebody has to send it. So anyone who had ever
proposed a swap to you kept a credential that said "I am this business". They
could rewrite your name and your website, repoint the address your reminders go
to, and then collect the links to your other swaps out of the reminder emails
that followed.

I shipped a narrow fix for one path, then pointed an adversarial review at my
own fix, and it found the wider path in about five minutes. The real fix was to
make the two kinds of link different types with different powers, and to let a
swap link claim a business link exactly once, first claim wins.

Second thing worth saying out loud. I ran a mutation test on my own test suite:
deleted eight behaviours the code's own comments describe as fixed bugs, and all
125 tests still passed. Including the security fix above. "Covered by tests" was
not true of the things I most wanted it to be true of.

It is live and empty: https://surka.vercel.app. Zero listings, no swap run end
to end with real people, email not configured. Source is public.

If you run swaps already, I would like to know what you do today instead, and
where it breaks.
```

**Why this works here:** IH readers are building the same kind of thing and
respond to specifics about failure. The security story is the hook; the product
is secondary. That is the correct order for a thing with no users.

---

## 4. Dev.to

There is already a drafted article in the repo at
`content/posts/the-market-that-closed.md` which has never been posted. Separate
from that, the sharpest technical piece available is the one thing I would want
to read:

**Title:**

```
I pointed an adversarial code review at my own security fix, and it broke it in five minutes
```

**Tags:** `security`, `nextjs`, `webdev`, `testing`

Outline, in this order:
1. The setup: no accounts, control is an unguessable link, and why that is a
   good trade for a product a stranger has to trust in thirty seconds.
2. The first bug: proposing to a directory listing handed you that business's
   own link.
3. The narrow fix: withhold the token on that one path.
4. The review that broke it: the ordinary flow hands over the same link on
   purpose, so the fix addressed the symptom.
5. The real fix: two token kinds, different powers, claim-once.
6. The uncomfortable part: eight mutations, 125 tests, all green. What a
   passing suite does and does not tell you.
7. What I would do differently: write the authorisation boundary into the type
   system first, so "which link is this" is impossible not to answer.

`npm run post -- content/posts/<file>.md` posts it as a **draft** (publishing
needs `--publish`). It needs `DEV_API_KEY` from dev.to Settings, Extensions.

---

## 5. The one-line version

For a bio, a reply, or anywhere with no room:

```
Surka: write down a promotion swap, and it holds both sides to the dates and checks each part shipped. No accounts. https://surka.vercel.app
```

---

## 6. Direct outreach, which is the one that will actually work

The directory is empty, and a directory with one listing is worth more than
four posts. Ten specific people beats a thousand impressions here.

Who to ask, in order:
1. Founders you have **already** swapped with, or tried to. They have felt the
   exact failure. One of them owes you a reply.
2. Newsletter operators between roughly 1k and 20k subscribers with no
   sponsorship revenue yet. A swap is free inventory for them; a sponsorship
   slot is not.
3. Anyone who has publicly complained about a partnership stalling.

**The message.** Short, no link in the first line, asks for a reply not a
signup:

```
Hi [name],

You and I talked about [specific thing] a while back. Did it ever happen?

Mine died because nobody owned the date, which is the fourth time that has
happened to me, so I built the boring half: write down what each side gives and
by when, both sides get held to it, and delivery gets checked against proof
rather than assumed.

It is brand new and there is nobody on it yet, which is why I am asking you
rather than announcing it. Would you be the first swap? I will do all the
chasing by hand.

[link]
```

**Do not** send this to anyone you have not actually spoken to. The first line
is the whole message, and it only works if it is true.

---

## Order of operations

1. **Set `RESEND_API_KEY` and `EMAIL_FROM` first.** The product is deadline
   chasing, and right now it chases nobody. Everything above is weaker while
   that is off, and the Show HN comment has to keep admitting it.
2. Direct outreach to 10 people you know. Do this before any public post.
3. Indie Hackers, which tolerates zero users best.
4. Show HN, once at least one real swap has run end to end, so the post can say
   so.
5. Reddit, only after the channel rules are verified.

The posts are worth less than one real swap. Item 2 is the one that matters.
