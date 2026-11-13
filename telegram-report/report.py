#!/usr/bin/env python3
"""Monthly EORE Telegram summary from the same JSON as dashboard.html."""
import calendar
import datetime as dt
import io
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "dashboard-2026.json"
OUTPUT = pathlib.Path(__file__).parent / "output"
MONTH_NAMES = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
               "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"]

def fail(message):
    raise SystemExit("REPORT NOT SENT: " + message)

def previous_month():
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=2))).date()
    first = today.replace(day=1)
    return (first - dt.timedelta(days=1)).strftime("%Y-%m")

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    fail("Missing Unicode font")

def main():
    selected = os.environ.get("REPORT_MONTH", "").strip() or previous_month()
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", selected):
        fail("Month must be YYYY-MM")
    year, month = map(int, selected.split("-"))
    if selected >= dt.datetime.now(dt.timezone(dt.timedelta(hours=2))).strftime("%Y-%m"):
        fail("Only completed months can be published")
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1 or data.get("year") != year:
        fail("No matching year in dashboard dataset")
    rows = [row for row in data.get("months", []) if row.get("index") == month]
    if len(rows) != 1:
        fail("Reporting month is not present in dashboard dataset")
    if data.get("coverage", {}).get("through", "") < selected:
        fail("Reporting month is outside declared coverage")
    row = rows[0]
    keys = ("sessions", "beneficiaries", "children", "adults")
    values = {}
    for key in keys:
        v = row.get(key)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or int(v) != v:
            fail("Invalid or missing metric: " + key)
        values[key] = int(v)
    if values["children"] + values["adults"] != values["beneficiaries"]:
        fail("Age totals do not match beneficiaries")
    if values["sessions"] == 0:
        fail("No sessions reported; manual review required")
    if sum(int(loc.get("beneficiaries", 0)) for loc in row.get("locations", [])) != values["beneficiaries"]:
        fail("Location beneficiaries do not reconcile")
    if sum(int(loc.get("sessions", 0)) for loc in row.get("locations", [])) != values["sessions"]:
        fail("Location sessions do not reconcile")

    img = Image.new("RGB", (1200, 900), "#06121d")
    d = ImageDraw.Draw(img)
    cyan, green, muted, white = "#52dff5", "#64e8b5", "#9cb5c8", "#edf8ff"
    d.rounded_rectangle((30, 30, 1170, 870), radius=28, fill="#0a1b2b", outline="#225168", width=2)
    d.text((72, 72), "EORE  /  MONTHLY REPORT", font=font(24, True), fill=cyan)
    d.text((72, 126), f"{MONTH_NAMES[month-1].upper()} {year}", font=font(52, True), fill=white)
    d.text((74, 204), "Харківська область  ·  Інформування про мінну небезпеку", font=font(23), fill=muted)
    cards = [("ПРОВЕДЕНО СЕСІЙ", values["sessions"], cyan),
             ("ОХОПЛЕНО УЧАСНИКІВ", values["beneficiaries"], green),
             ("ДО 18 РОКІВ", values["children"], "#ffcd73"),
             ("18+ РОКІВ", values["adults"], "#baa9ff")]
    for i, (label, value, color) in enumerate(cards):
        x = 72 + (i % 2) * 530
        y = 276 + (i // 2) * 177
        d.rounded_rectangle((x, y, x+495, y+151), radius=17, fill="#102b3b", outline="#285169", width=2)
        d.text((x+24, y+20), label, font=font(19, True), fill=muted)
        d.text((x+24, y+58), f"{value:,}".replace(",", " "), font=font(57, True), fill=color)
    d.text((74, 671), "ВІКОВИЙ РОЗПОДІЛ", font=font(21, True), fill=white)
    total = values["beneficiaries"]
    share = values["children"] / total if total else 0
    d.rounded_rectangle((74, 723, 1124, 750), radius=12, fill="#baa9ff")
    if share > 0:
        d.rounded_rectangle((74, 723, max(98, 74 + int(1050*share)), 750), radius=12, fill="#ffcd73")
    d.text((74, 774), f"До 18 років: {share*100:.1f}%".replace(".", ","), font=font(20), fill="#ffcd73")
    d.text((680, 774), f"18+: {(1-share)*100:.1f}%".replace(".", ","), font=font(20), fill="#baa9ff")
    d.text((74, 830), "Джерело: EORE Analytics · агрегована статистика RASB", font=font(16), fill=muted)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    out = OUTPUT / f"eore-{selected}.png"
    img.save(out, optimize=True)
    print("Validated", selected, values, "preview:", out)
    if os.environ.get("DRY_RUN", "").lower() in ("true", "1", "yes"):
        print("DRY RUN: Telegram send skipped")
        return
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        fail("Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as GitHub Actions secrets")
    url = f"https://deafinicio.github.io/mine-risk-map/dashboard.html?period=m{month}"
    caption = (f"📊 EORE · {MONTH_NAMES[month-1]} {year}\n"
               f"Сесій: {values['sessions']} · Учасників: {values['beneficiaries']}\n"
               f"До 18 років: {values['children']} · 18+: {values['adults']}\n"
               "Джерело: EORE Analytics")
    boundary = "----eoremonthlyreportboundary"
    fields = {
        "chat_id": chat_id, "caption": caption,
        "reply_markup": json.dumps({"inline_keyboard": [[{"text": "📈 Відкрити інтерактивний дашборд", "url": url}]]}, ensure_ascii=False)
    }
    body = bytearray()
    for key, val in fields.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{val}\r\n".encode())
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"{out.name}\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.extend(out.read_bytes())
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendPhoto",
                                 data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    with urllib.request.urlopen(req, timeout=35) as response:
        result = json.load(response)
    if not result.get("ok"):
        fail("Telegram API did not confirm delivery")
    print("Telegram accepted report for", selected)

if __name__ == "__main__":
    main()
