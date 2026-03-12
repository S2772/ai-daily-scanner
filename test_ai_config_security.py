import importlib
import os
import unittest
from unittest.mock import patch


class AIConfigSecurityTest(unittest.TestCase):
    def test_default_config_does_not_ship_with_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            ai_config = importlib.import_module("src.ai_config")
            ai_config = importlib.reload(ai_config)
            config = ai_config.get_ai_api_config(default_model="demo-model")

        self.assertEqual(config["api_key"], "")
        self.assertEqual(config["base_url"], "https://bobdong.cn/v1/chat/completions")
        self.assertEqual(config["model"], "demo-model")

    def test_config_reads_api_settings_from_environment(self):
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "test-key",
                "AI_API_BASE_URL": "https://example.com/v1/chat/completions",
                "AI_API_MODEL": "test-model",
                "AI_API_FALLBACK_MODELS": "alpha,beta",
            },
            clear=True,
        ):
            ai_config = importlib.import_module("src.ai_config")
            ai_config = importlib.reload(ai_config)
            config = ai_config.get_ai_api_config(default_model="demo-model")

        self.assertEqual(config["api_key"], "test-key")
        self.assertEqual(config["base_url"], "https://example.com/v1/chat/completions")
        self.assertEqual(config["model"], "test-model")
        self.assertEqual(config["fallback_models"], ["alpha", "beta"])


if __name__ == "__main__":
    unittest.main()
