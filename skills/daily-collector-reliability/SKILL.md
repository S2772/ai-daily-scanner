---
name: daily-collector-reliability
description: Improve ingestion reliability, data freshness, and failure visibility for the AI daily scanner. Use when collection returns empty data, quality is unstable, retries/error handling are missing, or daily opportunity output is inconsistent with collected hotspots.
---

# Daily Collector Reliability

## Overview
Stabilize daily collection by enforcing clear success criteria, explicit failure paths, and deterministic freshness rules.

## Workflow
1. Validate source reachability before parse loops.
2. Capture per-source metrics: fetched, parsed, saved, failed.
3. Fail fast when all sources fail and return non-success status.
4. Enforce freshness rules: today data drives today report/opportunity output.
5. Keep cleanup deterministic: remove stale auto-generated analytics before recompute.
6. Add regression checks for empty collection and partial-source failure.

## Use This Skill Output
- Prefer small patches to `src/scraper.py` and `src/cli.py`.
- Keep human-readable warnings and machine-readable counters in the same run.
- Reference [reliability-checklist.md](references/reliability-checklist.md) before changing collection behavior.
- Use [scripts/verify_collection_health.sh](scripts/verify_collection_health.sh) for quick post-change validation.
