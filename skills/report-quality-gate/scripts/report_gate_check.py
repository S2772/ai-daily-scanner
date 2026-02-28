#!/usr/bin/env python3
"""Lightweight report gate checker for local runs."""

import sqlite3
import sys


def main() -> int:
    conn = sqlite3.connect("data/ai_hotspots.db")
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM hotspots WHERE date(created_at)=date('now')")
    today_hotspots = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM opportunities WHERE date(created_at)=date('now')")
    today_opportunities = cursor.fetchone()[0]

    conn.close()

    if today_hotspots < 1:
        print("FAIL: no hotspots for today")
        return 1

    if today_opportunities < 1:
        print("FAIL: no opportunities for today")
        return 1

    print("PASS: report gates satisfied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
