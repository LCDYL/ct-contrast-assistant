"""在 IDE 中运行，对照浏览器算法和 Python 实现。"""

from pathlib import Path
import runpy
import sys


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    test = Path(__file__).resolve().parent / 'tests' / '01_算法一致性测试.py'
    runpy.run_path(str(test), run_name='__main__')
