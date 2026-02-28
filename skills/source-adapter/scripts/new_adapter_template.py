#!/usr/bin/env python3
"""Template for adding a new source adapter."""

from typing import Dict, Any


def normalize_item(raw: Dict[str, Any], source: str) -> Dict[str, Any]:
    return {
        "id": raw.get("id", ""),
        "title": raw.get("title", ""),
        "content": raw.get("content", ""),
        "url": raw.get("url", ""),
        "source": source,
        "category": raw.get("category", "市场机会"),
        "tags": raw.get("tags", "[]"),
    }
