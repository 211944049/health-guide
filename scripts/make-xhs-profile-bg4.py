# -*- coding: utf-8 -*-
"""
K. 从原图里抠出四个角落的元素，在 16:9 画布上重新摆放

## 为什么不用裁切

原图 1402×1122（5:4），主页背景是 1125×633（约 16:9）。
只要靠裁切，就必然切掉上下或左右的两块 ——
实测居中裁会把底部的柠檬水和苹果各切一半，看起来像坏图。

## 所以改成：抠元素 + 重排

1. 用饱和度/亮度算出「哪些像素是插画、哪些是纸底」
2. 只取四个角的插画区域（太阳、叶子、柠檬水、苹果+哑铃）
3. 在 16:9 的深墨绿底上重新摆，缩放到完整放进画面
4. 插画先提亮提饱和，抵消主页那层 0.445 的遮罩

这样每个元素都是完整的，构图也比原图更适合横版。
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


def alpha_of(img, s_min=50, v_max=205):
    """纸底透明、插画保留。"""
    hsv = img.convert('HSV')
    _h, s, v = hsv.split()
    sp, vp = s.load(), v.load()
    w, h = img.size
    a = Image.new('L', (w, h), 0)
    ap = a.load()
    for y in range(h):
        for x in range(w):
            sv, vv = sp[x, y], vp[x, y]
            if sv >= s_min:
                ap[x, y] = 255
            elif vv <= v_max:
                ap[x, y] = 200
            else:
                ap[x, y] = max(0, int((sv / s_min) * 110))
    return a.filter(ImageFilter.GaussianBlur(1.0))


def cut(src_img, box, target_max=300):
    """裁出一块，附上 alpha，并缩小到 target_max 以内。"""
    piece = src_img.crop(box)
    a = alpha_of(piece)
    piece = ImageEnhance.Color(piece).enhance(2.3)
    piece = ImageEnhance.Brightness(piece).enhance(1.85)
    piece.putalpha(a)
    r = target_max / max(piece.size)
    if r < 1:
        piece = piece.resize((int(piece.width * r), int(piece.height * r)), Image.LANCZOS)
    return piece


def build():
    src = Image.open(SRC).convert('RGB')
    sw, sh = src.size

    # 四个角落的插画区域（按原图 1402×1122 目测定位）
    tl = cut(src, (0, 0, 300, 250))            # 太阳 + 小叶子
    tr = cut(src, (1090, 240, sw, 600))        # 右上叶子
    bl = cut(src, (0, 780, 300, sh))           # 左下柠檬水 + 叶子
    br = cut(src, (1070, 760, sw, sh))         # 右下苹果 + 哑铃

    # 深墨绿渐变底
    top = comp((26, 78, 60))
    bottom = comp((10, 36, 28))
    bg = Image.new('RGB', (W, H), top)
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)

    # 摆放：贴四个角，略微出血，让元素像「从边上长出来」
    M = -18
    placements = [
        (tl, M, M),
        (tr, W - tr.width - M, M),
        (bl, M, H - bl.height - M),
        (br, W - br.width - M, H - br.height - M),
    ]
    for piece, x, y in placements:
        bg.paste(piece, (x, y), piece)

    return bg


def emit(img, name):
    os.makedirs(OUT, exist_ok=True)
    up = os.path.join(OUT, f'{name}-上传这张.png')
    img.save(up, 'PNG', optimize=True)
    img.point(lambda v: round(v * SCRIM)).save(
        os.path.join(OUT, f'{name}-实际效果.png'), 'PNG', optimize=True)
    print(f'  [OK] {name}')


if __name__ == '__main__':
    print('=== 抠元素 + 16:9 重排 ===')
    emit(build(), 'K-原图元素重排')
    print(f'\n  输出：{os.path.abspath(OUT)}')
