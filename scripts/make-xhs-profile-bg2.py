# -*- coding: utf-8 -*-
"""
小红书主页背景 · 针对「黑色遮罩」重新计算

## 为什么重做

2026-10-27 实测：小红书主页背景会被乘上约 0.445（等价于叠一层约 55% 的黑），
目的是让白色的昵称和简介能看清。

后果：**浅色背景永远显示为灰**。近白的纸色 #faf9f5 输出只有 (111,111,109)。
第一版给的 B（淡绿晕）因此变成了脏灰绿——不是配色问题，是被遮罩压掉了。

## 做法

反向补偿：先定「我希望看到的颜色」（target），再除以 0.445 得到要上传的颜色。
上传色会亮得刺眼，但这一层亮会被遮罩吃掉，看到的才是 target。

每个方案输出两张：
  · `X-上传这张.png`  → 传到小红书
  · `X-实际效果.png`  → 上传后你会看到的样子（= 上传图 × 0.445）

## 亮度天花板

输出最大只能到 255 × 0.445 ≈ 113。所以在小红书上，
这个位置**不可能做出浅色**，只能做深浅不同的暗色。这是平台决定的，不是设计问题。
"""
import os

from PIL import Image, ImageDraw, ImageFilter

W, H = 1125, 633
SCRIM = 0.445

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'handoff', '小红书背景')


def comp(target):
    """把「想看到的颜色」换算成「要上传的颜色」。"""
    return tuple(min(255, max(0, round(c / SCRIM))) for c in target)


def simulate(img):
    """模拟小红书遮罩后的样子。"""
    return img.point(lambda v: round(v * SCRIM))


def emit(img, name):
    os.makedirs(OUT, exist_ok=True)
    up = os.path.join(OUT, f'{name}-上传这张.png')
    img.save(up, 'PNG', optimize=True)
    preview = os.path.join(OUT, f'{name}-实际效果.png')
    simulate(img).save(preview, 'PNG', optimize=True)
    print(f'  [OK] {name}  上传 {os.path.getsize(up)//1024} KB / 预览 {os.path.getsize(preview)//1024} KB')


def option_e_deep_green():
    """E. 深墨绿纯色 —— 稳，接近站点主色的暗调"""
    target = (22, 72, 56)
    emit(Image.new('RGB', (W, H), comp(target)), 'E-深墨绿')


def option_f_gradient():
    """F. 墨绿垂直渐变 —— 上略亮下更深，压暗后有层次，不会糊成一块"""
    top = (30, 92, 72)
    bottom = (12, 42, 33)
    img = Image.new('RGB', (W, H), comp(top))
    d = ImageDraw.Draw(img)
    ct, cb = comp(top), comp(bottom)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(ct[i] + (cb[i] - ct[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    emit(img, 'F-墨绿渐变')


def option_g_near_black_lines():
    """G. 近黑 + 右侧极淡细线 —— 档案感，暗底上线条才看得见"""
    base = (16, 18, 22)
    img = Image.new('RGB', (W, H), comp(base))
    d = ImageDraw.Draw(img)
    line_c = comp((28, 32, 38))
    for i in range(22):
        y = H - 330 + i * 15
        if 0 <= y < H:
            d.line([(0, y), (W, y)], fill=line_c, width=1)
    # 左侧淡出，避免出现硬边缘
    mask = Image.new('L', (W, H), 0)
    dm = ImageDraw.Draw(mask)
    for x in range(W):
        t = max(0.0, (x / W - 0.5) / 0.5)
        dm.line([(x, 0), (x, H)], fill=int(255 * t * t))
    faded = Image.composite(img, Image.new('RGB', (W, H), comp(base)), mask)
    faded = faded.filter(ImageFilter.GaussianBlur(0.4))
    emit(faded, 'G-近黑细线')


def option_h_green_glow():
    """H. 墨绿 + 右上角略亮的柔光 —— 最"有气"的一版，但不会抢字"""
    base = (20, 60, 47)
    img = Image.new('RGB', (W, H), comp(base))
    glow = Image.new('RGB', (W, H), comp(base))
    d = ImageDraw.Draw(glow)
    d.ellipse([W - 620, -380, W + 260, H + 200], fill=comp((38, 104, 80)))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    emit(Image.blend(img, glow, 0.9), 'H-墨绿柔光')


if __name__ == '__main__':
    print(f'=== 按遮罩 {SCRIM} 反向补偿，生成 {W}×{H} ===')
    option_e_deep_green()
    option_f_gradient()
    option_g_near_black_lines()
    option_h_green_glow()
    print(f'\n  输出：{os.path.abspath(OUT)}')
    print('  「-上传这张」传到小红书；「-实际效果」是它压暗后的样子')
