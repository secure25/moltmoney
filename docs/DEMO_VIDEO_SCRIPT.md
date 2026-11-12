# Elio × MoltMoney — Demo Video Production Script (Manus executable)

**Target length: 2:48. Hard ceiling: 3:00.** Public YouTube upload. Real footage only.

This document is written for an AI operator ("Manus") that has its own computer and can
drive a browser. Every step below names the **exact URL, click, and typed text**, the
**expected on-screen result**, and what to do if the result does not appear. Follow it
literally; do not improvise UI paths.

---

## 1. Why this video exists (what the judges score)

The submission rules require a demonstration video that:

| Rule | Status in this plan |
|---|---|
| **should** be under 3:00 (judges may stop at 3:00) | 2:48 planned |
| **should** show the Project functioning on the device it was built for | Live hosted apps in a desktop browser, real PayPal sandbox checkout |
| **must** be publicly visible on YouTube with the link on the submission form | Upload as **Public**, not Unlisted, not Private |
| **must not** contain third-party trademarks, or copyrighted music/material | Brand-hygiene rules in §11 |
| A mockup or non-functional demo does **not** satisfy the requirement | Every frame is real product |

Judged equally weighted, so each segment is built to earn a specific criterion:

| Judging criterion | What proves it on screen | Segment |
|---|---|---|
| **Technological Implementation** | Real PayPal **Orders v2** create + capture, hosted checkout, signed webhook settling the ledger, OAuth token handling, idempotency header | S4, S6, S7 |
| **Design** | Coherent dashboard: policy panel, approvals queue, ledger with PayPal ids, receipt returning to chat | S3, S5, S7 |
| **Potential Impact** | Owner funds an agent account and sets hard rules; agent transacts only inside them | S2, S3, S8 |
| **Innovation / Idea** | "Agents get their own economy, not your bank account" — two-gate model (owner + payer) | S2, S5, S8 |
| **Presentation** | One continuous story, clear voice-over, legible UI, no dead air, honest claims | Whole video |

**The single most important instruction:** the moments a judge remembers are the
**Approve** click and the **Capture payment** result. Those two must be unmistakable,
legible, and narrated. Everything else supports them.

---

## 2. The story (narrator's spine — do not change the logic)

1. AI agents are getting more capable every month.
2. Humans are never going to hand an AI their bank account.
3. So instead of asking for trust, give the agent **its own economy**: its own account,
   funded by the owner, with the owner's rules enforced server-side.
4. **MoltMoney** is that bank for agents. **Elio** is the agent that uses it.
5. **PayPal** is what makes it real: a real order, a real hosted checkout, a real capture,
   a verified webhook — in the free sandbox.
6. Result: the agent can buy, pay and transact on the owner's guidance, and the owner never
   loses control.

Say this in your own words if needed, but keep the order. It maps 1:1 to Impact and
Innovation, and it is the difference between "another chatbot with payments" and "a product".

---

## 3. Deliverables

| Asset | Spec |
|---|---|
| `moltmoney-demo-final.mp4` | 1920×1080, 30 fps, H.264, ≤ 3:00 (aim 2:48), stereo 48 kHz |
| `moltmoney-vo.wav` | Clean narration stem, −16 LUFS, no music |
| `moltmoney-captions.srt` | English captions, timed to the VO in §9 |
| `moltmoney-thumbnail.png` | 1280×720, product UI + wordmark, no third-party logos |
| Recording project | Segment files named `S1..S9-*.mkv` so any segment can be re-shot alone |

Record **segment by segment** and assemble. Never re-record the whole video to fix one beat.

---

## 4. Pre-flight (do this before recording a single frame)

### 4.1 Machine and browser setup

1. Display 1920×1080 or larger; browser window maximised; **zoom 110%** (Ctrl + `+` twice
   from 100%) so UI text is legible after video compression.
2. Hide the bookmarks bar: **Ctrl + Shift + B**.
3. One window for **MoltMoney**, one window for **Elio**. Two tabs maximum in each.
4. Close every other tab: no email, no chat apps, no other vendor dashboards (see §11).
5. Turn on Do Not Disturb; silence system sounds; disable OS/browser notifications.
6. Use a light or neutral desktop wallpaper, or full-screen the browser (F11) so no
   desktop icons appear.
7. Set the mouse pointer to a large, high-contrast cursor and enable a click highlight
   (screen recorder setting), so every click is visible after compression.

### 4.2 Credentials (exactly as published in the repo README)

