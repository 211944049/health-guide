# -*- coding: utf-8 -*-
"""
头像方案 v2：针对「纯色块+粗黑字显得廉价」的反馈重做。

## v1 为什么显得 low
  · 粗黑体（msyhbd）在视觉上像"临时占位"
  · 纯色底 + 满格字，没有任何细节层次
  · 大字块 + 无留白 = 横幅，不是标识

## v2 的做法
  · 换**宋体（NotoSerifSC Light）**或**等线 Light** —— 细笔画自带质感
  · 收小字号、加大留白 —— 留白是"贵"的来源
  · 加**极细的橙色强调线**（封面母题）—— 让头像和封面属于同一套视觉
  · 底色用**极轻的渐变**（不是平涂）—— 屏幕上有微妙的深度
  · 所有方案都过 40px 可辨性验证

用法：python scripts/make-avatars-v2.py
输出：handoff/头像方案/v2/*.png + 对比图
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
FONT_DIR = r'C:\Windows\Fonts'
SERIF = os.path.join(FONT_DIR, 'NotoSerifSC-VF.ttf')
DENG_L = os.path.join(FONT_DIR, 'Dengl.ttf')
REG = os.path.join(FONT_DIR, 'msyh.ttc')

GREEN = (26, 92, 68)
GREEN_2 = (35, 110, 82)
CREAM = (247, 244, 238)
ACCENT = (200, 71, 28)
INK = (24, 24, 24)
WHITE = (255, 255, 255)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '头像方案', 'v2')

SAFE_R = SIZE / 2 * 0.70


def font(path, size, weight_name=None):
    f = ImageFont.truetype(path, size)
    if weight_name:
        try:
            f.set_variation_by_name(weight_name)
        except Exception:
            try:
                f.set_variation_by_axes([100])  # 100 = Thin/Light 端
            except Exception:
                pass
    return f


def vgrad(top, bottom):
    """竖向极轻渐变。平涂显得平，微渐变有深度。"""
    img = Image.new('RGB', (SIZE, SIZE), top)
    d = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (SIZE, y)], fill=c)
    return img


def fit(draw, text, path, max_w, max_h, weight_name=None):
    lo, hi = 20, int(max_h)
    best = font(path, lo, weight_name)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = font(path, mid, weight_name)
        b = draw.textbbox((0, 0), text, font=f)
        if (b[2] - b[0]) <= max_w and (b[3] - b[1]) <= max_h:
            best = f
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def put(draw, text, f, fill, cx=SIZE / 2, cy=SIZE / 2):
    b = draw.textbbox((0, 0), text, font=f)
    draw.text((cx - (b[2] - b[0]) / 2 - b[0], cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)


def rule(draw, cx, y, w, h, fill):
    """细线/细条。"""
    draw.rectangle([cx - w / 2, y, cx + w / 2, y + h], fill=fill)


# ---------------- 方案 ----------------

def o1():
    """深绿渐变 + 宋体「健」（留白优先）"""
    img = vgrad(GREEN_2, GREEN)
    d = ImageDraw.Draw(img)
    f = fit(d, '健', SERIF, SAFE_R * 1.45, SAFE_R * 1.55, 'Light')
    put(d, '健', f, WHITE)
    return img


def o2():
    """深绿渐变 + 宋体「健」 + 下方橙色细线（封面母题）"""
    img = vgrad(GREEN_2, GREEN)
    d = ImageDraw.Draw(img)
    f = fit(d, '健', SERIF, SAFE_R * 1.25, SAFE_R * 1.35, 'Light')
    put(d, '健', f, WHITE, cy=SIZE * 0.455)
    rule(d, SIZE / 2, SIZE * 0.735, SIZE * 0.20, SIZE * 0.012, ACCENT)
    return img


def o3():
    """米白底 + 深绿宋体「健」 + 右侧橙色短竖条"""
    img = Image.new('RGB', (SIZE, SIZE), CREAM)
    d = ImageDraw.Draw(img)
    f = fit(d, '健', SERIF, SAFE_R * 1.30, SAFE_R * 1.40, 'Light')
    put(d, '健', f, GREEN, cx=SIZE * 0.47)
    d.rectangle([SIZE * 0.775, SIZE * 0.36, SIZE * 0.775 + SIZE * 0.022, SIZE * 0.64], fill=ACCENT)
    return img


def o4():
    """封面母题抽象：米白底 + 绿色粗横线 + 橙色细竖条（无字）"""
    img = Image.new('RGB', (SIZE, SIZE), CREAM)
    d = ImageDraw.Draw(img)
    # 绿色横线（封面顶部那道）
    d.rectangle([SIZE * 0.26, SIZE * 0.34, SIZE * 0.62, SIZE * 0.34 + SIZE * 0.045], fill=GREEN)
    # 橙色竖条（封面答案左侧那道）
    d.rectangle([SIZE * 0.26, SIZE * 0.46, SIZE * 0.26 + SIZE * 0.028, SIZE * 0.68], fill=ACCENT)
    # 两条短灰线暗示"文字行"
    for i, y in enumerate((0.47, 0.555, 0.64)):
        w = 0.30 if i < 2 else 0.20
        d.rectangle([SIZE * 0.325, SIZE * y, SIZE * (0.325 + w), SIZE * (y + 0.028)], fill=(180, 176, 168))
    return img


def o5():
    """深绿渐变 + 等线 Light「健」"""
    img = vgrad(GREEN_2, GREEN)
    d = ImageDraw.Draw(img)
    f = fit(d, '健', DENG_L, SAFE_R * 1.45, SAFE_R * 1.55)
    put(d, '健', f, WHITE)
    return img


def o6():
    """深绿底 + 细白圆环 + 宋体「健」（编辑感）"""
    img = vgrad(GREEN_2, GREEN)
    d = ImageDraw.Draw(img)
    pad = SIZE * 0.145
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], outline=(255, 255, 255, 90), width=max(2, int(SIZE * 0.008)))
    f = fit(d, '健', SERIF, SAFE_R * 1.05, SAFE_R * 1.15, 'Light')
    put(d, '健', f, WHITE)
    return img


def o7():
    """深绿渐变 + 宋体「健」+ 右下橙色圆点（更轻的强调）"""
    img = vgrad(GREEN_2, GREEN)
    d = ImageDraw.Draw(img)
    f = fit(d, '健', SERIF, SAFE_R * 1.35, SAFE_R * 1.45, 'Light')
    put(d, '健', f, WHITE, cx=SIZE * 0.475)
    r = SIZE * 0.030
    cx, cy = SIZE * 0.755, SIZE * 0.735
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    return img


OPTIONS = [
    ('01-宋体细-纯', o1),
    ('02-宋体细-橙线', o2),
    ('03-米白宋体-橙条', o3),
    ('04-母题-无字', o4),
    ('05-等线Light', o5),
    ('06-细圆环', o6),
    ('07-宋体细-橙点', o7),
]


def main():
    out = os.path.abspath(OUT)
    os.makedirs(out, exist_ok=True)

    made = []
    for name, build in OPTIONS:
        img = build()
        img.save(os.path.join(out, name + '.png'), 'PNG', optimize=True)
        made.append((name, img))
        print('  [OK] %s.png' % name)

    PREVIEW, SCALE = 40, 6
    w = (PREVIEW * SCALE + 16) * len(made) + 16
    h = PREVIEW * SCALE + 70
    sheet = Image.new('RGB', (w, h), (246, 246, 246))
    ds = ImageDraw.Draw(sheet)
    lf = ImageFont.truetype(REG, 20)

    for i, (name, img) in enumerate(made):
        small = img.resize((PREVIEW, PREVIEW), Image.LANCZOS)
        big = small.resize((PREVIEW * SCALE, PREVIEW * SCALE), Image.NEAREST)
        mask = Image.new('L', (PREVIEW * SCALE, PREVIEW * SCALE), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, PREVIEW * SCALE - 1, PREVIEW * SCALE - 1], fill=255)
        cover = Image.new('RGB', (PREVIEW * SCALE, PREVIEW * SCALE), (246, 246, 246))
        x = 16 + i * (PREVIEW * SCALE + 16)
        sheet.paste(Image.composite(big, cover, mask), (x, 14))
        ds.text((x, PREVIEW * SCALE + 26), name.split('-')[0], font=lf, fill=INK)

    sheet.save(os.path.join(out, '_对比图-40px.png'), 'PNG', optimize=True)
    print('  [OK] _对比图-40px.png')
    print('\n  看对比图选，不要看 1024px 原图。')


if __name__ == '__main__':
    main()
