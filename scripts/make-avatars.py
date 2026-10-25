# -*- coding: utf-8 -*-
"""
生成小红书头像方案，并**在 40px 下验证可辨性**。

## 为什么这样设计

小红书头像在信息流里只有约 30–40px。这个尺寸下：
  · 插画/照片的细节全部丢失，只剩一团颜色
  · 三个字以上的文字会糊成一条灰带
  · 低对比度（浅底浅字）会整体消失

所以头像的正确做法是 **纯色底 + 一个字（最多两个字）+ 高对比**。

## 三个硬约束
1. **40px 可辨**：脚本会把每个方案渲染成 40px 并放大回来看（nearest 采样），
   模拟真实显示效果 —— 这是唯一可信的验证方式。
2. **圆形安全区**：小红书裁圆形，四角被切。文字必须落在内切圆内（半径 × 0.72）。
3. **和封面同色系**：站点绿 #1F7A5A / 暖白 #FAF8F4 / 橙红 #C8471C。

用法：python scripts/make-avatars.py
输出：handoff/头像方案/*.png  +  一张对比图
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024          # 最终头像尺寸（小红书会自己缩）
FONT_DIR = r'C:\Windows\Fonts'
BOLD = os.path.join(FONT_DIR, 'msyhbd.ttc')
REG = os.path.join(FONT_DIR, 'msyh.ttc')

GREEN = (31, 122, 90)
CREAM = (250, 248, 244)
ACCENT = (200, 71, 28)
INK = (26, 26, 26)
WHITE = (255, 255, 255)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '头像方案')

# 文字安全区：内切圆半径的 0.72（再留一点余量）
SAFE_R = SIZE / 2 * 0.72


def load(path, size):
    if not os.path.exists(path):
        sys.exit('[X] 找不到字体：%s' % path)
    return ImageFont.truetype(path, size)


def fit_font(draw, text, path, max_w, max_h):
    """从大到小试字号，直到文字能放进 max_w × max_h。"""
    lo, hi = 20, int(max_h)
    best = load(path, lo)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = load(path, mid)
        bbox = draw.textbbox((0, 0), text, font=f)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if w <= max_w and h <= max_h:
            best = f
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def centered(draw, text, font, fill, cx=SIZE / 2, cy=SIZE / 2):
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - w / 2 - bbox[0], cy - h / 2 - bbox[1]), text, font=font, fill=fill)


def make_solid(bg, fg, text, font_path=BOLD, ring=None):
    """纯色底 + 居中大字。"""
    img = Image.new('RGB', (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)
    if ring:
        # 内圈描边：让浅底方案在白色信息流背景上也有边界
        pad = SIZE * 0.06
        d.ellipse([pad, pad, SIZE - pad, SIZE - pad], outline=ring, width=int(SIZE * 0.045))
    limit = (SAFE_R * 2) * (0.92 if len(text) > 1 else 1.0)
    f = fit_font(d, text, font_path, limit, SAFE_R * 2)
    centered(d, text, f, fg)
    return img


def make_mark(bg, fg, text, font_path=BOLD):
    """
    标记式：底部一条色带 + 字。
    比纯色块多一点"设计感"，但小尺寸下仍是一个明确色块。
    """
    img = Image.new('RGB', (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)
    # 底部弧带
    d.pieslice([-SIZE * 0.3, SIZE * 0.62, SIZE * 1.3, SIZE * 1.9], 0, 180, fill=fg)
    f = fit_font(d, text, font_path, SAFE_R * 1.7, SAFE_R * 1.5)
    centered(d, text, f, bg if False else (255, 255, 255), cy=SIZE * 0.44)
    return img


OPTIONS = [
    ('A-深绿底白字-健', lambda: make_solid(GREEN, WHITE, '健')),
    ('B-暖白底绿字-健', lambda: make_solid(CREAM, GREEN, '健', ring=GREEN)),
    ('C-橙红底白字-健', lambda: make_solid(ACCENT, WHITE, '健')),
    ('D-深绿底白字-健康', lambda: make_solid(GREEN, WHITE, '健康')),
    ('E-深绿底白字-牌', lambda: make_solid(GREEN, WHITE, '营')),
]


def main():
    out = os.path.abspath(OUT)
    os.makedirs(out, exist_ok=True)

    made = []
    for name, build in OPTIONS:
        img = build()
        p = os.path.join(out, name + '.png')
        img.save(p, 'PNG', optimize=True)
        made.append((name, img))
        print('  [OK] %s.png' % name)

    # ---- 可辨性验证：缩到 40px 再放大回来，模拟信息流里的真实观感 ----
    PREVIEW = 40
    scaled = 6
    sheet_w = PREVIEW * scaled * len(made) + 20 * (len(made) + 1)
    sheet_h = PREVIEW * scaled + 90
    sheet = Image.new('RGB', (sheet_w, sheet_h), (245, 245, 245))
    ds = ImageDraw.Draw(sheet)
    label_font = load(REG, 22)

    for i, (name, img) in enumerate(made):
        small = img.resize((PREVIEW, PREVIEW), Image.LANCZOS)
        big = small.resize((PREVIEW * scaled, PREVIEW * scaled), Image.NEAREST)
        x = 20 + i * (PREVIEW * scaled + 20)
        sheet.paste(big, (x, 20))
        # 圆形裁切遮罩示意
        mask = Image.new('L', (PREVIEW * scaled, PREVIEW * scaled), 0)
        dm = ImageDraw.Draw(mask)
        dm.ellipse([0, 0, PREVIEW * scaled - 1, PREVIEW * scaled - 1], fill=255)
        cover = Image.new('RGB', (PREVIEW * scaled, PREVIEW * scaled), (245, 245, 245))
        sheet.paste(Image.composite(big, cover, mask), (x, 20))
        ds.text((x, 20 + PREVIEW * scaled + 10), name.split('-')[0], font=label_font, fill=INK)

    p = os.path.join(out, '_对比图-40px真实观感.png')
    sheet.save(p, 'PNG', optimize=True)
    print('  [OK] _对比图-40px真实观感.png')
    print('\n  输出目录：%s' % out)
    print('  ⚠️ 对比图是把每个方案缩到 40px 再放大 6 倍（最近邻），')
    print('     模拟信息流里的真实观感 —— **看这张图选，不要看 1024px 的原图**。')


if __name__ == '__main__':
    main()
