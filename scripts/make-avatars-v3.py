# -*- coding: utf-8 -*-
"""
头像方案 v3。

## v2 的两个问题
1. **白字在深底上会光学膨胀**——即使选了 Light，看起来仍像 Regular。
   对策：用 **ExtraLight**，并把字号缩小 20%，靠留白而不是靠字重取胜。
2. **字太满**——字符几乎贴到边缘，像横幅不像标识。
   对策：字宽控制在圆内切直径的 ~55%。

## 「显得贵」的四个来源（这版全部照做）
  · **留白**：字周围要有大面积空，留白是最廉价的质感
  · **细笔画**：ExtraLight 的白字在深底上仍然纤细
  · **微渐变**：平涂显平，竖向 3% 的渐变有深度但不喧宾夺主
  · **一个克制的强调色**：只用一条/一个点，不用整块橙
"""
import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
FD = r'C:\Windows\Fonts'
SERIF = os.path.join(FD, 'NotoSerifSC-VF.ttf')
SANS = os.path.join(FD, 'NotoSansSC-VF.ttf')
REG = os.path.join(FD, 'msyh.ttc')

G_A = (35, 110, 82)
G_B = (22, 82, 60)
CREAM = (246, 243, 236)
CREAM_2 = (238, 234, 225)
ACCENT = (196, 70, 28)
WHITE = (255, 255, 255)
GREEN_INK = (28, 88, 65)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '头像方案', 'v3')


def fnt(path, size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def vgrad(top, bot):
    img = Image.new('RGB', (SIZE, SIZE), top)
    d = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        d.line([(0, y), (SIZE, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img


def put_centered(d, text, f, fill, cx=SIZE / 2, cy=SIZE / 2):
    b = d.textbbox((0, 0), text, font=f)
    d.text((cx - (b[2] - b[0]) / 2 - b[0], cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)


def size_for(text, path, weight, target_w):
    """给定目标字宽，返回字号（比 fit 更可控）。"""
    probe = fnt(path, 100, weight)
    b = probe.getbbox(text)
    w100 = b[2] - b[0]
    return max(20, int(100 * target_w / w100))


# 目标字宽 = 圆内切直径的 ~55%（留白优先）
def build(bg_top, bg_bot, ink, font_path, weight, target_ratio=0.55, accent=None, accent_style=None):
    img = vgrad(bg_top, bg_bot)
    d = ImageDraw.Draw(img)
    target_w = SIZE * target_ratio
    s = size_for('健', font_path, weight, target_w)
    f = fnt(font_path, s, weight)
    cy = SIZE * (0.47 if accent_style == 'rule' else 0.5)
    put_centered(d, '健', f, ink, cy=cy)

    if accent_style == 'rule':
        w, h = SIZE * 0.115, SIZE * 0.009
        y = SIZE * 0.705
        d.rectangle([SIZE / 2 - w / 2, y, SIZE / 2 + w / 2, y + h], fill=accent)
    elif accent_style == 'dot':
        r = SIZE * 0.020
        cx, cy2 = SIZE * 0.735, SIZE * 0.715
        d.ellipse([cx - r, cy2 - r, cx + r, cy2 + r], fill=accent)
    return img


OPTIONS = [
    # 深底白字（ExtraLight 抵消光学膨胀）
    ('11-绿底白字-宋ExtraLight', lambda: build(G_A, G_B, WHITE, SERIF, 'ExtraLight', 0.55)),
    ('12-绿底白字-宋Light', lambda: build(G_A, G_B, WHITE, SERIF, 'Light', 0.55)),
    ('13-绿底白字-黑ExtraLight', lambda: build(G_A, G_B, WHITE, SANS, 'ExtraLight', 0.55)),
    ('14-绿底白字-宋ExtraLight-橙线', lambda: build(G_A, G_B, WHITE, SERIF, 'ExtraLight', 0.50,
                                                ACCENT, 'rule')),
    ('15-绿底白字-宋ExtraLight-橙点', lambda: build(G_A, G_B, WHITE, SERIF, 'ExtraLight', 0.50,
                                                ACCENT, 'dot')),
    # 浅底深字（纸感，最"编辑"）
    ('16-米白底绿字-宋ExtraLight', lambda: build(CREAM, CREAM_2, GREEN_INK, SERIF, 'ExtraLight', 0.55)),
    ('17-米白底绿字-宋Light-橙线', lambda: build(CREAM, CREAM_2, GREEN_INK, SERIF, 'Light', 0.50,
                                             ACCENT, 'rule')),
    ('18-米白底绿字-黑ExtraLight', lambda: build(CREAM, CREAM_2, GREEN_INK, SANS, 'ExtraLight', 0.55)),
]


def main():
    out = os.path.abspath(OUT)
    os.makedirs(out, exist_ok=True)
    made = []
    for name, fn in OPTIONS:
        img = fn()
        img.save(os.path.join(out, name + '.png'), 'PNG', optimize=True)
        made.append((name, img))
        print('  [OK] %s.png' % name)

    P, S = 40, 6
    w = (P * S + 14) * len(made) + 14
    h = P * S + 64
    sheet = Image.new('RGB', (w, h), (247, 247, 247))
    ds = ImageDraw.Draw(sheet)
    lf = ImageFont.truetype(REG, 19)
    for i, (name, img) in enumerate(made):
        sm = img.resize((P, P), Image.LANCZOS)
        bg = sm.resize((P * S, P * S), Image.NEAREST)
        mask = Image.new('L', (P * S, P * S), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, P * S - 1, P * S - 1], fill=255)
        base = Image.new('RGB', (P * S, P * S), (247, 247, 247))
        x = 14 + i * (P * S + 14)
        sheet.paste(Image.composite(bg, base, mask), (x, 12))
        ds.text((x, P * S + 22), name.split('-')[0], font=lf, fill=(30, 30, 30))
    sheet.save(os.path.join(out, '_对比图-40px.png'), 'PNG', optimize=True)
    print('  [OK] _对比图-40px.png')


if __name__ == '__main__':
    main()
