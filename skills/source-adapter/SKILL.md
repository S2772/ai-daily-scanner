---
name: source-adapter
description: Build or maintain source-specific adapters for RSS, HTML, or API sources in this project. Use when adding a new source, normalizing fields, handling parser edge cases, or improving dedupe for incoming hotspots.
---

# Source Adapter

## Overview
Implement source ingestion adapters that normalize raw feed data into the hotspot schema with predictable quality.

## Workflow
1. Define source contract: URL, auth, expected fields, limits, timeout.
2. Parse and normalize into `{id,title,content,url,source,category,tags}`.
3. Apply deterministic ID and duplicate strategy.
4. Add source-specific error handling without breaking the whole run.
5. Validate with sample outputs and a smoke command.

## References and Scripts
- Check [adapter-patterns.md](references/adapter-patterns.md) before adding new parser logic.
- Reuse [scripts/new_adapter_template.py](scripts/new_adapter_template.py) for new adapters.
