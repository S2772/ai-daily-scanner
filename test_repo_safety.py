import os
import tempfile
import unittest

import test_data


class TestDataSafetyTest(unittest.TestCase):
    def test_default_live_db_path_requires_explicit_opt_in(self):
        with self.assertRaisesRegex(RuntimeError, "ALLOW_DESTRUCTIVE_TEST_DATA"):
            test_data.ensure_safe_db_path("data/ai_hotspots.db")

    def test_live_db_path_can_be_enabled_with_env_opt_in(self):
        old = os.environ.get("ALLOW_DESTRUCTIVE_TEST_DATA")
        os.environ["ALLOW_DESTRUCTIVE_TEST_DATA"] = "1"
        try:
            resolved = test_data.ensure_safe_db_path("data/ai_hotspots.db")
            self.assertTrue(resolved.endswith(os.path.join("data", "ai_hotspots.db")))
        finally:
            if old is None:
                os.environ.pop("ALLOW_DESTRUCTIVE_TEST_DATA", None)
            else:
                os.environ["ALLOW_DESTRUCTIVE_TEST_DATA"] = old

    def test_non_default_db_path_is_allowed_without_env_opt_in(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            resolved = test_data.ensure_safe_db_path(tmp.name)
            self.assertEqual(resolved, os.path.abspath(tmp.name))


if __name__ == "__main__":
    unittest.main()
