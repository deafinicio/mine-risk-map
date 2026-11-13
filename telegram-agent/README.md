# EORE Analytics Telegram AI agent — Cloudflare Workers

Separate from the existing scheduled monthly Telegram report. **Not active until explicitly deployed and the Telegram webhook is registered.**

## Existing Cloudflare setup
- Worker: `eore-analytics-agent`
- URL: `https://eore-analytics-agent.deafinicio.workers.dev`
- AI binding: `AI` (Workers AI)
- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- Plain variable still required: `TELEGRAM_BOT_USERNAME` (username without @, for reliable mention/reply detection)

## Deploy
Use Wrangler with the Cloudflare account authorized locally:
```sh
cd telegram-agent
npx wrangler deploy
```
The binding is declared in `wrangler.jsonc`. Existing secrets should be verified after deployment. Never commit secrets.

## Test BEFORE webhook registration
```sh
curl -i https://eore-analytics-agent.deafinicio.workers.dev/health
```
Expect HTTP 200 with `{"ok":true,...}`. A POST to `/telegram/webhook` without the secret header must return HTTP 401.

## Register webhook (ONLY after testing)
Use a local terminal and the real Telegram token. Avoid pasting it into a browser URL or sharing it.
```powershell
$token = Read-Host "Telegram bot token"
$hook = Read-Host "Webhook secret"
$payload = @{ url = "https://eore-analytics-agent.deafinicio.workers.dev/telegram/webhook"; secret_token = $hook; allowed_updates = @("message"); drop_pending_updates = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType "application/json" -Body $payload
```
**Warning:** `drop_pending_updates=true` discards queued updates. Use only after confirming no pending updates need processing. A Telegram bot can use only one webhook; registering replaces an existing webhook. Monthly outgoing GitHub Actions `sendPhoto` continues independently.

## Important constraints
- Processes only group messages from the configured numeric chat ID.
- Replies to explicit `@username`, `/ask`, `/eore`, or replies to the bot. Does not scan ordinary group conversations.
- This MVP has no long-term memory, no knowledge-base retrieval, and no durable deduplication/rate limiter yet. **Do not activate in a busy group before these are added.**
- Public dashboard dataset is read from GitHub Pages; the model sees monthly aggregate metrics only.
- Responses are automated, not professional emergency assessment.
- Cloudflare Workers and Workers AI have separate free quotas. Do not enable paid overages. Model availability and limits must be verified in the Cloudflare dashboard.
- For sensitive EORE questions, the model must acknowledge missing approved sources. Add vetted knowledge before relying on domain-specific answers.
- Do not paste tokens or personal records in GitHub, chat, or logs.
