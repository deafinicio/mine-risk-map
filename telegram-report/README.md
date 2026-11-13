# Telegram EORE monthly report

Source of truth: `data/dashboard-2026.json`, also used by the public dashboard. No synthetic metrics.

## Setup
1. Create a Telegram bot with @BotFather; add it to the intended Telegram group and allow it to post messages.
2. Find the group's numeric chat ID (e.g. via a temporary `getUpdates` request after sending a group command; do not expose the bot token).
3. Add **repository Actions secrets** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in GitHub Settings → Secrets and variables → Actions.
4. Open Actions → **EORE Telegram monthly report** → Run workflow. Supply a completed month like `2026-10`; leave **dry_run=true** first. Download the generated PNG artifact and verify it. Then repeat with **dry_run=false** to publish.
5. The scheduled workflow runs on the **2nd of each month at 07:15 UTC**, and reports the previous calendar month. This leaves some time for the monthly dataset to be updated. GitHub scheduled runs can be delayed.

## Safeguards and limitations
- Missing month, absent coverage, inconsistent age totals, inconsistent location sums, or zero sessions prevent sending.
- Only one source file is read. Updating Google Sheets **does not automatically update** this static JSON; the existing dashboard ingestion process must update it first.
- A failed or delayed monthly update means no Telegram message; review the Actions run and manually rerun once data are available.
- GitHub Actions schedule is not an exact-time guarantee. A manual rerun with dry_run=false can post duplicates; check the group before retrying.
- The Telegram button opens the existing interactive dashboard in Telegram's browser; it is **not** an embedded Telegram Mini App or inline widget.
- Do not put tokens, chat IDs or confidential participant records in repository files.
- GitHub Actions cron uses UTC. Reporting month selection uses the prior month in fixed UTC+02:00; because the schedule runs on day 2, daylight-saving transitions do not affect month selection.
- Year rollover requires the existing dashboard JSON source to be extended to the next year and its dashboard loader updated.
