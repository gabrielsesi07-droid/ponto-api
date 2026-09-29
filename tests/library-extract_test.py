"""Self-contained extractor regression tests; no corporate source access."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('extractor', Path(__file__).parents[1] / 'scripts/extract-library.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class ExtractorTests(unittest.TestCase):
    def test_dedup_obsolete_zip_and_exclusions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source'
            source.mkdir()
            (source / 'original.txt').write_text('Acentuação e teste seguro', encoding='utf-8')
            old = source / 'Obsoleto não utilizar'
            old.mkdir()
            (old / 'old.txt').write_bytes((source / 'original.txt').read_bytes())
            (source / '~$lock.docx').write_bytes(b'lock')
            (source / 'software.exe').write_bytes(b'MZnever-run')
            with zipfile.ZipFile(source / 'bundle.zip', 'w') as archive:
                archive.writestr('../outside.txt', 'Texto dentro de ZIP')
                archive.writestr('setup.exe', b'MZnever-run')
            output = root / 'output'
            extractor.run([('manual', str(source))], output)
            manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(len(manifest['documents']), 2)
            repeated = next(d for d in manifest['documents'] if len(d['origins']) == 2)
            self.assertTrue(repeated['obsolete'])
            self.assertIn('Acentuação', repeated['sections'][0]['text'])
            self.assertEqual(len(manifest['skipped']), 3)
            self.assertFalse((root / 'outside.txt').exists())
            self.assertEqual(manifest['errors'], [])
            self.assertEqual(len(list((output / 'originals').iterdir())), 2)

    def test_legacy_original_and_corrupt_document_are_not_lost(self):
        for extension, payload in [('.doc', b'legacy'), ('.pdf', b'not a valid PDF')]:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source = root / 'source'
                source.mkdir()
                (source / ('sample' + extension)).write_bytes(payload)
                output = root / 'output'
                extractor.run([('checklist', str(source))], output)
                manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
                doc = manifest['documents'][0]
                self.assertFalse(doc['sections'])
                self.assertTrue(doc['warnings'])
                self.assertEqual((output / 'originals' / (doc['hash'] + extension)).read_bytes(), payload)


if __name__ == '__main__':
    unittest.main()
