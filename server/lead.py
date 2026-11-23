"""Lead intake for the landing page.

Runs on 127.0.0.1 behind nginx (TLS, rate limits, basic auth for /admin).
Settings come from the environment (see deploy/env.example).
"""
import csv
import html
import io
import json
import math
import os
import re
import smtplib
import sqlite3
import threading
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB_PATH = os.environ.get("LEAD_DB", "leads.db")
MAX_BODY = 8192
MIN_FILL_MS = 2500  # faster than a person can fill the form
MAX_PER_IP_HOUR = 10
LIMITS = {"name": 80, "contact": 80, "direction": 200, "page": 8}

_lock = threading.Lock()


def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute(
        "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, created TEXT NOT NULL, name TEXT NOT NULL,"
        " contact TEXT NOT NULL, direction TEXT, page TEXT, ip TEXT, consent TEXT)"
    )
    return con


def clean(payload):
    """Return (lead, None) for a real lead, (None, None) for a bot to drop silently, (None, error) if invalid."""
    if not isinstance(payload, dict):
        return None, "bad request"
    if payload.get("website"):
        return None, None
    elapsed = payload.get("elapsed")
    if not isinstance(elapsed, (int, float)) or not math.isfinite(elapsed) or elapsed < MIN_FILL_MS:
        return None, None
    if payload.get("consent") is not True:
        return None, "consent required"
    lead = {}
    for key, limit in LIMITS.items():
        value = payload.get(key, "")
        if not isinstance(value, str):
            return None, f"bad {key}"
        value = " ".join(value.split())  # collapse whitespace and newlines
        if len(value) > limit:
            return None, f"{key} too long"
        lead[key] = value
    if not lead["name"] or len(lead["contact"]) < 3:
        return None, "name and contact required"
    return lead, None


PHONE = re.compile(r"^[+-][\d\s()-]+$")


def csv_cell(value):
    """Stop spreadsheet apps from running cell content as a formula; phone numbers stay as they are."""
    value = "" if value is None else str(value)
    if value[:1] in ("=", "@") or (value[:1] in ("+", "-") and not PHONE.match(value)):
        return "'" + value
    return value


def to_csv(rows):
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens UTF-8 correctly
    w = csv.writer(buf)
    w.writerow(["Дата (UTC)", "Имя", "WeChat / телефон", "Направление", "Язык страницы"])
    for r in rows:
        w.writerow([csv_cell(v) for v in r])
    return buf.getvalue().encode("utf-8")


