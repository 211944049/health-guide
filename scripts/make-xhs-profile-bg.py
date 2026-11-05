# -*- coding: utf-8 -*-
"""
小红书主页背景图 · 4 个方案

为什么是这四种：
  主页背景在手机端只露出顶部一条，还会被头像和昵称挡住中间。
  所以它唯一该做的事是「不碍事」——任何具象图案（叶子、爱心、太阳）
  被裁掉一半之后都只剩「乱」。

  这四个方案共同点：无具象元素、低对比、和网站同一套色板
  （站点 --bg: #faf9f5 / --brand: #175c46）。
"""
import os
from PIL import Image, ImageDraw, ImageFilter

W, H = 1125, 633          # 小红书主页背景的常用尺寸（约 16:9）
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '小红书背景')

PAPER = (250, 249, 245)   # #faf9f5  站点纸色
BRAND = (23, 92, 70)      # #175c46  站点主色
INK = (21, 23, 27)        # #15171b


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    img.save(p, 'PNG', optimize=True)
    print(f'  [OK] {name}  {os.path.getsize(p)//1024} KB')


def option_a_paper():
    """A. 纯纸色 —— 最安静，主页上几乎"消失" """
    save(Image.new('RGB', (W, H), PAPER), 'A-纯纸色.png')


def option_b_soft_gradient():
    """B. 纸色 + 右上角极淡的品牌绿晕 —— 有一点呼吸感，但仍然不抢戏"""
    img = Image.new('RGB', (W, H), PAPER)
    overlay = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(overlay)
    d.ellipse([W - 480, -320, W + 220, H + 180], fill=(232, 242, 236))
    overlay = overlay.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, overlay, 0.85)
    save(img, 'B-淡绿晕.png')


def option_c_brand_solid():
    """C. 品牌绿纯色 —— 最"品牌"，但会比较重，适合主页想显眼时"""
    save(Image.new('RGB', (W, H), BRAND), 'C-品牌绿.png')


def option_d_hairline():
    """D. 纸色 + 右侧极细的横线，向左淡出 —— 档案/表格的暗示"""
    img = Image.new('RGB', (W, H), PAPER)

    # 线条画在单独图层上，再用「左 0 → 右 255」的水平渐变做遮罩。
    # 第一版直接把线从 x0 画到 W，结果左边出现一道硬边缘 —— 看起来像 bug，
    # 不像设计。渐变淡出之后才是"若有若无"的稿纸感。
    lines = Image.new('L', (W, H), 0)
    dl = ImageDraw.Draw(lines)
    for i in range(22):
        y = H - 330 + i * 15
        if 0 <= y < H:
            dl.line([(0, y), (W, y)], fill=90, width=1)

    mask = Image.new('L', (W, H), 0)
    dm = ImageDraw.Draw(mask)
    for x in range(W):
        # 前 55% 完全透明，之后线性增强
        t = max(0.0, (x / W - 0.55) / 0.45)
        dm.line([(x, 0), (x, H)], fill=int(255 * t * t))   # 平方让过渡更柔

    lines = lines.filter(ImageFilter.GaussianBlur(0.6))
    tint = Image.new('RGB', (W, H), (214, 209, 196))       # 比纸色深一点点的暖灰
    img.paste(tint, (0, 0), Image.composite(lines, Image.new('L', (W, H), 0), mask))
    save(img, 'D-细线稿纸.png')


if __name__ == '__main__':
    print(f'=== 生成 {W}×{H} 背景图 4 个方案 ===')
    option_a_paper()
    option_b_soft_gradient()
    option_c_brand_solid()
    option_d_hairline()
    print(f'\n  输出：{os.path.abspath(OUT)}')