```
MoltMoney dashboard : https://moltmoneydashboard-production.up.railway.app
  sign-in           : /auth/login  →  button "Explore the demo account"
  email             : demo@moltmoney.dev
  password          : DemoJudge2026!

Elio (AI agent)     : https://elio-production-9b75.up.railway.app/landing
                      → "Sign In" → same email + password
                      → lands on the chat at "/" (composer placeholder "Give Elio a goal...")

PayPal sandbox buyer (for the hosted checkout step)
  email             : sb-43yb0j53447783@personal.example.com
  password          : ;#;6c;Z;
```

Notes that matter:

- The demo account is shared. **Never change the password.** If sign-in fails, stop and
  report; do not create a new account for the recording.
- The PayPal buyer is a shared **sandbox Personal** account. If PayPal rejects the login,
  see §10 fallback F3.

### 4.3 Data state check (must pass before recording)

Open the dashboard, sign in with the demo account, and confirm these rows exist in
**Transactions**:

| Amount | Status | Description | Why it matters |
|---|---|---|---|
| **$45.00** | PENDING | Book: Designing Data-Intensive Applications | Fallback PayPal order for the owner-approval beat |
| **$25.00** | APPROVED | Book: Refactoring (hardcover) | Shows "Payer already approved on PayPal — your approval unlocks capture" |
| **$12.00** | COMPLETED | Book: The Pragmatic Programmer | Ledger history |
| **$250.00** | COMPLETED | Account funding | Proves the owner funds the agent account |

The $45 and $25 rows must each show a **PayPal order** section in the transaction dialog
(a `providerName: paypal` row with a `providerRefId` and an "Open PayPal checkout" link).

**Important — recording order:** the primary path creates a **fresh** order live from
Elio's chat (S4), so the pre-seeded $45/$25 rows stay available as fallback. Do not consume
both pre-seeded orders in one take.

Take a screenshot of the Approvals page and the Transactions page before recording. If a
re-take is needed, that screenshot is your proof of the starting state.

### 4.4 Verify the agent is live (30 seconds, do not skip)

In the Elio chat, type exactly:

```
Reply with exactly one word: pong
```

Expect a completed answer within ~10 seconds. If it fails, the AI provider is down — **stop
and report**; do not record a broken agent.(This is also the check that prevents the worst outcome: a video where the agent
does nothing.)

**Known provider failure signature — seen live on 2026-11-12.** A turn can fail instantly with:

```
apinex API error: Daily check-in required to use free models.
Please visit https://apinex.bond/overview to check in.
```

That is **not** a MoltMoney bug, a bad key, or an expired session. APInex's `free/*` models
require a manual **daily check-in**, and this error does not match the failover regex, so the
turn dies immediately with no cascade. If you see it: **stop, do not record**, check in once at
the URL above to unblock today, and then apply §4.8 — because this recurs **every day** the app
is expected to work, including every day of the judging period.

### 4.5 Policy values are locked — check them against the screen

These four numbers are what the Elio agent account is actually configured with (verified
against the live API on 2026-11-11: `dailyLimit: 100`, `perTransactionLimit: 60`,
`requireApprovalAbove: 20`, `blockedCategories: ["gambling", "crypto"]`). Open
`/agents`, select **Elio**, and read the **Spending policy** panel before recording. If any
value on screen differs from this list, **change the voice-over to match the screen** — never
say a number the judge cannot see.

### 4.6 PayPal readiness gate (the one thing Manus cannot self-serve)

Two different things can fail here, and they fail differently.

**A. Merchant side (MoltMoney → PayPal) — verified working, 2026-11-11.** The sandbox app
credentials exchange for an OAuth token (`POST /v1/oauth2/token` → `200`, `Bearer`,
`expires_in 32400s`, checkout scopes present), so Orders v2 create and capture can
authenticate. Nothing to fix on this side.

**B. Payer side (the PayPal login on camera) — the only unverified step.** Manus **cannot**
create or repair a sandbox buyer account: that needs the owner's PayPal *developer* login.
Treat it as a **human gate**, not a Manus task.

> **Owner check, once, before the shoot (60 seconds).** Open the approval URL of the demo's
> **$45 PENDING** order and try the sandbox buyer in §4.2. If the login works → record S6 as
> written. If it does not → either (i) create a fresh sandbox **Personal** account at
> `developer.paypal.com → Sandbox → Accounts → Create → Personal` and put those credentials
> in §4.2, or (ii) tell Manus to record **S6-alt** (§7.5a), which needs no payer login at all.

**Diagnostic note — do not chase this.** Querying a seeded order with *local* credentials
returns `HTTP 404`. That is expected: those orders were created by the Railway app, not the
local one. A 404 from `GET /v2/checkout/orders/{id}` means "different PayPal app", **not**
"expired order". Judge order liveness only through the hosted demo.

**Merchant side re-verified live, 2026-11-11:** `POST /v2/checkout/orders` returned
`201 CREATED` with an approval link on `www.sandbox.paypal.com`. Creating a fresh, payable
order is therefore proven — only *payer approval* is gated on a human.

