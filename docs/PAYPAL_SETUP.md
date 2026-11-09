# PayPal sandbox setup for Mandate

Mandate refuses live PayPal. Use sandbox credentials only.

## 1. Create a developer account

1. Open [developer.paypal.com](https://developer.paypal.com/).
2. Sign in with a PayPal account, or create one.
3. Toggle the top switch to **Sandbox**.

## 2. Create a REST app

1. Open **Apps & Credentials**.
2. Select **Create App**.
3. Name it something like `mandate-hackathon`.
4. Choose **Merchant**.
5. Link the default **sandbox business** account.
6. Create the app.
7. Copy the **Client ID** and **Secret** into `.env`:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox
```

## 3. Note the personal buyer login

The business account owns the app. The **personal** account approves the hold in the demo.

1. Open **Testing Tools → Sandbox Accounts**.
2. Find the **Personal** account.
3. Open it and copy the email and password.
4. Keep those credentials next to you for the video and for judges reading the README.

You do not put the buyer password in `.env`. You type it into the PayPal approval popup.

## 4. Confirm the environment

From the project root:

```bash
cp .env.example .env
# fill PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, OPENAI_API_KEY
npm run check
```

`npm run check` prints which values are present. It never prints secret values.

## 5. What you will see in the demo

1. Mandate creates a PayPal order with `intent: AUTHORIZE`.
2. You log in as the sandbox personal buyer and approve the hold.
3. Mandate calls `/v2/checkout/orders/{id}/authorize`.
4. After the verifier decides:
   - **release** → capture the authorization
   - **reject** → void the authorization

Order id, authorization id, capture id, and PayPal status appear in the UI.

## Optional: Payouts

This project uses authorize then capture or void. You do not need Payouts enabled for the submission.
