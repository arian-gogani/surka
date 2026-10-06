---
title: "I built a tool for newsletter swaps. The market had already closed."
tags: startup, indiehackers, saas, webdev
published: false
canonical_url: ""
---

I spent a while building software to run cross-promotion swaps between founders. Two people agree to promote each other, and the thing holds them to it: terms, deadlines, proof that each side delivered.

Then I went looking for the people who wanted it, and found something more interesting than customers.

## The evidence that the demand was real

Indie Hackers used to run threads where people posted their newsletter, their subscriber count, and their niche, asking to be matched with someone comparable. They are still there:

- [Newsletter Cross-Promotion Exchange](https://www.indiehackers.com/post/newsletter-cross-promotion-exchange-6238db213d), July 2020
- [Newsletter cross-promo exchange (v2)](https://www.indiehackers.com/post/aa27856e7b), September 2020
- [Newsletter cross-promo; Let's Match!](https://www.indiehackers.com/post/newsletter-cross-promo-lets-match-68bde57407), March 2022
- [Looking for Newsletter Swap Partners](https://www.indiehackers.com/post/looking-for-newsletter-swap-partners-let-s-help-each-other-grow-27823c4889), April 2023

People were doing the matching by hand, in comments, with no tooling at all. One of them, running a newsletter for web developers and designers, wrote this in his post:

> We did this before, I got some interested but at the time to arrange it was almost not possible because of lack of communication.

That is a person describing the exact problem, unprompted, in 2020. It is the single clearest piece of evidence I found that any of this was real.

## The evidence that it closed

Here is the part I did not expect. Those are the only threads. The newest is from 2023. Search as hard as you like in 2026 and you will not find people hand-matching swaps in public any more.

Two things happened.

**The platforms absorbed the job.** beehiiv's Recommendations network lets publications recommend each other, incoming and outgoing, and [their own documentation confirms free recommendations are available on all plans](https://www.beehiiv.com/support/article/13091498232855). Substack ships the same idea natively. If you are a newsletter wanting to swap with another newsletter, the thing you used to beg for in a forum now happens inside the tool you already use, free, with automatic matching.

**The forum itself faded.** Indie Hackers is not the place it was in 2021, and the threads stopped getting recreated.

## What is left

So the obvious conclusion is that the market died. I do not think that is right, and the reason is worth noticing.

Look at what those networks actually automate. They place a widget. A recommendation box appears at signup, a link appears in a footer. There is no deadline, nothing to write, nothing to ship, and therefore nothing to chase. That is precisely why it could be automated.

Now look at what dies. Not the widget placements. The swaps that fall apart are the ones where a person has to do something by a date: write a dedicated section, ship an integration, extend a trial for someone else's readers. Those are the ones where, as the man said in 2020, arranging it is almost not possible.

I checked the paid tools too. [CrossPromoly](https://crosspromoly.com) charges $14 to $56 a month to match creators by audience size and keep a history of agreed swaps. It does not track whether either side delivered, does not handle deadlines, and does not verify that a promotion ran. It charges for matching, which is the part beehiiv gives away, and stops at the handshake.

So the map looks like this. Platforms automate placements that need no chasing, free. Paid tools do matching and a ledger, then stop. **Nothing holds two parties to a deadline and checks that each one delivered.**

## What I actually do not know

Here is where I stop being confident.

An empty gap has two explanations. Either nobody solved delivery, which is an opportunity, or nobody wants delivery solved badly enough to pay for it, which is why the gap is empty. Four dead forum threads lean slightly toward the second.

I built the thing anyway, because I would rather find out with software than with a survey. It is open source and the whole swap runs without either side making an account. But I have zero completed swaps, so treat everything above as a market map rather than a success story.

If you have ever agreed a cross-promotion with someone and watched it quietly die after you both said yes, I would genuinely like to hear what happened. That is the question the research cannot answer.

---

The tool is [Surka](https://surka.vercel.app), and the code is [on GitHub](https://github.com/arian-gogani/surka) under AGPL. Next.js, Drizzle, Postgres compiled to WebAssembly for local development, and every form works with JavaScript off.