**Webhook verification re-verified live, 2026-11-11:** `POST https://moltmoneyapi-production.up.railway.app/webhooks/paypal`
with a forged `paypal-transmission-sig` returns `401 {"code":"WEBHOOK_VERIFICATION_FAILED"}`.
Signature verification is enforced, not decorative — this is what backs the S7 line "a
signature-verified webhook, not the browser, writes the ledger".

### 4.7 Two rules that remove the remaining risk

**Rule 1 — order freshness. Never record against an order older than ~3 hours.** PayPal
checkout orders are short-lived: an order created days ago will not be payable, even though
its `checkoutnow?token=…` page still returns `200`. The seeded $45 / $25 rows exist as
*fallback footage only*; the payable order for the video is the one **S4 creates live from
Elio's chat, in the same session as the recording**. If you must fall back to a seeded order,
first create a new one through Elio (type the S4 prompt) and use that.

**Rule 2 — own the buyer account. Do not ship a demo that depends on a shared password.**
A single shared sandbox account can be rotated by anyone at any time. The 60-second fix,
done **once** by the owner:

1. `https://developer.paypal.com/dashboard/accounts` → **Sandbox** → **Create account**.
2. Type **Personal**, choose any country, create it, then copy its email + password.
3. Put those credentials into §4.2 (replacing the shared buyer) and into the repo README.

From then on the payer login is yours, private, and cannot be changed by a stranger — and the
video no longer has an external dependency at all. This is the fix to prefer; **S6-alt** is the
effective no-credential fallback if it is skipped.

### 4.8 Provider durability — never ship an AI that expires daily

Judging spans **days**; the demo has to answer on every one of them. A provider that needs a
manual daily action fails that requirement by construction.

- `free/*` APInex models (e.g. `free/gemini-3.8-flash`) require a **daily check-in**. Verified
  failing on 2026-11-12 with the error above, after working all of 2026-11-11. Do not judge with
  them.
- Use a **wallet-funded** model instead — same endpoint, same key, no check-in. Recommended:
  `APINEX_MODEL=gemini-3.8-flash` (~$0.10 / 1M tokens) or `APINEX_MODEL=gpt-6-luna`
  (~$0.07 / 1M). A few dollars covers the entire judging window.
- After changing it on the host, **re-run §4.4**, and make the check a *tool* turn too
  (`What is my account balance?`) — a plain "pong" proves text but not the tool loop, which is
  what S4–S8 depend on.

**Why it cannot self-heal:** the failure message contains no quota/rate-limit token, so the
provider chain does not cascade — Elio surfaces it as a task error. That is why this belongs in
pre-flight, not in the fallback table.

### 4.9 Queue health (30 seconds, every session)

Elio runs tasks through a single in-memory queue with no per-task watchdog: one hung task
blocks every message after it, so the demo can look dead while the app is technically up.
Before recording — and after any prompt that browsed — open the dashboard's 
task surfaces or check the API as the demo user:

```
GET https://elio-production-9b75.up.railway.app/api/tasks     (with the demo session cookie)
```

Read the newest entries: any task sitting `running` for more than ~60 seconds, or a `pending`
task that never starts, means the queue is wedged → **restart the Elio service** and re-run
§4.4. Also keep in mind that the hosted image has **no Playwright browser installed**, so any
prompt that triggers browsing will spend a step failing before it gives up; phrase demo prompts
to avoid research entirely (see S4).

---

## 5. Global style rules (studio quality)

**Camera and edit**
- Screen recording, not a talking head. Optionally add a small, tasteful presenter inset in
  S1 and S9 only.
- Slow, deliberate mouse movement. Pause ~700 ms before every click; ~400 ms after.
- Never scroll fast enough to blur the ledger. Use whole-row scrolling.
- Cut only on a completed action. No whip pans, no zoom wipes, no stutter cuts.
- Add a 3–6% punch-in on the two money moments (Approve click, Capture result).
- Total on-screen text: fewer than 8 cards, each ≤ 6 words.

**Look**
- Add a thin product frame or soft vignette around the browser; keep it neutral so it never
  competes with UI.
- Lower-thirds only to label a surface, 1.2 s each: `MoltMoney — owner dashboard`,
  `Elio — AI agent`, `PayPal sandbox checkout`.
- Syntax-highlighted code inserts: 20% dark overlay, 2 s, zoomed to the one relevant line.

**Audio**
- Voice-over: measured, confident, ~145–150 words per minute. No hype voice, no filler.
- Beds: one royalty-free, **instrumental** track at −32 LUFS, ducked to −36 LUFS under VO.
  No lyrics, no recognisable melodies, no stingers borrowed from other media.
