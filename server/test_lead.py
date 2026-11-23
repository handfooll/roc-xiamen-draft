import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import lead  # noqa: E402

GOOD = {"name": "Ли Мин", "contact": "wx_limin", "direction": "Курсы русского языка", "consent": True,
        "website": "", "elapsed": 9000, "page": "ru"}


class Clean(unittest.TestCase):
    def test_good(self):
        out, err = lead.clean(dict(GOOD))
        self.assertIsNone(err)
        self.assertEqual(out["name"], "Ли Мин")

    def test_bots_dropped_silently(self):
        self.assertEqual(lead.clean({**GOOD, "website": "http://spam"}), (None, None))
        self.assertEqual(lead.clean({**GOOD, "elapsed": 300}), (None, None))
        self.assertEqual(lead.clean({**GOOD, "elapsed": "9000"}), (None, None))

    def test_invalid(self):
        self.assertEqual(lead.clean({**GOOD, "consent": False})[1], "consent required")
        self.assertIsNotNone(lead.clean({**GOOD, "name": "   "})[1])
        self.assertIsNotNone(lead.clean({**GOOD, "contact": "x"})[1])
        self.assertIsNotNone(lead.clean({**GOOD, "name": "a" * 81})[1])
        self.assertIsNotNone(lead.clean({**GOOD, "name": ["x"]})[1])
        self.assertIsNotNone(lead.clean([1, 2])[1])

    def test_whitespace_collapsed(self):
        out, _ = lead.clean({**GOOD, "name": " Ли\n\r Мин "})
        self.assertEqual(out["name"], "Ли Мин")


class Output(unittest.TestCase):
    def test_csv_formula_escaped(self):
        for bad in ("=HYPERLINK(1)", "+1", "-1", "@x"):
            self.assertEqual(lead.csv_cell(bad), "'" + bad)
        self.assertEqual(lead.csv_cell("wx_1"), "wx_1")
        data = lead.to_csv([("2026-11-23 10:00", "=cmd", "+86 1", "x", "ru")]).decode("utf-8")
        self.assertTrue(data.startswith("﻿"))
        self.assertIn("'=cmd", data)

    def test_admin_escapes_html(self):
        page = lead.admin_page([("d", "<script>alert(1)</script>", "c", None, "ru")]).decode()
        self.assertNotIn("<script>alert", page)
        self.assertIn("&lt;script&gt;", page)


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        lead.DB_PATH = os.path.join(cls.tmp.name, "t.db")
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), lead.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.tmp.cleanup()

    def post(self, body, ctype="application/json", ip="1.1.1.1"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        req = urllib.request.Request(self.base + "/api/lead", data=data,
                                     headers={"Content-Type": ctype, "X-Real-IP": ip})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status
        except urllib.error.HTTPError as e:
            e.close()
            return e.code

    def test_flow(self):
        self.assertEqual(self.post(GOOD, ip="2.2.2.2"), 200)
        self.assertEqual(self.post({**GOOD, "website": "x"}, ip="2.2.2.2"), 200)  # bot, not stored
        rows = lead.all_rows()
        self.assertEqual(sum(1 for r in rows if r[2] == "wx_limin"), 1)
        with urllib.request.urlopen(self.base + "/admin/leads.csv") as r:
            self.assertIn("wx_limin", r.read().decode("utf-8"))

    def test_rejects(self):
        self.assertEqual(self.post(GOOD, ctype="text/plain"), 415)
        self.assertEqual(self.post(b"{not json"), 400)
        self.assertEqual(self.post(b"x" * (lead.MAX_BODY + 1)), 413)
        self.assertEqual(self.post({**GOOD, "consent": False}), 400)

    def test_rate_limit(self):
        codes = [self.post({**GOOD, "contact": f"wx_{i}"}, ip="9.9.9.9") for i in range(lead.MAX_PER_IP_HOUR + 1)]
        self.assertEqual(codes[:-1], [200] * lead.MAX_PER_IP_HOUR)
        self.assertEqual(codes[-1], 429)


if __name__ == "__main__":
    unittest.main()
