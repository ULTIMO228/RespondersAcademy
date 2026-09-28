"""Черновой промпт нельзя случайно включить в занятие; файлы проверяются по хэшу."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from ml.prompts.registry import PromptManifestError, load_prompt


class PromptRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        folder = self.root / "backend/ml/prompts"
        folder.mkdir(parents=True)
        (folder / "sample.md").write_text("Инструкция", encoding="utf-8")
        (folder / "sample.schema.json").write_text('{"type":"object"}', encoding="utf-8")
        self.manifest = {
            "schemaVersion": "prompt-manifest/1",
            "status": "draft",
            "approvedBy": None,
            "evalRunId": None,
            "chatTemplateHash": None,
            "reasoningProfileId": None,
            "prompts": {
                "sample": {
                    "version": "sample_v1",
                    "path": "backend/ml/prompts/sample.md",
                    "sha256": hashlib.sha256((folder / "sample.md").read_bytes()).hexdigest(),
                    "outputSchema": "backend/ml/prompts/sample.schema.json",
                    "outputSchemaSha256": hashlib.sha256((folder / "sample.schema.json").read_bytes()).hexdigest(),
                }
            },
        }
        self._save_manifest()

    def _save_manifest(self) -> None:
        (self.root / "backend/ml/prompts/manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_draft_requires_explicit_eval_mode(self) -> None:
        with self.assertRaisesRegex(PromptManifestError, "черновик"):
            load_prompt(self.root, "sample")
        asset = load_prompt(self.root, "sample", allow_draft=True)
        self.assertEqual(asset.version, "sample_v1")
        self.assertEqual(asset.output_schema["type"], "object")

    def test_changed_prompt_is_rejected_even_after_approval(self) -> None:
        self.manifest["status"] = "approved"
        self.manifest["approvedBy"] = "teacher-1"
        self.manifest["evalRunId"] = "eval-1"
        self.manifest["chatTemplateHash"] = "template-hash-1"
        self.manifest["reasoningProfileId"] = "profile-1"
        self._save_manifest()
        (self.root / "backend/ml/prompts/sample.md").write_text("Изменено", encoding="utf-8")
        with self.assertRaisesRegex(PromptManifestError, "хэш"):
            load_prompt(self.root, "sample")

    def test_approval_without_eval_is_rejected(self) -> None:
        self.manifest["status"] = "approved"
        self.manifest["approvedBy"] = "teacher-1"
        self._save_manifest()
        with self.assertRaisesRegex(PromptManifestError, "evalRunId"):
            load_prompt(self.root, "sample")

    def test_path_cannot_escape_repository(self) -> None:
        self.manifest["prompts"]["sample"]["path"] = "../outside.md"
        self._save_manifest()
        with self.assertRaisesRegex(PromptManifestError, "вне корня"):
            load_prompt(self.root, "sample", allow_draft=True)


if __name__ == "__main__":
    unittest.main()
