from __future__ import annotations

import os
from typing import Dict, List


def _split_models(raw: str) -> List[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def get_ai_api_config(default_model: str, default_fallback_models: str = "") -> Dict[str, object]:
    return {
        "base_url": os.getenv("AI_API_BASE_URL", "https://bobdong.cn/v1/chat/completions").strip(),
        "api_key": os.getenv("AI_API_KEY", "").strip(),
        "model": os.getenv("AI_API_MODEL", default_model).strip(),
        "fallback_models": _split_models(os.getenv("AI_API_FALLBACK_MODELS", default_fallback_models)),
    }
