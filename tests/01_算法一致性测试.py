"""用相同表单逐字段对照 JavaScript 和 Python 的完整输出。"""

import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys


sys.dont_write_bytecode = True
TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parent
sys.path.insert(0, str(ROOT / 'python'))

from ct_contrast.engine import evaluate, preview


def compare(actual, expected, path='result'):
    """数值按双精度容差比较，字段、文本与列表次序逐项比较。"""
    if isinstance(actual, dict) and isinstance(expected, dict):
        if actual.keys() != expected.keys():
            yield f'{path} 字段不一致'
        for key in expected.keys() & actual.keys():
            yield from compare(actual[key], expected[key], f'{path}.{key}')
    elif isinstance(actual, list) and isinstance(expected, list):
        if len(actual) != len(expected):
            yield f'{path} 列表长度不一致'
        for index, (lhs, rhs) in enumerate(zip(actual, expected)):
            yield from compare(lhs, rhs, f'{path}[{index}]')
    elif type(actual) in (int, float) and type(expected) in (int, float):
        if not math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-12):
            yield f'{path} 数值不一致，JavaScript={actual!r}，Python={expected!r}'
    elif type(actual) is not type(expected) or actual != expected:
        yield f'{path} 内容不一致，JavaScript={actual!r}，Python={expected!r}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default=os.environ.get('NODE_EXE', 'node'),
                        help='Node.js 可执行文件，也可通过 NODE_EXE 环境变量指定')
    args = parser.parse_args()
    executable = shutil.which(args.node)
    if executable is None:
        print('算法测试需要 Node.js。请安装 Node.js LTS，或用 NODE_EXE 指定已有的可执行文件。')
        return 1

    cases = json.loads((TESTS / 'fixtures' / '01_合成用例.json').read_text(encoding='utf-8'))
    process = subprocess.run(
        [executable, str(TESTS / '02_浏览器算法.cjs')],
        input=json.dumps([case['form'] for case in cases]),
        text=True, encoding='utf-8', capture_output=True,
    )
    if process.returncode:
        print(process.stderr, file=sys.stderr, end='')
        return process.returncode
    results = json.loads(process.stdout)
    if len(results) != len(cases):
        raise ValueError('JavaScript 返回的用例数与输入数不一致')

    counts = Counter(case['group'] for case in cases)
    failures = []
    for case, result in zip(cases, results):
        for name, function in (('evaluate', evaluate), ('preview', preview)):
            expected = function(case['form'])
            issues = list(compare(result[name], expected))
            if issues:
                failures.append(f"{case['name']} / {name} / {issues[0]}")
    for name, count in counts.items():
        print(f'{name} {count} 例')
    total = len(cases) * 2
    print(f'完整评估与实时预览 {total - len(failures)}/{total} 项通过')
    for failure in failures[:20]:
        print(failure)
    return int(bool(failures))


if __name__ == '__main__':
    raise SystemExit(main())
