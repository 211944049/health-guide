# -*- coding: utf-8 -*-
"""
头像方案 v4：加入「符号」方向。

## 为什么加符号方向
前几版都是「一个汉字 + 纯色底」。这个组合的问题是：
它读起来像**临时占位**，而不是**设计过的标识**。
再精致的字体，本质仍然是"字贴在色块上"。

符号不一样：
  · 勾（✓）= 核实过 → 正好对应站点「每条都能查到出处」的差异
  · 几何形状在 40px 下比汉字更清晰（笔画更少、更容易辨认）
  · 视觉上天然像"标识"，不像"占位"

## 设计原则
  · 只有 1 个主形状 + 最多 1 个强调点点
  · 笔画足够粗（缩到 40px 不会消失）
  · 全部落在圆内切区内
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
FD = r'C:\Windows\Fonts'
SERIF = os.path.join(FD, 'NotoSerifSC-VF.ttf')
REG = os.path.join(FD, 'msyh.ttc')

G_A = (35, 110, 82)
G_B = (22, 82, 60)
CREAM = (246, 243, 236)
CREAM_2 = (238, 234, 225)
ACCENT = (200, 74, 30)
WHITE = (255, 255, 255)
GREEN_INK = (28, 88, 65)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '头像方案', 'v4')


def vgrad(top, bot):
    img = Image.new('RGB', (SIZE, SIZE), top)
    d = ImageDraw.Draw(img)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        d.line([(0, y), (SIZE, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return img


SS = 4  # 超采样倍数（抗锯齿）


def check_mark(size=SIZE, color=WHITE, thickness_ratio=0.115, origin=(0.5, 0.5), scale=0.52):
    """
    画一个粗勾。用超采样绘制再缩小，边缘才干净。
    返回 RGBA 图层。
    """
    S = size * SS
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx, cy = origin[0] * S, origin[1] * S
    unit = S * scale

    # 三个关键点（勾的形状）
    p1 = (cx - unit * 0.52, cy + unit * 0.02)
    p2 = (cx - unit * 0.12, cy + unit * 0.40)
    p3 = (cx + unit * 0.56, cy - unit * 0.44)

    w = int(S * thickness_ratio)
    # 必须**一次**画完整折线：joint='curve' 只在同一次 line() 调用内生效。
    # 分两次画会在拐角处留下缺口（v4 第一版就是这个 bug）。
    d.line([p1, p2, p3], fill=color, width=w, joint='curve')
    # 两个端点加圆头（line 的端点默认是平的）
    for p in (p1, p3):
        r = w / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)

    return layer.resize((size, size), Image.LANCZOS)


def dot(size=SIZE, color=ACCENT, center=(0.745, 0.715), r_ratio=0.038):
    S = size * SS
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center[0] * S, center[1] * S
    r = S * r_ratio
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    return layer.resize((size, size), Image.LANCZOS)


def paste_centered(img, layer, optical_dy=0.0):
    """
    按图层**实际内容的边界**居中，而不是按画布中心。
    勾形天生右上重，直接按画布居中会显得偏上；optical_dy 用来做微调。
    """
    bbox = layer.getbbox()
    if not bbox:
        return img
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    dx = int(SIZE / 2 - cx)
    dy = int(SIZE / 2 - cy + SIZE * optical_dy)
    shifted = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    shifted.paste(layer, (dx, dy), layer)
    img.paste(shifted, (0, 0), shifted)
    return img


# --------- 方案 ---------

def a1():
    """深绿渐变 + 粗白勾（单一元素，最干净）"""
    img = vgrad(G_A, G_B)
    return paste_centered(img, check_mark(color=WHITE + (255,), thickness_ratio=0.10, scale=0.46), 0.01)


def a2():
    """深绿渐变 + 粗白勾 + 橙点（右下角，作为唯一强调）"""
    img = vgrad(G_A, G_B)
    img = paste_centered(img, check_mark(color=WHITE + (255,), thickness_ratio=0.10, scale=0.44), 0.0)
    dm = dot(center=(0.735, 0.745), r_ratio=0.032)
    img.paste(dm, (0, 0), dm)
    return img


def a3():
    """米白底 + 绿勾 + 橙点"""
    img = vgrad(CREAM, CREAM_2)
    img = paste_centered(img, check_mark(color=GREEN_INK + (255,), thickness_ratio=0.10, scale=0.44), 0.0)
    dm = dot(center=(0.735, 0.745), r_ratio=0.032)
    img.paste(dm, (0, 0), dm)
    return img


def a4():
    """深绿渐变 + 细白勾（更克制、更精致）"""
    img = vgrad(G_A, G_B)
    return paste_centered(img, check_mark(color=WHITE + (255,), thickness_ratio=0.056, scale=0.56), 0.01)


def a5():
    """深绿渐变 + 勾 + 底部橙色细线（封面母题）"""
    img = vgrad(G_A, G_B)
    img = paste_centered(img, check_mark(color=WHITE + (255,), thickness_ratio=0.09, scale=0.42), -0.045)
    d = ImageDraw.Draw(img)
    w, h = SIZE * 0.13, SIZE * 0.011
    y = SIZE * 0.735
    d.rectangle([SIZE / 2 - w / 2, y, SIZE / 2 + w / 2, y + h], fill=ACCENT)
    return img


def a6():
    """米白底 + 绿勾（最克制，无点缀）"""
    img = vgrad(CREAM, CREAM_2)
    return paste_centered(img, check_mark(color=GREEN_INK + (255,), thickness_ratio=0.10, scale=0.46), 0.01)


def a7():
    """深绿渐变 + 米白细圆环 + 白勾（徽章感）"""
    img = vgrad(G_A, G_B)
    d = ImageDraw.Draw(img)
    pad = SIZE * 0.135
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], outline=(255, 255, 255), width=max(2, int(SIZE * 0.007)))
    return paste_centered(img, check_mark(color=WHITE + (255,), thickness_ratio=0.085, scale=0.34), 0.0)


OPTIONS = [
    ('21-绿底-粗白勾', a1),
    ('22-绿底-白勾+橙点', a2),
    ('23-米白底-绿勾+橙点', a3),
    ('24-绿底-细白勾', a4),
    ('25-绿底-白勾+橙线', a5),
    ('26-米白底-绿勾', a6),
    ('27-绿底-徽章圆环', a7),
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
    print('\n  输出：%s' % out)


if __name__ == '__main__':
    main()
