---
name: report-quality-gate
description: Enforce data quality gates before generating daily reports. Use when reports should be blocked for weak data quality, missing freshness, insufficient hotspot volume, or stale opportunities.
---

# Report Quality Gate

## Overview
Define and enforce clear pass/fail gates before report export to prevent low-quality daily output.

## Gate Rules
1. Require minimum hotspot count for today.
2. Require at least one source success.
3. Require all report rows to include title, category, score, and URL.
4. Reject report when opportunity rows are stale or empty while hotspots exist.
5. Emit a clear fail reason and non-zero exit status.

## Implementation Notes
- Keep gate checks separate from formatting logic.
- Add a dry-run mode for CI checks.
- Reference [quality-thresholds.md](references/quality-thresholds.md).
- Use [scripts/report_gate_check.py](scripts/report_gate_check.py) as baseline.
