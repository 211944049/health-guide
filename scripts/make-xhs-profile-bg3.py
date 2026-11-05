# -*- coding: utf-8 -*-
"""
把「原来的浅色水彩背景」改造成暗色版 —— 保留插画，只换底色

## 为什么走这条路

第一版我给的是纯色块。用户的原话是「你做的不是更low吗」——这个判断是对的：
在小红书的生活类账号里，纯色块读不出「设计感」，只读出「没做」。
原图里的柠檬水、苹果、哑铃、叶子本来就在讲「健康生活」，那套语汇是对的。

真正的敌人只有一层：主页背景会被乘上约 0.445 的黑遮罩（2026-10-27 实测）。
近白的纸底 #f5f5e8 被压之后变成 (109,109,103)，插画也跟着一起糊掉。

## 做法：抠掉纸底，插画放到深绿底上

1. 用饱和度 + 亮度判断「哪些像素是纸底」，生成 alpha
2. 纸底换成深墨绿渐变
3. 插画保留色相，提饱和度、提对比 —— 这样压暗后颜色还有余量
4. 因为原图是 5:4、目标是 16:9，会按比例裁切，这里保留中间区域

输出两张：`-上传这张` 和 `-实际效果`（= 上传图 × 0.445）
"""
import os

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

SRC = r"C:\Users\17878\.dsh\attachments\v1\objects\00\00ab84ef850a682796175bd579c866f1c2147c945f82e1937af3dd8a8bdfa93e"
W, H = 1125, 633
SCRIM = 0.445
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', 'handoff', '小红书背景')


def comp(target):
    return tuple(min(255, max(0, round(c / SCRIM))) for c in target)


def crop_to_ratio(img, w, h, anchor='top'):
    sw, sh = img.size
    target = w / h
    if sw / sh > target:
        nw = int(sh * target)
        x0 = (sw - nw) // 2
        box = (x0, 0, x0 + nw, sh)
    else:
        nh = int(sw / target)
        if anchor == 'top':
            y0 = 0
        else:
            y0 = (sh - nh) // 2
        box = (0, y0, sw, y0 + nh)
    return img.crop(box).resize((w, h), Image.LANCZOS)


def build_dark(anchor='top', art_bright=1.75, art_sat=2.1):
    base = Image.open(SRC).convert('RGB')
    base = crop_to_ratio(base, W, H, anchor)

    # ---- 1. 生成 alpha：越接近纸底越透明 ----
    hsv = base.convert('HSV')
    hh, ss, vv = hsv.split()
    # 纸底特征：饱和度低 + 亮度高
    s_px = ss.load()
    v_px = vv.load()
    alpha = Image.new('L', (W, H), 0)
    a_px = alpha.load()
    for y in range(H):
        for x in range(W):
            s = s_px[x, y]
            v = v_px[x, y]
            # 亮度越高、饱和越低 → alpha 越小
            keep = 0
            if s >= 55:                 # 有颜色 = 插画
                keep = 255
            elif v <= 200:              # 明显偏暗的线条/阴影
                keep = 210
            else:
                keep = max(0, int((s / 55) * 120))
            a_px[x, y] = keep

    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))

    # ---- 2. 插画层：大幅提亮 + 提饱和 ----
    # 原图是浅水彩（纸底 ~245，插画多在 180–230）。
    # 直接压 0.445 之后插画只剩 80–100，和暗底糊在一起。
    # 所以先把它推到接近 255，让遮罩吃掉的那一半之后仍有颜色。
    art = ImageEnhance.Color(base).enhance(art_sat)
    art = ImageEnhance.Contrast(art).enhance(1.12)
    art = ImageEnhance.Brightness(art).enhance(art_bright)

    # ---- 3. 深墨绿渐变的底 ----
    top = comp((26, 78, 60))
    bottom = comp((10, 36, 28))
    bg = Image.new('RGB', (W, H), top)
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)

    # ---- 4. 合成 ----
    out = Image.composite(art, bg, alpha)
    return out


def emit(img, name):
    os.makedirs(OUT, exist_ok=True)
    up = os.path.join(OUT, f'{name}-上传这张.png')
    img.save(up, 'PNG', optimize=True)
    pv = os.path.join(OUT, f'{name}-实际效果.png')
    img.point(lambda v: round(v * SCRIM)).save(pv, 'PNG', optimize=True)
    print(f'  [OK] {name}')


if __name__ == '__main__':
    print('=== 在原图基础上做暗色版 ===')
    emit(build_dark(anchor='top', art_bright=1.75, art_sat=2.1), 'I-原图暗色版')
    emit(build_dark(anchor='center', art_bright=1.9, art_sat=2.3), 'J-原图暗色版-居中')
    print(f'\n  输出：{os.path.abspath(OUT)}')
