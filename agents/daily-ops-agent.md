# Daily Ops Agent

## Purpose
Orchestrate daily pipeline execution for this project:
1. Collect hotspots.
2. Backfill missing Chinese titles and AI summaries.
3. Validate freshness and quality gates.
4. Recompute opportunities.
5. Generate daily report only when gates pass.

## Execution Policy
- Use `$daily-collector-reliability` for collection and failure handling changes.
- Use `$source-adapter` when adding or modifying source parsers.
- Use `$report-quality-gate` for report pass/fail checks.
- Stop and return actionable failure reasons when gates fail.

## Suggested Daily Run
```bash
python3 main.py collect
python3 regen_summaries.py
python3 skills/report-quality-gate/scripts/report_gate_check.py
python3 main.py report
```
