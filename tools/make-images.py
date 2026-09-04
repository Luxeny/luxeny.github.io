#!/usr/bin/env python3
"""Готовит уменьшенные варианты картинок галереи.

Для каждой картинки, на которую ссылается index.html, кладёт рядом копии
шириной 640 и 1080 px в трёх форматах (avif/webp/jpg). Оригинал остаётся
самым крупным кандидатом в srcset — его трогать не нужно.

    python tools/make-images.py

Уже существующие файлы не перезаписываются, так что запускать можно
сколько угодно раз: после добавления новых кадров сделаются только они.
Разметку <picture> после этого правит tools/write-srcset.py.

Нужен Pillow с поддержкой AVIF (Pillow 11.3+):

    pip install --upgrade pillow
"""
import io
import os
import re
import sys

from PIL import Image

WIDTHS = (640, 1080)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    os.chdir(ROOT)
    html = io.open('index.html', encoding='utf-8').read()
    bases = sorted(set(re.findall(r'srcset="(assets/work/[^" ]+?)(?:-\d+)?\.avif', html)))
    print('картинок в разметке:', len(bases))

    made = 0
    for base in bases:
        src = base + '.jpg'
        if not os.path.exists(src):
            print('нет исходника:', src)
            continue
        im = Image.open(src)
        ow, oh = im.size
        im = im.convert('RGB')
        for w in WIDTHS:
            # исходник и так почти такой же — отдельный файл не нужен
            if ow < w * 1.15:
                continue
            small = im.resize((w, round(oh * w / ow)), Image.LANCZOS)
            out = '%s-%d' % (base, w)
            if not os.path.exists(out + '.jpg'):
                small.save(out + '.jpg', quality=78, optimize=True, progressive=True)
                made += 1
            if not os.path.exists(out + '.webp'):
                small.save(out + '.webp', quality=74, method=5)
                made += 1
            if not os.path.exists(out + '.avif'):
                small.save(out + '.avif', quality=58, speed=6)
                made += 1
        sys.stdout.write('.')
        sys.stdout.flush()
    print()
    print('создано файлов:', made)


if __name__ == '__main__':
    main()
