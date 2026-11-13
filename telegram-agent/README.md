# EORE Analytics Telegram agent

Cloudflare Worker deployed from `telegram-agent/` in `deafinicio/mine-risk-map`. Active Telegram webhook: `https://eore-analytics-agent.deafinicio.workers.dev/telegram/webhook`.

## Configuration
- Workers AI binding: `AI`
- KV binding: `AGENT_KV` (namespace `eore-agent-state`)
- Cloudflare secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- Text variable: `TELEGRAM_BOT_USERNAME=eore_cpp_bot`
- `keep_vars: true` retains existing dashboard secrets during GitHub deployment.
- No credentials in repository or logs.

## Behaviour
- Only configured group chat is accepted.
- With Telegram Privacy Mode enabled, use `/ask@eore_cpp_bot`, `/eore@eore_cpp_bot`, or Reply to a bot message. Plain @mentions are not reliably delivered by Telegram with privacy mode on.
- Replies are sent into the same forum topic if Telegram supplies `message_thread_id`.
- Simple monthly/year-to-date questions on session counts and attendance (including children/adults) are computed in JavaScript from published monthly data. Ambiguous/complex questions go to Workers AI. Aggregated attendance is not guaranteed unique people.
- Emergency safety response bypasses AI.
- Only public monthly aggregated dashboard data are loaded.

## Limits and cost caveat
- Best-effort KV quotas: 5 accepted requests/user/day, 40 accepted requests globally/day, 60 seconds between accepted requests/user. KV stores short-lived update IDs and quota counters.
- **Cloudflare KV is eventually consistent; concurrent requests can bypass these limits. These are not hard billing caps.** If strict enforcement becomes necessary, use a transactional rate limiter such as a Durable Object and validate its current free-plan limits.
- Review Cloudflare Workers AI and Workers free-plan usage and disable paid overages in Cloudflare billing settings. No code-only limit can guarantee zero charges if account billing settings allow paid usage.

## Monitoring
Cloudflare Workers & Pages → eore-analytics-agent → Observability → Logs. Structured events: `request_accepted`, `request_skipped` (limited/duplicate), `stats_unavailable`, `ai_unavailable`, `response_sent` (deterministic/ai/safety), `handler_failed` (telegram_api/internal). No message text, user IDs, tokens or secrets are logged.

## Health and security
- `GET /health` returns a service heartbeat.
- `POST /telegram/webhook` requires Telegram's `X-Telegram-Bot-Api-Secret-Token` header and valid JSON.
- Temporary `/test-ai` and `/test-state` routes have been removed.
- Webhook registration is managed in Telegram and is not modified by deployments.
- Existing scheduled report workflow `.github/workflows/telegram-monthly.yml` remains independent and unchanged.

## Manual verification after deployment
1. Confirm deployment Ready and `GET /health` returns 200.
2. In Telegram, send `/ask@eore_cpp_bot Скільки сесій та учасників у жовтні 2026 року?` and check the published figures.
3. Wait 60 seconds; Reply to the bot's message with a short question.
4. Verify Cloudflare logs contain `response_sent`; ensure no `handler_failed`.
5. Inspect Workers AI usage/quota and billing controls in Cloudflare.

Never paste secrets into chats, screenshots or issue reports.
