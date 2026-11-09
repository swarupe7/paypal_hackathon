# Mandate

Hold a PayPal sandbox payment until a second AI model accepts the work, then **capture** or **void** that authorization.

Mandate is built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). A buyer funds a job with a PayPal hold. A worker agent produces the deliverable. A verifier agent scores it against the acceptance rules. Only the verifier’s decision moves the money.

```text
Brief + rules + amount
        │
        ▼
PayPal order (intent AUTHORIZE)
        │
        ▼
Buyer approves hold (sandbox personal account)
        │
        ▼
Worker model writes deliverable
        │
        ▼
Verifier model → release | reject
        │                │
        ▼                ▼
   capture auth      void auth
```

## Requirements

- Node.js 20 or newer
- A [PayPal Developer](https://developer.paypal.com/) sandbox app (Client ID + Secret)
- An OpenAI-compatible API key for the worker and verifier

Sandbox setup steps, including the personal buyer login, are in [docs/PAYPAL_SETUP.md](docs/PAYPAL_SETUP.md).

## Quick start

```bash
git clone <your-public-repo-url>
cd paypal-mandate
cp .env.example .env
```

Edit `.env`:

```env
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
PAYPAL_MODE=sandbox
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
PORT=8787
```

Then:

```bash
npm install
npm run check
npm start
```

Open [http://localhost:8787](http://localhost:8787).

## Demo paths for judges

### 1. Work that should be paid

1. Click **Work that should be paid**.
2. Click **Hold funds in PayPal**.
3. In the PayPal popup, sign in with the sandbox **personal** buyer (not your live account).
4. Approve the hold. Confirm if the popup already closed.
5. Click **Run worker, then verifier**.
6. Expect a **release** decision and a **capture id** on screen.

### 2. Planted failure

1. Click **Planted failure**.
2. Hold and approve funds again with the sandbox personal buyer.
3. Click **Submit planted deliverable**.
4. Expect a **reject** decision and a **voided** PayPal status.

The planted draft contains the word `placeholder` and cites nothing, so the acceptance rules fail on purpose.

## What PayPal does here

| Step | API |
| --- | --- |
| Create hold | `POST /v2/checkout/orders` with `intent: AUTHORIZE` |
| Buyer approval | PayPal JS SDK (sandbox) |
| Lock funds | `POST /v2/checkout/orders/{id}/authorize` |
| Pay for accepted work | `POST /v2/payments/authorizations/{id}/capture` |
| Release rejected hold | `POST /v2/payments/authorizations/{id}/void` |
| Refresh | `GET /v2/checkout/orders/{id}` |

Order id, authorization id, capture id, and PayPal status are shown in the UI. Manual **Capture anyway** and **Void the hold** buttons remain available if the model call fails.

## What AI does here

| Agent | Role |
| --- | --- |
| Worker | Writes the deliverable from the brief and rules |
| Verifier | Sees only the rules and deliverable; returns JSON `decision`, `score`, `rationale`, `citations` |

The verifier never receives a prompt that says “always pay.” A small rule gate can block a capture when fixed checks fail. It cannot force a capture.

If `OPENAI_API_KEY` is missing, PayPal holds, captures, and voids still work. The worker and verifier stay blocked, and the UI says so.

## Project layout

```text
server.js              Express app
src/paypal.js          Sandbox Orders + Payments client
src/agents.js          Worker and verifier model calls
src/store.js           SQLite mandate ledger
src/rules.js           Fixed acceptance checks
src/settlement.js      release/reject → capture/void/hold
src/examples.js        Pass and fail demo briefs
public/                Demo UI
docs/PAYPAL_SETUP.md   Sandbox account steps
docs/SUBMISSION.md     Devpost copy and video shot list
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Run the demo server |
| `npm run check` | Confirm env names are present (never prints secrets) |
| `npm test` | Unit tests for money, rules, settlement, and verifier JSON |

## License

MIT. See [LICENSE](LICENSE).

## Submission notes

Hackathon submission checklist and Devpost draft text live in [docs/SUBMISSION.md](docs/SUBMISSION.md). Deadline: **Thursday, November 12, 2026, 12:00 pm Pacific** (1:30 am IST on Friday, November 13).