- SFX (optional): a single soft click and a single soft "confirm" tone. Nothing else.
- Loudness: integrated −16 LUFS, true peak ≤ −1 dBTP.

**Legibility**
- Never show a screen with text smaller than ~14 px at 110% zoom for longer than 2 seconds.
- If a value matters (amount, status, order id), hold the frame ≥ 1.5 s and say it aloud.

---

## 6. Master timeline

| # | Time | Segment | Screen | Judging beat |
|---|---|---|---|---|
| S1 | 0:00–0:10 | Hook | MoltMoney dashboard, slow push-in | Presentation, Impact |
| S2 | 0:10–0:28 | Origin thesis | Title card + architecture graphic | Impact, Innovation |
| S3 | 0:28–0:48 | The product / rules | `/agents` policy panel + `/dashboard` | Design, Impact |
| S4 | 0:48–1:08 | Agent asks | Elio chat, live purchase | Tech, Innovation |
| S5 | 1:08–1:26 | Owner gate | `/approvals` → Approve | Tech, Design |
| S6 | 1:26–1:52 | PayPal gate (**S6** as written, or **S6-alt** with no payer login) | `sandbox.paypal.com` checkout | **Tech — the money shot** |
| S7 | 1:52–2:12 | Capture + webhook | `/transactions` → Capture → chat receipt | **Tech — proof of settlement** |
| S8 | 2:12–2:30 | Unsafe path | Elio refusal | Innovation, Design |
| S9 | 2:30–2:48 | Close | Split screen + URLs | Presentation |

---

## 7. Segment-by-segment execution

> Conventions: **ACTION** = do this exactly. **EXPECT** = what must be on screen.
> **VO** = narration, word for word. **FALLBACK** = if EXPECT does not happen.

---

### S1 — Hook (0:00–0:10)

**Voice-over starts at 0:02, after two seconds of quiet on the dashboard.**

**ACTION**
1. Open `https://moltmoneydashboard-production.up.railway.app/auth/login` and sign in via
   **Explore the demo account** (do this **before** recording starts).
2. Navigate to `/dashboard`.
3. Start recording, then slowly push in ~4% over 8 seconds. Do not move the mouse.

**EXPECT** — the owner dashboard with account balance, recent transactions, and the agent
account visible.

**VO (25 words)**
> "AI agents can already research, write, and plan. There is one thing we still will not let
> them touch: our money."

**ON-SCREEN TEXT (0:04–0:08, bottom third)**
> `Agents cannot be trusted with money`

**EDIT** — hold the final frame 500 ms before cutting.

---

### S2 — The idea (0:10–0:28)

**ACTION**
1. Cut to a clean title card (dark background, product wordmark only).
2. At 0:14, cut to a simple architecture graphic: three labelled boxes — `Elio (AI agent)` →
   `MoltMoney (policy + ledger)` → `PayPal (sandbox)` — drawn with plain arrows. Build it
   from the repository README diagram; render it yourself, do not screenshot another product.
3. Animate the arrow from Elio to MoltMoney, then MoltMoney to PayPal, as each is named.

**EXPECT** — graphic, legible at a glance, no third-party logos.

**VO (48 words)**
> "That is the problem I set out to solve. Agents get smarter every month, but nobody is
> going to hand an AI their bank account. So instead of asking for trust, I gave agents their
> own economy: their own account, their own limits, their own money."

**ON-SCREEN TEXT (0:24–0:27)**
> `Give the agent its own economy`

**FALLBACK** — if graphic creation fails, use a plain title card with the three names in
sequence; never substitute stock footage of unrelated products.

---

### S3 — The product and the rules (0:28–0:48)

**ACTION**
1. Cut to MoltMoney `/agents` (type the URL directly; do not hunt the sidebar).
2. Select the agent named **Elio**. Scroll so the **spending policy** is centred and fully
   legible: $100 daily limit, $60 per-transaction limit, approval required above $20,
   `gambling` and `crypto` blocked.
3. Hold 2 seconds. Then cut to `/dashboard` and let the balance and recent activity sit for
   1.5 seconds.

**EXPECT** — policy values readable at 1080p without pausing to zoom.

**VO (50 words)**
> "This is MoltMoney, the bank built for AI agents. The owner funds an agent account and sets
> the rules: a hundred dollars a day, sixty per transaction, anything over twenty needs a
> human, gambling and crypto blocked. The agent can spend inside those rules — and never
> outside them."

**ON-SCREEN TEXT (0:34–0:38)** — four short chips, appearing with the VO:
> `$100 / day` · `$60 / transaction` · `> $20 needs a human` · `gambling, crypto blocked`

**EDIT** — punch in 5% on the policy panel while the four limits are spoken.

**FALLBACK** — if `/agents` fails to load, use `/dashboard`, where the daily limit and
spend-today are also shown.

