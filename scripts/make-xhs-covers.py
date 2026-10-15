# -*- coding: utf-8 -*-
"""
生成小红书封面图（1080×1440，3:4）。

## 为什么单独做一个（不复用 make-og-images.py）

分享图是给微信/Telegram 做链接预览的：**1200×630（1.90:1）横版**，文字小。
小红书封面是**3:4 竖版**，而且在信息流里**只有约 200px 宽**——
所以关键指标完全不同：

| | 链接预览图 | 小红书封面 |
| --- | --- | --- |
| 尺寸 | 1200×630 横版 | **1080×1440 竖版** |
| 字号 | 62px 标题 | **110–150px**（缩到 200px 宽仍有 ~20–28px，可读） |
| 文字量 | 可以较多 | **最多 3 行**，多了一眼看不清 |
| 目的 | 让人知道链接是什么 | **让人在 0.5 秒内决定点不点** |

所以这个脚本的设计目标是**信息流里的可读性**，而不是信息完整。

## 用法
    python scripts/make-xhs-covers.py
输出：handoff/小红书封面/*.png

## 设计约定
  · 背景：暖白 #FAF8F4（比纯白柔和，在信息流里不刺眼）
  · 主色：站点绿 #1F7A5A（与网站一致，形成识别）
  · 强调色：#C8471C（橙红，用于数字/关键词，与绿色对比强）
  · 底部：小字署名（品牌识别 + 主页引流）
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1440

BG = (250, 248, 244)
INK = (26, 26, 26)
GREEN = (31, 122, 90)
ACCENT = (200, 71, 28)
GREY = (120, 120, 120)

FONT_DIR = r'C:\Windows\Fonts'
BOLD = os.path.join(FONT_DIR, 'msyhbd.ttc')
REG = os.path.join(FONT_DIR, 'msyh.ttc')

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '小红书封面')

SITE = '高性价比健康指南'


def load_fonts():
    for p in (BOLD, REG):
        if not os.path.exists(p):
            sys.exit('[X] 找不到中文字体：%s' % p)
    return {
        'huge': ImageFont.truetype(BOLD, 170),
        'big': ImageFont.truetype(BOLD, 118),
        'mid': ImageFont.truetype(BOLD, 86),
        'sm': ImageFont.truetype(REG, 54),
        'tiny': ImageFont.truetype(REG, 40),
        'sign': ImageFont.truetype(REG, 36),
    }


def text_w(d, s, font):
    return d.textlength(s, font=font)


def wrap(text, font, max_w, d, max_lines=3):
    """
    按像素宽度折行。中文逐字断（封面文字短，逐字够用）。

    ⚠️ 必须**先按 \n 切成段**再逐段折行：PIL 的 `textlength()` 对含换行的字符串
    会抛 `ValueError: can't measure length of multiline text`。
    第一版没处理，第三张封面就崩了。
    """
    out = []
    for seg in str(text).split('\n'):
        if len(out) >= max_lines:
            break
        if seg == '':
            out.append('')
            continue
        cur = ''
        for ch in seg:
            if text_w(d, cur + ch, font) <= max_w:
                cur += ch
            else:
                out.append(cur)
                cur = ch
                if len(out) >= max_lines:
                    break
        if cur and len(out) < max_lines:
            out.append(cur)
    return out[:max_lines]


def new_canvas():
    img = Image.new('RGB', (W, H), BG)
    return img, ImageDraw.Draw(img)


def draw_accent_bar(d, y, height=10, x=90, w=140):
    d.rectangle([x, y, x + w, y + height], fill=GREEN)


def draw_signature(d, fonts, y):
    d.text((90, y), SITE, font=fonts['sign'], fill=GREY)


def centered_lines(d, lines, font, colors, start_y, line_gap=18, x=90):
    """逐行绘制，可给每行单独指定颜色。"""
    y = start_y
    for line, color in zip(lines, colors):
        d.text((x, y), line, font=font, fill=color)
        y += font.size + line_gap
    return y


# ---------------------------------------------------------------- 版式
#
# ⚠️ 为什么要"先量后画"：第一版是**从固定 y 开始往下画**，结果内容总挤在上方、
# 下方留一大片空白 —— 在信息流里看起来像没做完。
# 现在先算内容总高，再在「顶部色条」与「底部署名」之间**垂直居中**。

TOP = 150          # 顶部色条 y
SIGN_Y = H - 110   # 署名 y
MARGIN = 90        # 左右边距
BODY_TOP = 300     # 内容区上界（色条下留白）
BODY_BOTTOM = SIGN_Y - 60


def layout_center(total_h):
    """把高度为 total_h 的内容块在内容区里垂直居中，返回起始 y。"""
    avail = BODY_BOTTOM - BODY_TOP
    y = BODY_TOP + max(0, (avail - total_h) // 2)
    return y


def measure_block(d, spec_lines, fonts, gap_key='gap', default_gap=30):
    """量出「逐行文字块」的高度。"""
    h = 0
    for i, line in enumerate(spec_lines):
        f = fonts[line.get('size', 'big')]
        h += f.size
        if i < len(spec_lines) - 1:
            h += line.get(gap_key, default_gap)
    return h


def measure_wrapped(d, text, font, max_w, max_lines, line_gap):
    """量出折行文本的高度。"""
    if not text:
        return 0, []
    lines = wrap(text, font, max_w, d, max_lines)
    return len(lines) * font.size + max(0, len(lines) - 1) * line_gap, lines


# ---------------------------------------------------------------- 模板

def cover_big_number(spec, fonts):
    """
    「一个大数字」型：最适合反常识内容。
    例：你涂的防晒霜 / 只有需要的 / 1/4
    """
    img, d = new_canvas()
    draw_accent_bar(d, TOP)

    block_h = measure_block(d, spec['lines'], fonts)
    note_h, note_lines = measure_wrapped(d, spec.get('note'), fonts['sm'], W - 2 * MARGIN, 3, 16)
    # 大字与小字说明之间要有明确留白，否则「1/4」会和说明文字贴在一起
    NOTE_GAP = 78
    total = block_h + (NOTE_GAP + note_h if note_lines else 0)

    y = layout_center(total)
    for i, line in enumerate(spec['lines']):
        f = fonts[line.get('size', 'big')]
        d.text((MARGIN, y), line['t'], font=f, fill=line.get('c', INK))
        y += f.size
        if i < len(spec['lines']) - 1:
            y += line.get('gap', 30)

    if note_lines:
        y += NOTE_GAP
        for line in note_lines:
            d.text((MARGIN, y), line, font=fonts['sm'], fill=GREY)
            y += fonts['sm'].size + 16

    draw_signature(d, fonts, SIGN_Y)
    return img


def cover_list(spec, fonts):
    """
    「清单」型：标题 + 2–4 条短句。适合选购类、对比类。
    """
    img, d = new_canvas()
    draw_accent_bar(d, TOP)

    title_h = fonts['big'].size
    title_gap = 90          # 标题与第一条之间
    item_font = fonts['sm']
    item_gap = 46           # 条目之间
    item_line_gap = 14      # 条目内部换行
    NOTE_GAP = 70           # 最后一条与小字说明之间

    # 先量所有条目
    measured = []
    for item in spec['items']:
        lines = wrap(item, item_font, W - 260, d, 2)
        h = len(lines) * item_font.size + max(0, len(lines) - 1) * item_line_gap
        measured.append((lines, h))

    items_h = sum(h for _, h in measured) + item_gap * max(0, len(measured) - 1)
    note_h, note_lines = measure_wrapped(d, spec.get('note'), fonts['tiny'], W - 2 * MARGIN, 3, 12)

    total = title_h + title_gap + items_h + (NOTE_GAP + note_h if note_lines else 0)
    y = layout_center(total)

    d.text((MARGIN, y), spec['title'], font=fonts['big'], fill=INK)
    y += title_h + title_gap

    for i, (lines, h) in enumerate(measured, 1):
        d.text((MARGIN, y + 4), '%d' % i, font=fonts['mid'], fill=ACCENT)
        ly = y
        for line in lines:
            d.text((170, ly), line, font=item_font, fill=INK)
            ly += item_font.size + item_line_gap
        y += h
        if i < len(measured):
            y += item_gap

    if note_lines:
        y += NOTE_GAP
        for line in note_lines:
            d.text((MARGIN, y), line, font=fonts['tiny'], fill=GREY)
            y += fonts['tiny'].size + 12

    draw_signature(d, fonts, SIGN_Y)
    return img


def cover_question(spec, fonts):
    """
    「提问 + 回答」型：适合澄清误区。
    """
    img, d = new_canvas()
    draw_accent_bar(d, TOP)

    q_h, q_lines = measure_wrapped(d, spec['question'], fonts['big'], W - 2 * MARGIN, 3, 20)
    a_h, a_lines = measure_wrapped(d, spec['answer'], fonts['mid'], W - 240, 4, 18)

    total = q_h + 70 + max(a_h, 120)
    y = layout_center(total)

    for line in q_lines:
        d.text((MARGIN, y), line, font=fonts['big'], fill=INK)
        y += fonts['big'].size + 20

    y += 70 - 20
    # 左侧强调竖条：高度跟随答案
    d.rectangle([MARGIN, y + 8, MARGIN + 8, y + max(a_h, 60)], fill=ACCENT)
    ay = y
    for line in a_lines:
        d.text((MARGIN + 50, ay), line, font=fonts['mid'], fill=GREEN)
        ay += fonts['mid'].size + 18

    draw_signature(d, fonts, SIGN_Y)
    return img


TEMPLATES = {
    'number': cover_big_number,
    'list': cover_list,
    'question': cover_question,
}


# ---------------------------------------------------------------- 封面清单
#
# 每条对应一篇笔记。**先做推荐首发的那几篇**，不一次做 144 张 ——
# 封面要贴着实际文案做，做完再改文案就白做了。
#
COVERS = [
    {
        'file': '01-防晒霜怎么涂才有用',
        'template': 'number',
        'lines': [
            {'t': '你涂的防晒霜', 'c': INK},
            {'t': '只有需要的', 'c': INK},
            {'t': '1/4', 'c': ACCENT, 'size': 'huge', 'gap': 0},
        ],
        'note': 'SPF 是按每平方厘米 2 毫克测的\n用量减半，防护会明显下降',
    },
    {
        'file': '02-防晒霜怎么选',
        'template': 'list',
        'title': '防晒霜怎么看懂',
        'items': [
            'SPF 管晒伤（UVB）',
            'PA 管晒黑晒老（UVA）',
            '两个数都要看，只有一个高不等于防护完整',
            '靠窗、开车也要涂——UVA 能穿透玻璃',
        ],
        'note': '日常通勤 SPF30 / PA+++ 就够；户外要 SPF50+ / PA++++ 且防水',
    },
    {
        'file': '03-洗脸巾怎么选毛巾要不要换',
        'template': 'question',
        'question': '洗脸巾真的\n比毛巾好吗？',
        'answer': '不一定。\n关键不是"一次性"，\n而是材质和干不干。',
    },
    {
        'file': '04-洗手要怎么洗才有用',
        'template': 'big_number_alt',
        'template_override': 'number',
        'lines': [
            {'t': '洗手要搓', 'c': INK},
            {'t': '20 秒', 'c': ACCENT, 'size': 'huge', 'gap': 0},
            {'t': '大部分人只搓了 5 秒', 'c': GREY, 'size': 'sm', 'gap': 0},
        ],
        'note': '流水 + 肥皂，搓够时间比用什么牌子重要',
    },
    {
        'file': '05-抽纸和纸巾怎么选',
        'template': 'list',
        'title': '纸巾怎么挑',
        'items': [
            '看执行标准，不是看包装',
            '原生木浆 ≠ 原生浆',
            '"荧光剂"更多是营销恐吓',
        ],
        'note': '擦嘴和擦桌子的标准不一样，别混用',
    },
    {
        'file': '06-牙线怎么用',
        'template': 'question',
        'question': '牙刷得再认真，\n也刷不到牙缝',
        'answer': '牙线不是可选项。\n每天一次，\n比用力刷更有用。',
    },
]


def main():
    fonts = load_fonts()
    out = os.path.abspath(OUT_DIR)
    os.makedirs(out, exist_ok=True)

    made = 0
    for spec in COVERS:
        tpl = TEMPLATES.get(spec.get('template_override') or spec['template'])
        if not tpl:
            print('  [X] 未知模板：%s' % spec['template'])
            continue
        img = tpl(spec, fonts)
        path = os.path.join(out, spec['file'] + '.png')
        img.save(path, 'PNG', optimize=True)
        size_kb = os.path.getsize(path) / 1024
        print('  [OK] %s  (%.0f KB)' % (spec['file'] + '.png', size_kb))
        made += 1

    print('\n  生成 %d 张封面（1080×1440，3:4）' % made)
    print('  输出目录：%s' % out)


if __name__ == '__main__':
    main()
