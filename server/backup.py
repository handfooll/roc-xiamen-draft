"""Nightly copy of the leads database, keeps the last 14 days. Run by rea-backup.timer."""
import os
import sqlite3
import time
from pathlib import Path

DB = os.environ.get("LEAD_DB", "leads.db")
DIR = Path(DB).parent / "backups"
KEEP = 14


def run():
    DIR.mkdir(mode=0o700, exist_ok=True)
    target = DIR / time.strftime("leads-%Y-%m-%d.db")
    src, dst = sqlite3.connect(DB), sqlite3.connect(target)
    with dst:
        src.backup(dst)  # consistent copy even while the service writes
    src.close()
    dst.close()
    for old in sorted(DIR.glob("leads-*.db"))[:-KEEP]:
        old.unlink()
    return target


if __name__ == "__main__":
    print("backup:", run())