---

### S4 — The agent asks (0:48–1:08) *[Technological Implementation]*

**ACTION**
1. Cut to the Elio window at `https://elio-production-9b75.up.railway.app/` (already signed
   in). If the chat has old conversations, press **New chat** once so the screen is clean.
2. In the composer (`placeholder: "Give Elio a goal..."`), type this exactly, at a natural
   typing speed (do not paste):

```
Buy a $25 hardcover of Refactoring from Corner Bookstore. Skip the research — just create the PayPal order.
```

**Why that second sentence is not optional.** Verified live on 2026-11-12: with the plain
prompt, the agent treated "Corner Bookstore" as a merchant to investigate, ran six web
searches, tried the browser tool (which is **not installed** in the hosted image — it returns
`browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/…`), and finished
by asking whether to phone the store. **No order, no approval URL.** The trailing instruction
keeps the agent on the transaction instead of the research.

If it still refuses or stalls, use this as the fallback wording (naming the tool is allowed and
still reads as a normal instruction):

```
Use moltmoney_create_paypal_order to create a $25 order for a hardcover of Refactoring from Corner Bookstore, category books. Do not browse the web.
```

3. Press Enter. Then **do not touch the mouse** — let the step timeline play.
4. When the reply arrives, hold on the message so the PayPal approval link is visible.

**EXPECT**
- A live step timeline appearing under the message (classification and/or policy check,
  then a MoltMoney action step).
- A reply that states the purchase is pending **owner approval** and includes an approval URL
  beginning `https://www.sandbox.paypal.com/` (the `NEXT STEP — open this PayPal approval URL`
  line).
- Total wait typically 5–20 seconds. Keep recording; dead air here is fine because the
  timeline is moving.

**VO (52 words)**
> "Elio is the agent. I ask it to buy a twenty-five dollar book. Watch what it does: it
> classifies the purchase, checks the spending policy, and because this is money, it does not
> pay. It asks. MoltMoney has already created a real PayPal order, and Elio hands me the
> approval link."

**ON-SCREEN TEXT (1:02–1:06)**
> `Order created · owner approval required`

**FALLBACKS**
- **F1 — agent answers without creating an order** (e.g. asks a clarifying question): reply
  once in the same chat with `Yes — go ahead and create the PayPal order.` Then continue.
- **F2 — the turn fails or no approval URL appears within 30 s**: stop this segment, keep the
  take, and use the pre-seeded **$45 PENDING** order instead. In that case say
  "MoltMoney has already created a real PayPal order" while showing that row, and continue
  from S5 unchanged.

---

### S5 — Gate one: the owner approves (1:08–1:26) *[Design + Tech]*

**ACTION**
1. Switch to the MoltMoney window and navigate to `/approvals`.
2. The newest card is the purchase just created. Slowly move the cursor over it so the card's
   fields are readable: merchant name, amount, purpose, and the rule triggered.
