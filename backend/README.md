# Promptory Backend

Cloudflare Workers + D1 + Hono API for Promptory.

Endpoints:
- `POST /v1/feedback` — store in-extension feedback (rating + optional message)
- `POST /v1/conversion` — receive a Google Ads `gclid` after extension install and upload it as an offline conversion

## First-time deploy (one machine, ~10 minutes)

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

A browser window opens — pick the same Cloudflare account that owns `promptory.chat`.

### 3. Create the D1 database

```bash
npx wrangler d1 create promptory
```

Output looks like:
```
✅ Successfully created DB 'promptory'

[[d1_databases]]
binding = "DB"
database_name = "promptory"
database_id = "abc123-..."
```

Copy the `database_id` value into `wrangler.toml` (replace `REPLACE_WITH_DATABASE_ID_AFTER_CREATE`).

### 4. Create the KV namespace for rate limiting

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Copy the returned `id` into `wrangler.toml` (replace `REPLACE_WITH_KV_ID_AFTER_CREATE`).

### 5. Run the initial migration

```bash
npm run db:migrate:prod
```

(`db:migrate:local` does the same thing against a local SQLite file for `wrangler dev`.)

### 6. Deploy

```bash
npm run deploy
```

You'll get a URL like `https://promptory-api.<your-subdomain>.workers.dev`. Smoke test:

```bash
curl https://promptory-api.<your-subdomain>.workers.dev/
# {"service":"promptory-api","version":1,"status":"ok"}
```

### 7. Wire `api.promptory.chat`

In the Cloudflare dashboard:
1. Go to **Workers & Pages → promptory-api → Settings → Domains & Routes**
2. Click **Add custom domain** → `api.promptory.chat`
3. Cloudflare adds the DNS record automatically (since promptory.chat is on Cloudflare)
4. Wait ~30 seconds for the cert; the API is now live at `https://api.promptory.chat`

Then uncomment the `routes` section in `wrangler.toml` so future deploys keep the binding.

## Setting Google Ads secrets (after token approval)

Once the developer token is approved and you've configured the conversion action:

```bash
npx wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN
npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN
npx wrangler secret put GOOGLE_ADS_CLIENT_ID
npx wrangler secret put GOOGLE_ADS_CLIENT_SECRET
npx wrangler secret put GOOGLE_ADS_CUSTOMER_ID
npx wrangler secret put GOOGLE_ADS_CONVERSION_ACTION_ID
```

`GOOGLE_ADS_CUSTOMER_ID` is the MCC ID with no dashes (e.g. `4706295146`).

`GOOGLE_ADS_REFRESH_TOKEN` comes from the OAuth Playground or your own one-time consent flow.

Until all six are set, the `/v1/conversion` endpoint still accepts requests and stores them with status `pending`. You can backfill once secrets are in place.

## Local development

```bash
npm run db:migrate:local       # one-time, creates local SQLite
npm run dev                    # http://localhost:8787
curl -X POST http://localhost:8787/v1/feedback \
  -H 'content-type: application/json' \
  -H 'origin: https://promptory.chat' \
  -d '{"rating": 5, "message": "Love it"}'
```

## Inspecting data

```bash
# Recent feedback
npm run db:console:prod -- "SELECT id, rating, substr(message,1,40), created_at FROM feedback ORDER BY id DESC LIMIT 20;"

# Pending conversions (Google Ads upload not yet done)
npm run db:console:prod -- "SELECT id, status, conversion_at, error_message FROM conversions WHERE status != 'uploaded' ORDER BY id DESC LIMIT 20;"
```

## Tail logs

```bash
npm run tail
```
