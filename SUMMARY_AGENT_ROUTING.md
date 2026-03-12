# Summary Agent Routing (OpenClaw)

## Goal
Route all AI Insight Hub summary/translation fallback calls to the dedicated `summary` OpenClaw agent, so the `insight` agent focuses on scraping/collection and won't get stuck doing LLM summarization.

## What changed
In `webapp.py`, `_call_openclaw_agent()` now defaults `OPENCLAW_TRANSLATION_AGENT` to `summary` (was `main`).

## Config
- Default: uses `summary` agent
- Override with env var if needed:
  - `OPENCLAW_TRANSLATION_AGENT=main`

## Why
- Prevents `main`/`insight` from being blocked by summarization/translation retries.
- Keeps summarization responsibilities centralized.