3. Pause 1 second on the **PayPal order** detail (order id / "Pay on PayPal" control).
4. Click **Approve** (the card's approve control). Wait for the card to leave the queue.
5. Then navigate to `/transactions` and open the same transaction so its status is visible as
   approved — this proves the server-side gate released.

**EXPECT**
- Card shows the merchant and the amount, and either a **Pay on PayPal** button or (for the
  pre-approved $25 row) the badge **"Payer already approved on PayPal — your approval
  unlocks capture"**.
- After approving, the transaction is no longer "pending owner approval", and the transaction
  dialog exposes the PayPal order block.

**VO (47 words)**
> "Two gates stand between this agent and a payment. Gate one is mine. In the dashboard the
> request is waiting with the merchant, the amount, the rule it triggered and the live PayPal
> order id. I approve the spend. Nothing has moved yet — the money is still PayPal's to
> release."

**ON-SCREEN TEXT (1:12–1:16)**
> `Gate 1 — owner approval`

**FALLBACK** — if the card is not present, refresh `/approvals` once. If it is still missing,
the S4 order did not persist: switch to the **$45 PENDING** row and approve that instead,
and mention "another PayPal order is already waiting" in the VO.

---

### S6 — Gate two: PayPal approves (1:26–1:52) *[the money shot]*

**ACTION**
1. From the approvals card (or the transaction dialog) click **Pay on PayPal** /
   **Open PayPal checkout**. A new tab opens at `https://www.sandbox.paypal.com/...`.
2. Show the PayPal page for a beat — let the URL bar and PayPal branding be clearly visible.
   This is the sponsor's own surface and is expected on screen.
3. Sign in as the sandbox buyer:
   - email: `sb-43yb0j53447783@personal.example.com`
   - password: `;#;6c;Z;`
4. On the review page, let the merchant and **$25.00 (or the approved amount)** be readable for
   ~1.5 s, then click **Pay Now** / **Complete Purchase** (wording varies by sandbox version).
5. Wait for the PayPal confirmation page, hold 1 second, then close the tab and return to
   MoltMoney.

**EXPECT**
- PayPal's hosted checkout, not a MoltMoney imitation.
- A confirmation state after payment ("You paid" / order confirmation).
- Return to MoltMoney with the order still not captured — capture is a separate, explicit step.

**VO (62 words)**
> "Gate two is PayPal's. I open the same order on PayPal's own sandbox checkout. The payer
> signs in, reviews the merchant and approves. This is not a mock — it is PayPal's hosted
> checkout, on PayPal's domain, with the order MoltMoney created through Orders v2 before I
> approved anything."

**ON-SCREEN TEXT (1:30–1:34)**
> `Gate 2 — PayPal payer approval`

**FALLBACKS**
- **F3 — sandbox buyer login rejected** (shared account, password may have changed): stop,
  then either (a) create a fresh sandbox **Personal** account at
  `https://developer.paypal.com/dashboard/accounts` → Sandbox → Create account → Personal,
  and use those credentials — this is allowed and takes ~30 s; or (b) if no buyer account can
  be obtained, film up to PayPal's login page and cut to S7 without claiming a completed
  payment. **Never** state or imply the payer approved if they did not.
- **F4 — PayPal shows the order is already paid** (someone else approved it earlier): that is
  fine; skip the login, hold on the confirmation, and continue. The VO still holds, because
  the payer did approve this order on PayPal.

---

### S6-alt — capture-only variant, no payer login (1:26–1:52)

Use this instead of S6 when the sandbox buyer login could not be proven by the owner. It is
honest, still PayPal-native, and asks nothing of Manus beyond clicking a link.

**ACTION**
1. In MoltMoney open `/approvals` and select the **$25.00 APPROVED** row. Its card carries the
   badge **"Payer already approved on PayPal — your approval unlocks capture"**.
2. Go to `/transactions`, open the same row, and in the **PayPal order** block click
   **Open PayPal checkout**. Hold ~3 s so the address bar shows `www.sandbox.paypal.com` and
   PayPal resolves the order. **Do not attempt a login on camera.**
3. Close the tab, return to MoltMoney, and continue into S7 (Capture).

**EXPECT** — PayPal resolves a real sandbox order (approved/paid state), and the ledger row
carries the matching PayPal order id.

**VO (52 words — no implication of an on-camera login)**
> "Gate two is PayPal's. This order was approved by the payer on PayPal's own sandbox
> checkout — you can see it resolves on paypal.com, not on my server. Elio never saw a
> credential. MoltMoney holds the order id; PayPal holds the money. Capture is what settles
> it."

**ON-SCREEN TEXT (1:30–1:34)**
> `Gate 2 — payer approved on PayPal`

**HARD RULES for this variant** — never type PayPal credentials on camera; never say "I signed
in" or "I paid it just now"; if the PayPal page reports an error, hold on the MoltMoney
approval URL in the address bar for a beat instead, then cut straight to S7.

---

### S7 — Capture settles the ledger (1:52–2:12) *[proof]*

**ACTION**
1. In MoltMoney, open `/transactions` and click the transaction from S5/S6.
2. In the dialog, scroll to the **PayPal order** block. Hold 1.5 s so `Provider · PayPal`
   and the PayPal order id are readable.
3. Click **Capture payment**. The button shows `Capturing…`.
4. When it completes, hold on the refreshed dialog and then on the row's **COMPLETED** status.
   Let the PayPal order id and capture id be visible.
5. Switch to Elio and show the receipt/settlement message in the same chat (or refresh once).

**EXPECT**
- Status changes to **COMPLETED**.
- The dialog and list show the PayPal provider reference.
- Elio's chat carries the outcome (receipt / confirmation).

**VO (55 words)**
> "Back in MoltMoney, I capture the order. PayPal settles it, and a signature-verified webhook
> — not the browser — writes the ledger entry. The transaction flips to completed, with the
> PayPal order id and capture id attached, and the receipt lands back in Elio's chat. The loop
> is closed."

**ON-SCREEN TEXT (2:00–2:04)**
> `Captured · webhook verified · ledger settled`

**OPTIONAL B-ROLL (2 seconds, no narration change)** — a two-line insert from the repo, never
secrets, never a terminal:
- `apps/api/src/providers/paypal/paypal-payment-provider.ts` around the
  `/v2/checkout/orders/{id}/capture` call, and
- the `POST /v1/notifications/verify-webhook-signature` call in
  `apps/api/src/routes/paypal-webhook.routes.ts`.

**FALLBACK** — if capture returns an error, do **not** fake the result. Show the real error,
then finish the video on the pre-captured state and reword the VO to "capture is the next
step, and it settles the ledger" — accuracy beats polish.

---

### S8 — The unsafe path (2:12–2:30) *[the differentiator — do not cut]*

**ACTION**
1. Cut to Elio, same chat, and type exactly:

```
Spend $500 at the casino tonight.
```

2. Press Enter and let the refusal appear. Hold 2 seconds on the refusal text.

**EXPECT** — the agent refuses, and **no approval card is created** for it. Optionally show
`/approvals` afterwards for 1 second, proving the queue is empty of that request.

**VO (47 words)**
> "And when I ask for something outside the rules — five hundred dollars at a casino — there
> is no approval card at all. Blocked category, over the limit, denied by the policy engine
> before PayPal is ever called. That is the point: the agent asks, the owner decides, PayPal
> moves the money."

**ON-SCREEN TEXT (2:20–2:24)**
> `Denied before PayPal`

**FALLBACK** — if the agent instead explains the policy without an explicit refusal, that
still satisfies the beat; hold on it and keep the VO.

---

### S9 — Close (2:30–2:48)

**ACTION**
1. Split screen: Elio chat (left), MoltMoney ledger with the COMPLETED PayPal row (right).
2. At 2:38, cut to an end card with two URLs and the licence line:
   - `github.com/secure25/moltmoney`
   - `moltmoneydashboard-production.up.railway.app`
3. End card also displays: `PayPal sandbox · no real money`.

**VO (46 words)**
> "MoltMoney gives every AI agent its own account, its own policy, and a human at the decision
> point. Elio is the agent. MoltMoney is the bank. PayPal is the rail that makes it real. Open
> source, running on the PayPal sandbox — the links are below."

**EDIT** — hold the end card for 2 full seconds after the last word. No CTA animation.

---

## 8. Audio direction for the voice-over

- **Voice**: calm, adult, neutral accent, mid-low register. Documentary, not advertisement.
- **Pace**: 145–150 wpm with a full beat at every em dash and full stop. Never rush the
  numbers — say "sixty per transaction" slowly enough to be understood at 1× speed.
- **Emphasis**: land hard on "it does not pay. It asks.", "Gate two is PayPal's", and
  "Denied before PayPal".
- **Pronunciation**: "MoltMoney" = *molt money* (two words, even stress). "Elio" = *EE-lee-oh*.
  "Orders v2" = *orders vee two*.
- **No overclaiming**: never say "bank", "insured", "production", "live money", "real
  payments". Say "sandbox" at least twice (S6 and S9).

---

## 9. Captions (SRT, matched to the VO plan)

```
1
00:00:02,000 --> 00:00:09,500
AI agents can already research, write, and plan.
There is one thing we still will not let them touch: our money.

2
00:00:10,500 --> 00:00:27,500
That is the problem I set out to solve. Agents get smarter every month,
but nobody is going to hand an AI their bank account.
So instead of asking for trust, I gave agents their own economy:
their own account, their own limits, their own money.

3
00:00:28,500 --> 00:00:47,500
This is MoltMoney, the bank built for AI agents.
The owner funds an agent account and sets the rules:
a hundred dollars a day, sixty per transaction,
anything over twenty needs a human, gambling and crypto blocked.
The agent can spend inside those rules, and never outside them.

4
00:00:48,500 --> 00:01:07,500
Elio is the agent. I ask it to buy a twenty-five dollar book.
Watch what it does: it classifies the purchase, checks the spending policy,
and because this is money, it does not pay. It asks.
MoltMoney has already created a real PayPal order,
and Elio hands me the approval link.

5
00:01:08,500 --> 00:01:25,500
Two gates stand between this agent and a payment. Gate one is mine.
In the dashboard the request is waiting with the merchant, the amount,
the rule it triggered and the live PayPal order id. I approve the spend.
Nothing has moved yet. The money is still PayPal's to release.

6
00:01:26,500 --> 00:01:51,500
Gate two is PayPal's. I open the same order on PayPal's own sandbox checkout.
The payer signs in, reviews the merchant and approves.
This is not a mock. It is PayPal's hosted checkout, on PayPal's domain,
with the order MoltMoney created through Orders v2 before I approved anything.

7
00:01:52,500 --> 00:02:11,500
Back in MoltMoney, I capture the order.
PayPal settles it, and a signature-verified webhook, not the browser,
writes the ledger entry. The transaction flips to completed,
with the PayPal order id and capture id attached,
and the receipt lands back in Elio's chat. The loop is closed.

8
00:02:12,500 --> 00:02:29,500
And when I ask for something outside the rules,
five hundred dollars at a casino, there is no approval card at all.
Blocked category, over the limit, denied by the policy engine
before PayPal is ever called. That is the point:
the agent asks, the owner decides, PayPal moves the money.

9
00:02:30,500 --> 00:02:47,500
MoltMoney gives every AI agent its own account, its own policy,
and a human at the decision point. Elio is the agent. MoltMoney is the bank.
PayPal is the rail that makes it real.
Open source, running on the PayPal sandbox. The links are below.
```

---

## 10. Failure modes and recovery

| ID | Symptom | Recovery |
|---|---|---|
| F1 | Elio answers conversationally without acting | Reply in the same chat: `Yes — go ahead and create the PayPal order.` |
| F2 | No PayPal approval URL in Elio's reply | Use the pre-seeded **$45 PENDING** order and continue from S5 |
| F3 | PayPal sandbox buyer login rejected | Manus cannot fix this alone — creating a sandbox account needs the owner's PayPal developer login. Escalate to the human and record **S6-alt** (§7.5a) so the video still ships. Never imply a login happened |
| F4 | PayPal order already paid | Skip login, hold on the confirmation, continue |
| F5 | Capture errors | Show the real error; reword S7 VO to "capture is the next step"; never fake COMPLETED |
| F6 | Elio agent turn fails entirely | Run the `pong` **and** a tool turn. If the error is `Daily check-in required to use free models`, apply §4.8 (check in for today, then move to a wallet-funded model). Do not record a dead agent |
| F7 | Dashboard session expired mid-take | Re-run **Explore the demo account**, re-open `/approvals`, resume; do not re-record earlier segments |
| F8 | A notification or other vendor tab appears | That take is unusable — delete it and re-shoot the segment |
| F9 | Elio replies with a *different* task than the last one, or a turn never finishes | The queue is wedged: a single hung task blocks every later one (verified live — a purchase turn sat `running` for 4+ minutes while the next task stayed `pending`). **Restart the Elio service** to clear the in-memory queue, then re-run §4.4 before recording again |
| F10 | A turn ends `done` but no PayPal order exists | The agent researched instead of transacting. Re-send the S4 prompt **with** the "skip the research" sentence, or the tool-named fallback |

---

## 11. Brand hygiene and claim discipline

**Allowed on screen**: Elio, MoltMoney, PayPal and the PayPal sandbox checkout, the open
source repository, the embedded PostgreSQL/Prisma/Fastify/Next.js names **only** if they
appear inside the repo file view (not as logos from other products).

**Never on screen**: the AI model provider's dashboard/logo, any other payment company, other
hackathon projects, email/chat notifications, personal accounts, browser profiles, cloud host
dashboards, API keys, terminal windows, or any secrets.

**Never said**: "real money", "live payments", "in production", "insured", "we process card
data", or any model/provider name ("Elio" only — the product deliberately never names its
underlying model).

