# Ready to post

Drafts only. Nothing here has been sent and nothing will be: posting is yours.

**Facts these drafts rely on, verified 2026-10-07:**

- Live: https://surka.vercel.app
- Source: https://github.com/arian-gogani/surka (public, AGPL-3.0, 0 stars)
- Zero listings, zero users, no swap has ever run end to end with real people
- Email delivery is not configured, so no reminder has ever been sent
- 136 tests, ~7,400 lines of TypeScript under `src/`

**Do not claim** users, traction, waitlist numbers, or that reminders work.
Every draft is written to be true today. If you edit one, keep it true.

---

## The objection you will get in the first comment

A channel research pass found this, and it changes what the posts should lead
with. Verified dates:

- **SwapStack**, the closest predecessor, was **acquired by beehiiv**
  (beehiiv's own blog, 2023-09-26). `swapstack.co` is a stale shell.
- **SparkLoop** was **acquired by ConvertKit** (announced 2023-06-09).
- **beehiiv Recommendations** is live and built in. **Substack
  Recommendations** has been built in since 2022-04-12.
- **Paved** is live.

So newsletter cross-promotion is already solved *inside the platforms*. If a
post leads with "swaps", the first informed reply is "beehiiv already does
this", and it is right.

**What is actually different:** those features place a widget and split the
traffic. None of them holds two parties to a date, checks that each side
shipped against proof, or carries a record across platforms. A beehiiv
recommendation cannot help a Shopify app and a newsletter agree that one ships
an extra free month by the 17th and the other runs a section by the 20th, and
then say who actually did it.

Lead with **deadline plus proof, across platforms**. Not "swaps".

---

## Order of operations

The research changed this. In order:

1. **Set `RESEND_API_KEY` and `EMAIL_FROM`.** Not optional any more, and not
   just for the product's sake: Show HN's written rule is "If your work isn't
   ready for users to try out, please don't do a Show HN", and the deadline
   chasing *is* the product. Posting before this is posting something whose
   pitch does not run.
2. **Direct outreach to 10 people you have already swapped with.** Below.
3. **Indie Hackers**, which fits best and has no gates.
4. **r/indiehackers weekly thread**, then **r/alphaandbetausers** a week later.
5. **Show HN**, once at least one real swap has run end to end so the post can
   say so. One shot; reposting is discouraged.
6. **Startup Fame** and **Fazier**, both free, both verified active, once you
   have a screenshot of a filled-in deal sheet.

**Skip:** Lobsters (invite-only, and for 70 days a new account cannot use the
`show` tag *or* submit a domain the site has not seen, which yours is).
Product Hunt (half a day of image assets for a one-day spike landing on
"Nobody is listed yet"; save it). BetaList (no free submission). DevHunt (its
rules exclude tools that are not for developers). **r/startups is actively
risky:** every one of the newest posts carries "I will not promote" in the
title, which is the convention there, and a promo removal on a new account is
how shadowbans start.

**Reddit caveat:** subreddit rules could not be verified. Every route to a
rules page is login-gated, so **read each sidebar yourself before posting.**
Activity below was verified via RSS feeds, which still work.

---

## 1. Indie Hackers (do this first)

Post at `https://www.indiehackers.com/new-post`. Also list the product at
`/products/new` so it feeds the Build Board, "a daily leaderboard of
build-in-public posts". Verified active 2026-10-07; posts 1 hour to 1 day old.
Note the written guidelines page is a 404, so read the front page for norms.

Volume is low enough that a decent post survives more than an hour, and the
homepage today carries someone with zero users asking for five testers. That is
your exact situation.

**Title:**

```
I built the boring half of cross-promotion, then found a way to hijack someone's listing
```

**Body:**

```
Two founders agree to promote each other. Then nothing happens. No deadline
anyone owns, no proof either side shipped, nobody wants to be the one who
follows up. I have watched this die three times.

beehiiv and Substack both solved the matching half: recommendations place a
widget and split traffic. Neither holds anyone to a date, checks that a
placement actually ran, or works between a Shopify app and a newsletter. So I
built that part: write down what each side gives and by when, partner gets a
link with no account, each side marks delivery with a link that proves it, and
what gets verified becomes a public record of kept and missed commitments.

The part worth writing about is what went wrong.

There are no accounts. Control of a swap is an unguessable link, which is
lovely for someone who has never heard of you. But a link is a bearer token,
and I had one link mean two things: "I am this side of this swap" and "I am
this business".

Those have to differ, because the flow deliberately hands the proposer the
partner's link. Somebody has to send it. So anyone who had ever proposed to you
kept a credential that said "I am this business": rewrite your name and
website, repoint the address your reminders go to, then collect the links to
your other swaps out of the reminder emails that followed.

I shipped a narrow fix for one path, pointed an adversarial review at my own
fix, and it found the wider path in minutes.

Then a second review asked whether the record could be gamed, and it could.
The public form creates both businesses and hands you both links, so one person
could propose to a business they invented, accept as that business, deliver
against a page they own, and have a perfect public record for three requests
and one click of mine. The fix was to count only swaps where one person did not
hold both links, which costs something real: a swap between two founders who
already know each other now builds no public record until one of them is listed.

Third thing, the one that stung. I mutation-tested my own suite: deleted eight
behaviours the code's own comments describe as fixed bugs, and 125 of 125 tests
still passed, including the security fix above.

State of it: live and empty. Zero listings, no swap run end to end with real
people, email not configured yet so the chasing is by hand. https://surka.vercel.app

If you run swaps already, I want to know what you do today instead and where it
breaks.
```

**Why this shape:** IH rewards specifics about failure over announcements, and
a post with no comments is this site's version of removal. The three failures
are the hook; the product is secondary. That is the right order for something
with no users.

---

## 2. r/indiehackers weekly thread

The one verified recurring show-your-project thread. Titled **"Share what
you're building"**, posted weekly (observed 2026-09-24, 10-01, 10-07). Its body
says, verbatim: *"Pitch your product in 1-2 lines - and drop a link here."*
Links explicitly invited, so there is no self-promo risk. Reach is modest: the
thread author promotes their own product in it.

Two lines, and they have to earn a click:

```
beehiiv and Substack recommendations match you with a partner. Nothing holds
either of you to a date or checks the placement actually ran, especially across
platforms. I built that part, it is free and needs no account, and nobody is on
it yet: https://surka.vercel.app
```

---

## 3. r/alphaandbetausers (a week after the above, same account)

Verified active 2026-10-07; all 25 newest posts are people asking for testers
for unfinished things. Your genre exactly. Comment on other people's posts in
between.

**The trap here:** you cannot give a tester anything to do alone. A swap needs
two parties and there are no listings, so "give me feedback" ends at a dead
end and you get silence. Give them a solo task.

```
Surka is for the part of a promotion swap that always breaks: the deadline and
the proof. You write down what each side gives and by when, your partner gets a
link with no account, and each side marks its part delivered with something
that shows it ran.

It is pre-pilot and the directory is empty, so rather than "try it and tell me
what you think", here is a thing you can actually do alone in two minutes:
write a deal sheet for a swap you have already agreed with someone, or one you
wish you had, and tell me where the form made you stop and think. The second
screen gives you a link you could send them for real if you wanted.

What I most want to know: does writing it down feel like useful structure or
like pointless admin? If it is admin, the idea is wrong and I would rather know
now. https://surka.vercel.app
```

---

## 4. Show HN (only after email works)

Post at `https://news.ycombinator.com/submit`. Title must start `Show HN:`.
Roughly 10 Show HNs an hour, so visibility is brutal. Weekday, 8-11am US
Eastern. Reply to every comment for three hours or do not post.

Rules that matter, verbatim from `news.ycombinator.com/showhn.html`: *"The
community is comfortable with work that's at an early stage."* /
*"Please make it easy for users to try your thing out, ideally without barriers
such as signups or emails."* / *"If your work isn't ready for users to try out,
please don't do a Show HN."* And from the official tips: *"Drop any language
that sounds like marketing or sales. On HN, that is an instant turnoff."*

Your no-account flow satisfies the second rule better than most launches. The
third is the one you would be breaking today.

**Title:**

```
Show HN: Surka, holds two founders to a promotion swap and checks it happened
```

**First comment** (post immediately after submitting):

```
Two founders agree to promote each other, then nothing happens: no deadline
anyone owns, no proof either side shipped, nobody follows up.

beehiiv and Substack both have recommendations built in, and SwapStack got
acquired by beehiiv in 2023, so the matching half is solved. What none of them
do is hold two parties to a date, check the placement actually ran, or work
between a Shopify app and a newsletter. That is the part this is.

You write what each side gives and by when. Your partner opens a link, no
account, and accepts, counters, or declines. Each side marks its part delivered
with a link that proves it, delivery gets checked against that proof rather
than assumed, and what gets checked becomes a public record of kept and missed
commitments.

What it does not do: nothing makes anyone deliver. No contract, no money held.
What exists is a deadline neither side can quietly move, a nudge either side of
it, a check against real proof, and a record that outlives the swap.

Interesting failure, since no accounts means control is an unguessable link: I
had one link mean both "I am this side of this swap" and "I am this business",
and the flow hands the proposer the partner's link on purpose. So anyone who
had ever proposed to you could later rewrite your business and repoint your
reminders. I shipped a narrow fix, pointed an adversarial review at it, and it
found the wider path in minutes. Separately, a review of the reputation system
showed one person could manufacture a perfect public record with three requests,
because the public form creates both businesses and hands you both links.

Source: https://github.com/arian-gogani/surka

[Add before posting: how many real swaps have run, and what broke.]
```

---

## 5. The one-line version

```
Surka: write down a promotion swap, and it holds both sides to the dates and checks each part shipped. No accounts. https://surka.vercel.app
```

---

## 6. Direct outreach, which is the one that will work

A directory with one listing is worth more than four posts. Ten specific people
beats a thousand impressions into an empty page.

Who, in order: founders you have **already** swapped with or tried to;
newsletter operators roughly 1k-20k subscribers with no sponsorship revenue yet
(a swap is free inventory, a sponsor slot is not); anyone who has publicly
complained about a partnership stalling.

```
Hi [name],

You and I talked about [specific thing] a while back. Did it ever happen?

Mine died because nobody owned the date, which is the fourth time, so I built
the boring half: write down what each side gives and by when, both sides get
held to it, and delivery gets checked against proof rather than assumed.

It is brand new and nobody is on it yet, which is why I am asking you rather
than announcing it. Would you be the first swap? I will do all the chasing by
hand.

[link]
```

Do not send this to anyone you have not actually spoken to. The first line is
the whole message and only works if it is true.

---

## Before any of it

Add real screenshots of a filled-in deal sheet. Startup Fame and Fazier are
both review-queued and a site whose directory says "Nobody is listed yet" with
no screenshots may simply not get approved. Fazier's free tier also requires a
Fazier backlink on your site, so decide whether you want that.