def admin_page(rows):
    e = html.escape
    body = "".join(
        "<tr>" + "".join(f"<td>{e(str(v or ''))}</td>" for v in r) + "</tr>" for r in rows
    ) or '<tr><td colspan="5">Заявок пока нет</td></tr>'
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Заявки</title><link rel="stylesheet" href="/admin/admin.css"></head><body>
<h1>Заявки ({len(rows)})</h1><p><a href="/admin/leads.csv">Скачать для Excel (CSV)</a></p>
<div class="t"><table><thead><tr><th>Дата (UTC)</th><th>Имя</th><th>WeChat / телефон</th><th>Направление</th><th>Язык</th></tr></thead>
<tbody>{body}</tbody></table></div></body></html>""".encode("utf-8")


ADMIN_CSS = b"""body{font:15px/1.5 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;margin:24px;color:#111827}
h1{font-size:22px}a{color:#0b2a5b}.t{overflow-x:auto}table{border-collapse:collapse;margin-top:16px;min-width:640px}
th,td{border:1px solid #d6dbe4;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eef2f8}"""


def notify(lead, created):
    """Email and Bitrix24 are optional; failures must never lose the stored lead."""
    text = f"Новая заявка с сайта\n\nДата (UTC): {created}\nИмя: {lead['name']}\nWeChat / телефон: {lead['contact']}\nНаправление: {lead['direction'] or '—'}\n"
    host, to = os.environ.get("SMTP_HOST"), os.environ.get("NOTIFY_TO")
    if host and to:
        try:
            msg = EmailMessage()
            msg["Subject"] = "Новая заявка с сайта"
            msg["From"] = os.environ["SMTP_USER"]
            msg["To"] = to
            msg.set_content(text)
            with smtplib.SMTP_SSL(host, int(os.environ.get("SMTP_PORT", "465")), timeout=20) as s:
                s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
                s.send_message(msg)
        except Exception as exc:  # noqa: BLE001
            print("email failed:", exc, flush=True)
    hook = os.environ.get("BITRIX_WEBHOOK_URL")
    if hook:
        try:
            fields = {"TITLE": "Заявка с сайта", "NAME": lead["name"], "COMMENTS": text,
                      "SOURCE_DESCRIPTION": lead["direction"]}
            data = urllib.parse.urlencode({f"fields[{k}]": v for k, v in fields.items()}).encode()
            urllib.request.urlopen(hook.rstrip("/") + "/crm.lead.add.json", data=data, timeout=20).read()
        except Exception as exc:  # noqa: BLE001
            print("bitrix failed:", exc, flush=True)


def save(lead, ip):
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    with _lock, db() as con:
        recent = con.execute(
            "SELECT COUNT(*) FROM leads WHERE ip = ? AND created >= ?",
            (ip, datetime.now(timezone.utc).replace(minute=0).strftime("%Y-%m-%d %H:%M")),
        ).fetchone()[0]
        if recent >= MAX_PER_IP_HOUR:
            return None
        con.execute(
            "INSERT INTO leads (created, name, contact, direction, page, ip, consent) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (created, lead["name"], lead["contact"], lead["direction"], lead["page"], ip, "yes " + created),
        )
    return created


def all_rows():
    with db() as con:
        return con.execute("SELECT created, name, contact, direction, page FROM leads ORDER BY id DESC").fetchall()


class Handler(BaseHTTPRequestHandler):
    server_version = "lead"
    sys_version = ""

    def send(self, code, body=b"", ctype="application/json; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/lead":
            return self.send(404, b'{"ok":false}')
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send(415, b'{"ok":false}')
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send(400, b'{"ok":false}')
        if length <= 0 or length > MAX_BODY:
            return self.send(413, b'{"ok":false}')
        try:
            payload = json.loads(self.rfile.read(length))
            lead, err = clean(payload)
        except Exception:  # noqa: BLE001  bad JSON, NaN, deep nesting
            return self.send(400, b'{"ok":false}')
        if err:
            return self.send(400, json.dumps({"ok": False, "error": err}).encode())
        if lead is None:  # bot: look successful, store nothing
            return self.send(200, b'{"ok":true}')
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        try:
            created = save(lead, ip)
        except Exception as exc:  # noqa: BLE001
            print("save failed:", exc, flush=True)
            return self.send(500, b'{"ok":false}')
        if created is None:
            return self.send(429, b'{"ok":false}')
        threading.Thread(target=notify, args=(lead, created), daemon=True).start()
        self.send(200, b'{"ok":true}')

    def do_GET(self):
        # nginx guards /admin with basic auth; this process only listens on 127.0.0.1
        if self.path == "/admin" or self.path == "/admin/":
            return self.send(200, admin_page(all_rows()), "text/html; charset=utf-8")
        if self.path == "/admin/leads.csv":
            name = "leads-" + datetime.now(timezone.utc).strftime("%Y-%m-%d") + ".csv"
            return self.send(200, to_csv(all_rows()), "text/csv; charset=utf-8",
                             {"Content-Disposition": f'attachment; filename="{name}"'})
        if self.path == "/admin/admin.css":
            return self.send(200, ADMIN_CSS, "text/css; charset=utf-8")
        self.send(404, b'{"ok":false}')

    def log_message(self, fmt, *args):  # no names or contacts in logs
        print(f"{self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    db().close()
    port = int(os.environ.get("PORT", "8081"))
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
