#!/usr/bin/env python3
"""Прописывает srcset/sizes во все <picture> галереи в index.html.

Запускать после tools/make-images.py:

    python tools/write-srcset.py

Скрипт идемпотентный: повторный запуск пересобирает тот же самый srcset.
Ширину колонки под картинку задаёт таблица SIZES ниже — если меняешь
раскладку главы, поправь и её, иначе браузер будет выбирать файл не того
размера.
"""
import io
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIANTS = (640, 1080)

# сначала телефон, потом десктоп; порядок строк важен —
# 'card' совпадает и с 'fan__card', поэтому стоит последним
SIZES = [
    ('fan__card',   '(max-width: 900px) 48vw, 24vw'),
    ('slide__card', '(max-width: 900px) 82vw, 40vw'),
    ('combo__item', '(max-width: 900px) 46vw, 32vw'),
    ('card',        '(max-width: 900px) 92vw, 46vw'),
]

BLOCK = re.compile(
    r'<figure class="(?P<cls>[^"]*)"><picture>'
    r'<source type="image/avif"[^>]*>'
    r'<source type="image/webp"[^>]*>'
    r'<img (?P<attrs>[^>]*)>'
    r'</picture></figure>'
)


def sizes_for(cls):
    for key, val in SIZES:
        if key in cls:
            return val
    return None


def srcset(base, ext, ow):
    out = ['%s-%d.%s %dw' % (base, w, ext, w)
           for w in VARIANTS if os.path.exists('%s-%d.%s' % (base, w, ext))]
    out.append('%s.%s %dw' % (base, ext, ow))
    return ', '.join(out)


def main():
    os.chdir(ROOT)
    html = io.open('index.html', encoding='utf-8').read()
    stats = {'done': 0, 'skip': 0}

    def fix(m):
        cls, attrs = m.group('cls'), m.group('attrs')
        sz = sizes_for(cls)
        src = re.search(r'src="([^"]+?)\.jpg"', attrs)
        if not sz or not src:
            stats['skip'] += 1
            return m.group(0)
        base = src.group(1)
        ow, oh = Image.open(base + '.jpg').size
        rest = re.sub(r'\s*(?:src|sizes|srcset)="[^"]*"', '', attrs).strip()
        # без width/height браузер дёргает вёрстку, когда картинка догрузится
        if 'width=' not in rest:
            rest = 'width="%d" height="%d" %s' % (ow, oh, rest)
        stats['done'] += 1
        return (
            '<figure class="%s"><picture>'
            '<source type="image/avif" srcset="%s" sizes="%s">'
            '<source type="image/webp" srcset="%s" sizes="%s">'
            '<img src="%s.jpg" srcset="%s" sizes="%s" %s>'
            '</picture></figure>'
            % (cls, srcset(base, 'avif', ow), sz,
               srcset(base, 'webp', ow), sz,
               base, srcset(base, 'jpg', ow), sz, rest)
        )

    out = BLOCK.sub(fix, html)
    io.open('index.html', 'w', encoding='utf-8', newline='\n').write(out)
    print(stats)


if __name__ == '__main__':
    main()
