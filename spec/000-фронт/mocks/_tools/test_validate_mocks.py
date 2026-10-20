#!/usr/bin/env python3
# Тесты валидатора моков (спека 009, T008): channel / smsText / repeatOf / lockedBy.
# Каждый случай копирует mocks/ во временную папку, правит одно поле и запускает validate_mocks.py из копии.
# Запуск из корня репо: python3 -m unittest discover -s spec/000-фронт/mocks/_tools -p 'test_*.py'
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
MOCKS = TOOLS.parent
VALIDATOR = TOOLS / 'validate_mocks.py'
ENV = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'}

LOCKED = {'operator': 7, 'name': 'Гусев А.В.', 'arm': 9}


class ValidatorCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name) / 'mocks'
        shutil.copytree(MOCKS, self.root, ignore=shutil.ignore_patterns('__pycache__'))

    def edit(self, rel, fn):
        path = self.root / rel
        data = json.loads(path.read_text(encoding='utf-8'))
        fn(data)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def card(self, data, cid):
        return next(c for c in data['cards'] if c['id'] == cid)

    def set_ticket(self, cid, **fields):
        self.edit('cards.json', lambda d: self.card(d, cid).update(fields))

    def run_validator(self):
        result = subprocess.run([sys.executable, str(self.root / '_tools' / 'validate_mocks.py')],
                                capture_output=True, text=True, encoding='utf-8', env=ENV)
        return result.returncode, result.stdout + result.stderr


class RealMocksTest(unittest.TestCase):
    def test_реальные_моки_проходят(self):
        result = subprocess.run([sys.executable, str(VALIDATOR)], capture_output=True, text=True, encoding='utf-8', env=ENV)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('PASS', result.stdout)


class ChannelTest(ValidatorCase):
    def test_channel_вне_call_и_sms_отклоняется(self):
        self.set_ticket('c-001', channel='email')
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('channel', out)

    def test_sms_без_smsText_отклоняется(self):
        # smsText удаляется явно: в реальных данных у c-066 он уже есть, тест не должен зависеть от них
        self.set_ticket('c-066', channel='sms')
        self.edit('cards.json', lambda d: self.card(d, 'c-066').pop('smsText', None))
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('smsText', out)

    def test_sms_с_пустым_smsText_отклоняется(self):
        self.set_ticket('c-066', channel='sms', smsText='   ')
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('smsText', out)

    def test_sms_с_непустым_smsText_проходит(self):
        self.set_ticket('c-066', channel='sms', smsText='Срочно приезжайте.')
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)

    def test_smsText_при_call_даёт_предупреждение_а_не_ошибку(self):
        self.set_ticket('c-001', smsText='лишний текст')
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)
        self.assertIn('smsText', out)


class RepeatOfTest(ValidatorCase):
    def test_repeatOf_null_проходит(self):
        self.set_ticket('c-001', repeatOf=None)
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)

    def test_repeatOf_на_фон_журнала_проходит(self):
        self.set_ticket('c-001', repeatOf='card-881412')
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)

    def test_repeatOf_на_несуществующую_карточку_отклоняется(self):
        self.set_ticket('c-001', repeatOf='card-000000')
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('repeatOf', out)

    def test_repeatOf_на_билет_отклоняется(self):
        # repeatOf указывает на фон журнала (fixtures/arm-cards.json), а не на билет (cards.json)
        self.set_ticket('c-001', repeatOf='c-002')
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('repeatOf', out)

    def test_repeatOf_не_строка_не_падает_а_отклоняется(self):
        self.set_ticket('c-001', repeatOf=['card-881412'])
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('repeatOf', out)
        self.assertNotIn('Traceback', out)


class LockedByTest(ValidatorCase):
    def test_lockedBy_на_билете_отклоняется(self):
        self.set_ticket('c-001', lockedBy=LOCKED)
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('lockedBy', out)

    def test_lockedBy_на_фоне_проходит(self):
        self.edit('fixtures/arm-cards.json', lambda d: next(c for c in d['cards'] if c['id'] == 'card-881412').update(lockedBy=LOCKED))
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)

    def test_lockedBy_с_operator_строкой_отклоняется(self):
        bad = {**LOCKED, 'operator': '7'}
        self.edit('fixtures/arm-cards.json', lambda d: next(c for c in d['cards'] if c['id'] == 'card-881412').update(lockedBy=bad))
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('lockedBy', out)

    def test_lockedBy_с_arm_bool_отклоняется(self):
        bad = {**LOCKED, 'arm': True}
        self.edit('fixtures/arm-cards.json', lambda d: next(c for c in d['cards'] if c['id'] == 'card-881412').update(lockedBy=bad))
        code, out = self.run_validator()
        self.assertEqual(code, 1, out)
        self.assertIn('lockedBy', out)

    def test_lockedBy_без_name_и_с_лишним_ключом_отклоняется(self):
        for bad in ({'operator': 7, 'arm': 9}, {**LOCKED, 'extra': 1}):
            with self.subTest(bad=bad):
                self.setUp()
                self.edit('fixtures/arm-cards.json', lambda d, b=bad: next(c for c in d['cards'] if c['id'] == 'card-881412').update(lockedBy=b))
                code, out = self.run_validator()
                self.assertEqual(code, 1, out)
                self.assertIn('lockedBy', out)


if __name__ == '__main__':
    unittest.main()
