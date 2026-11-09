# Devpost submission draft for Mandate

Use this copy on [paypalaihackathon.devpost.com](https://paypalaihackathon.devpost.com/). Replace the repository and video URLs after you publish them.

## Project name

Mandate

## Elevator pitch

An AI worker writes the deliverable. A second AI model decides whether PayPal captures the held funds or voids them.

## Description

Mandate is a payment gate for agent work.

A buyer posts a brief, acceptance rules, and a budget. Mandate creates a PayPal sandbox order with `intent: AUTHORIZE`. The buyer approves the hold with a sandbox personal account. A worker model writes the deliverable. A separate verifier model scores that deliverable against the rules and returns `release` or `reject`.

Only then does money move:

- `release` captures the PayPal authorization
- `reject` voids the authorization and releases the hold

PayPal is the source of truth for the hold. The UI shows the order id, authorization id, capture id, and PayPal status. Manual capture and void buttons remain available so a judge can finish the payment path if the model call fails.

Two built-in examples make both outcomes easy to demo:

1. **Work that should be paid** — the worker cites the required PayPal API pages and the verifier captures the hold.
2. **Planted failure** — a draft that contains the forbidden word `placeholder` and cites nothing. The hold is voided.

## Features

- PayPal Orders v2 authorize hold
- PayPal Payments v2 capture and void
- Separate worker and verifier model calls
- Rule gate that can block a capture and never force one
- SQLite ledger of mandates
- Judge-ready README and sandbox setup guide

## Tools used

| Tool | How it is used |
| --- | --- |
| PayPal Sandbox REST APIs | Create order, authorize, capture, void |
| PayPal JS SDK | Buyer approval of the hold |
| OpenAI-compatible chat API | Worker writes the deliverable; verifier returns a JSON decision |
| Node.js + Express | HTTP API and static demo UI |
| better-sqlite3 | Local mandate ledger |

## Demo video shot list (under 3 minutes)

1. Open the app and show the banner states if credentials are missing, then the ready UI.
2. Click **Work that should be paid**. Create the hold.
3. Approve with the sandbox personal buyer. Show order id and authorization id.
4. Run the worker and verifier. Show the release rationale and capture id.
5. Create the **Planted failure** example. Approve again.
6. Submit the planted deliverable. Show the reject rationale and voided status.
7. End on the ledger with both outcomes visible.

Record system audio off. Do not add copyrighted music. Show the project running in a browser.

## Public repository checklist

- [ ] Repository is public on GitHub, GitLab, or Bitbucket
- [ ] `LICENSE` is visible at the repo root
- [ ] README has setup and run instructions
- [ ] `.env` is not committed
- [ ] Demo video uploaded to YouTube, public, under 3 minutes
- [ ] Devpost form includes description, tools, repo URL, and video URL

## Suggested Devpost answers

**Which PayPal technologies did you use?**
Orders API v2 (`AUTHORIZE`), Payments API v2 capture and void, PayPal JavaScript SDK for buyer approval in sandbox.

**Which AI tools did you use?**
An OpenAI-compatible chat model. One call produces the deliverable. A second call returns JSON with `decision`, `score`, `rationale`, and `citations`.

**How can judges run it?**
Clone the public repo, copy `.env.example` to `.env`, add PayPal sandbox Client ID/Secret and an API key, run `npm install` and `npm start`, open `http://localhost:8787`.