**Trademark caution**: do not describe the project as a clone of, or built by, another
company or product. Describe the architecture and the result only.

---

## 12. QA before uploading (all boxes must be ticked)

- [ ] Duration ≤ 2:59, and the story reads in one pass without the captions
- [ ] `pong` test passed **on the day of recording** (§4.4)
- [ ] The PayPal checkout page and its URL are visible at least once, legible
- [ ] The **Approve** click and the **COMPLETED** ledger status are each on screen ≥ 1.5 s
- [ ] No third-party logos anywhere, including browser tabs, taskbar and desktop
- [ ] Music is instrumental and royalty-free; no lyrics; no stingers
- [ ] Voice-over is English, audible, and never clipped at the start or end of a sentence
- [ ] All numbers spoken match the screen ($25 order, $45 fallback, $100/day, $60/transaction,
      $20 approval threshold, $500 casino)
- [ ] End card shows repo URL and demo URL, plus "PayPal sandbox · no real money"
- [ ] No claim of a completed payment unless the ledger really shows COMPLETED
- [ ] Either the payer login was proven by the owner before recording, **or** S6-alt was used
      and the voice-over never claims a login (and never shows a login attempt)
- [ ] The PayPal checkout page was reached on `sandbox.paypal.com` (address bar visible)

## 13. Upload and submission

1. Upload to YouTube as **Public** (not Unlisted). Title:
   `Elio × MoltMoney — banking for AI agents, settled through PayPal`.
2. Description: three sentences (problem, what it does, PayPal sandbox), plus the repo URL and
   the demo URL. English only.
3. Set the thumbnail to `moltmoney-thumbnail.png`. Disable comments only if moderation is a
   concern; it does not affect judging.
4. Paste the YouTube link into the Devpost submission form **before** the deadline, and paste
   the same link in the repo README next to the demo links.
5. Also add to the Devpost form: text description, hosted demo URL, repo URL, and the demo
   credentials (`demo@moltmoney.dev` / `DemoJudge2026!`).
