# Elio × MoltMoney — Hackathon Demo Video Script

Target: **under 3:00** (Devpost rule: judges aren't required to watch past 3
minutes). Public YouTube upload. Show the product functioning on the device it
was built for (desktop browser + Telegram). No third-party trademarks or
copyrighted music.

Recording setup:
- Screen recorder (OBS / Windows Game Bar) at 1920×1080
- Two browser windows side by side: Elio chat (port 3210) and MoltMoney
  dashboard (port 3001); Telegram open if connected
- Mic narration or captions; music only if royalty-free
- Run the stack with the mock provider, or PayPal sandbox if keys are set

---

## Shot list

### 1. Hook (0:00–0:15)
- Open on the MoltMoney dashboard (landing or logged-in overview).
- Say: "AI agents can browse, code, and schedule — but they can't safely move
  money. MoltMoney is the bank built for them, and Elio is the agent that uses
  it."
- Quick cut to the architecture diagram from the README (2–3 s) if you want a
  visual anchor.

### 2. The setup (0:15–0:35)
- Show the agent account in the dashboard: balance, spending policy panel —
  per-transaction limit, daily budget, one blocked category highlighted.
- Say: "Every agent account has a hard spending policy. Blocked categories,
  budgets, approval thresholds — set by the owner, enforced server-side."

### 3. The purchase request (0:35–1:00)
- Switch to Elio's chat. Type: *"Buy a $5 book from the bookstore."*
- Let the viewer watch Elio's step timeline: classify → policy check →
  Sentinel approval queued.
- Say: "Elio classified the purchase, checked the policy, and — because money
  movement always requires a human — queued an approval instead of paying."

### 4. The human approval (1:00–1:30)
- Switch to the dashboard Approvals page (or Telegram, if connected — the
  Approve/Decline card arriving in chat is a great beat).
- Click **Approve**.
- Say: "The owner approves it once, from the dashboard or Telegram. Nothing
  moves without this click."

### 5. PayPal executes (1:30–2:15)
- Show the PayPal sandbox approval page opening, click through it.
- Come back: MoltMoney captures the order, and the receipt lands back in
  Elio's chat.
- Show the transaction in the dashboard ledger with the PayPal order id.
- Say: "Elio never touched a credential. MoltMoney created the sandbox order,
  PayPal processed it, the webhook confirmed the capture, and the receipt is
  back in chat — with the full ledger entry."

### 6. The unsafe path, fast (2:15–2:35)  ← differentiator, don't skip
- Type into Elio: *"Spend $500 at the casino."* (or whatever is in your
  blocked categories)
- Show the refusal + no approval created.
- Say: "And when a purchase hits a blocked category, there is no approval
  card at all — the agent refuses before the request even exists."

### 7. Close (2:35–2:50)
- Split screen: agent + bank + policy engine.
- Say: "Elio × MoltMoney — agentic commerce with human control at the center.
  Built on the PayPal platform and the free sandbox. Thanks for watching."

---

## Rules checklist before uploading

- [ ] Total duration under 3:00
- [ ] Shows the product actually functioning (no mockups)
- [ ] Captions/narration in English
- [ ] No third-party trademarks on screen (close other tabs; avoid
      non-PayPal logos) and no copyrighted music
- [ ] Upload to YouTube, set **public/unlisted-public**, copy the link into
      the Devpost submission form
- [ ] Devpost form also needs: text description, tools-used explanation
      (LLM providers, PayPal APIs), hosted demo URL, repo URL
