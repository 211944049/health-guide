# -*- coding: utf-8 -*-
"""
小红书**多图轮播**生成器（5 张一套，1080×1440）。

## 为什么要做轮播
单图笔记的停留时长约 1–2 秒；5 图轮播会让人手动划 4 次，
停留时长通常翻几倍，而**停留时长直接决定小红书给多大的流量池**。

参考案例（用户提供）：「隔夜饭会致癌吗」5 图轮播 → 490 赞 / 246 收藏 / 145 评论。
拆解后真正起作用的是三件事：
  ① **轮播**（不是单图）     ② **高恐惧钩子**（致癌）     ③ 图上带具体数据/标准

## 这张模板学了什么、没学什么
学的：**结构**（封面 → 反常识结论 → ✗清单 → ✓步骤 → 收尾）、
      **✓/✗ 双色标记**、**每条一行字说清**、**关键数字标色**。
没学的：他的配色和插画（那是他的品牌资产）。
本模板用站点自己的色：暖白底 #FAF8F4 / 绿 #1F7A5A / 砖红 #C8471C。

## 硬约束（和封面生成器一致）
  · 安全宽度：裁切视图里不能缺字
  · 行首禁则：标点不能出现在行首
  · 每页只放 2–4 条，多了没人看完

用法：python scripts/make-xhs-carousel.py
输出：handoff/小红书轮播/<套名>/01.png ... 05.png
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1440
MARGIN = 86
SAFE_W = W - MARGIN * 2

FD = r'C:\Windows\Fonts'
F_BOLD = os.path.join(FD, 'msyhbd.ttc')
F_REG = os.path.join(FD, 'msyh.ttc')

BG = (250, 248, 244)
INK = (28, 30, 33)
INK_SOFT = (92, 100, 112)
GREEN = (31, 122, 90)
RED = (200, 71, 28)
PINK = (233, 30, 99)      # 关键词下划线（学参考案例的荧光笔感）
LINE = (227, 223, 215)

OUT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'handoff', '小红书轮播')

KINSOKU_NO_START = set('，。、；：？！）」』》〉】,.;:?!)]}>')


def font(path, size):
    return ImageFont.truetype(path, size)


def measure(d, text, f):
    b = d.textbbox((0, 0), text, font=f)
    return b[2] - b[0], b[3] - b[1]


def wrap(d, text, f, max_w):
    """按宽度折行；标点不放行首。"""
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        trial = cur + ch
        if measure(d, trial, f)[0] <= max_w or not cur:
            cur = trial
        else:
            # 行首禁则：把标点拉到上一行
            if ch in KINSOKU_NO_START:
                lines.append(cur + ch)
                cur = ''
            else:
                lines.append(cur)
                cur = ch
    if cur:
        lines.append(cur)
    return lines


def draw_hl(d, x, y, w, h, color=PINK):
    """荧光笔效果：文字下方的半透明色条。"""
    d.rectangle([x, y, x + w, y + h], fill=color)


def draw_check(d, x, y, size, color):
    """
    画勾。**必须手画，不能用字符 ✓** ——
    微软雅黑没有 U+2713/U+2717，直接画字符会渲染成「缺字符」空心方块
    （第一版就是这个 bug，整页的标记全是空框）。
    手画还有一个好处：线宽和颜色可以精确控制，跟正文视觉重量一致。
    """
    w = max(6, int(size * 0.17))
    p1 = (x, y + size * 0.55)
    p2 = (x + size * 0.36, y + size * 0.95)
    p3 = (x + size * 0.98, y + size * 0.08)
    d.line([p1, p2, p3], fill=color, width=w, joint='curve')
    for p in (p1, p3):
        r = w / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def draw_cross(d, x, y, size, color):
    """画叉。同上，手画不用字符。"""
    w = max(6, int(size * 0.17))
    pad = size * 0.08
    d.line([(x + pad, y + pad), (x + size - pad, y + size - pad)], fill=color, width=w)
    d.line([(x + size - pad, y + pad), (x + pad, y + size - pad)], fill=color, width=w)


def draw_dot(d, x, y, size, color):
    r = size * 0.16
    cx, cy = x + size * 0.35, y + size * 0.55
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def slide_cover(d, spec):
    """
    封面：超大标题 + 副标题色条 + 底部提示，**整块垂直居中**。

    第一版把提示条钉在页面底部，结果标题和提示之间空出一大片。
    现在把三部分当作一个整体来居中——留白留在页面上下两端，
    而不是中间裂开一道缝。

    另外：小红书信息流里如果被裁成方形，会切掉上下各约 12%，
    所以所有内容都要落在中间 76% 的高度内，不能贴边。
    """
    title_lines = spec['title'].split('\n')
    notes = spec.get('notes', [])
    kicker = spec.get('kicker')

    f_title = font(F_BOLD, 116)
    for raw in title_lines:
        while measure(d, raw, f_title)[0] > SAFE_W and f_title.size > 60:
            f_title = font(F_BOLD, f_title.size - 4)
    title_h = int(f_title.size * 1.22) * len(title_lines)

    sub_h = 0
    if spec.get('sub'):
        _, th = measure(d, spec['sub'], font(F_BOLD, 46))
        sub_h = 40 + th + 22

    note_h = (len(notes) * 52 + 60) if notes else 0

    # 系列编号：画在标题上方，并计入整体高度，这样居中不会把它挤出安全区。
    # 这一行是「关注理由」——看到 009 就知道还有 001–008，也预期 010 会来。
    kicker_h = 78 if kicker else 0

    block_h = kicker_h + title_h + sub_h + note_h
    y = max(170, (H - block_h) // 2)

    if kicker:
        d.text((MARGIN, y), kicker, font=font(F_BOLD, 30), fill=PINK)
        y += kicker_h

    for raw in title_lines:
        d.text((MARGIN, y), raw, font=f_title, fill=INK)
        y += int(f_title.size * 1.22)

    if spec.get('sub'):
        y += 40
        f = font(F_BOLD, 46)
        tw, th = measure(d, spec['sub'], f)
        d.rectangle([MARGIN - 14, y - 14, MARGIN + tw + 20, y + th + 22], fill=(255, 240, 140))
        d.text((MARGIN, y), spec['sub'], font=f, fill=INK)
        y += th + 22

    if notes:
        y += 52
        f = font(F_REG, 34)
        for note in notes:
            d.text((MARGIN, y), '· ' + note, font=f, fill=INK_SOFT)
            y += 52


def slide_devices(d, spec, page_no, total):
    """一张示意图：三种设备形态对比（左侧简笔示意 + 右侧判断）。"""
    y = 140
    tf = font(F_BOLD, 64)
    title = spec['title']
    while measure(d, title, font(F_BOLD, tf.size))[0] > W - 2 * MARGIN and tf.size > 44:
        tf = font(F_BOLD, tf.size - 4)
    d.text((MARGIN, y), title, font=tf, fill=INK)
    y += 128

    if spec.get('rule', True):
        d.line([(MARGIN, y), (W - MARGIN, y)], fill=LINE, width=2)
        y += 72

    # ── 左侧：手臂示意 ─────────────────────────────────────
    cx = 300
    ay = y + 20
    SKIN = (231, 220, 205)
    SKIN2 = (240, 231, 219)
    BAND = (58, 62, 70)
    SCREEN = (245, 243, 238)

    # 手臂：一整块多边形，无接缝
    arm = [
        (cx - 56, ay + 10), (cx - 56, ay + 262),
        (cx - 47, ay + 300), (cx - 47, ay + 470),
        (cx - 62, ay + 500), (cx - 62, ay + 560),
        (cx + 62, ay + 560), (cx + 62, ay + 500),
        (cx + 47, ay + 470), (cx + 47, ay + 300),
        (cx + 56, ay + 262), (cx + 56, ay + 10),
    ]
    d.polygon(arm, fill=SKIN)
    d.ellipse([cx - 56, ay - 46, cx + 56, ay + 66], fill=SKIN)   # 肩头圆角

    # ① 上臂式：袖带 + 主机
    d.rounded_rectangle([cx - 68, ay + 84, cx + 68, ay + 208], radius=16,
                        outline=GREEN, width=9)
    d.rounded_rectangle([cx + 68, ay + 122, cx + 138, ay + 174], radius=10, fill=GREEN)
    d.rounded_rectangle([cx + 78, ay + 132, cx + 128, ay + 164], radius=6, fill=SCREEN)

    # ② 腕式：表带 + 表盘
    d.rounded_rectangle([cx - 54, ay + 372, cx + 54, ay + 424], radius=12,
                        outline=RED, width=7)
    d.ellipse([cx - 46, ay + 344, cx + 46, ay + 452], fill=RED)
    d.ellipse([cx - 34, ay + 356, cx + 34, ay + 440], fill=SCREEN)

    # ③ 手指式：夹子
    d.rounded_rectangle([cx - 46, ay + 492, cx - 20, ay + 552], radius=10,
                        outline=RED, width=7)
    d.rounded_rectangle([cx + 20, ay + 492, cx + 46, ay + 552], radius=10,
                        outline=RED, width=7)
    d.rounded_rectangle([cx - 46, ay + 500, cx + 46, ay + 528], radius=8,
                        fill=(250, 248, 244))
    d.rounded_rectangle([cx - 46, ay + 500, cx + 46, ay + 528], radius=8,
                        outline=RED, width=7)

    # ── 右侧：三行说明 ─────────────────────────────────────
    rx = 470
    rows = [
        (ay + 70,  GREEN, '上臂式', '肱动脉位置稳定', '推荐'),
        (ay + 344, RED,   '腕式',   '动脉细，手腕一偏就失准', '不推荐'),
        (ay + 492, RED,   '手指式', '误差更大', '不推荐'),
    ]
    for ry, color, name, why, verdict in rows:
        draw_check(d, rx, ry + 6, 30, color) if color == GREEN else draw_cross(d, rx, ry + 6, 30, color)
        nf = font(F_BOLD, 44)
        d.text((rx + 46, ry), name, font=nf, fill=INK)
        vf = font(F_BOLD, 32)
        vw = measure(d, verdict, vf)[0]
        d.text((W - MARGIN - vw, ry + 10), verdict, font=vf, fill=color)
        wf = font(F_REG, 31)
        wy = ry + 56
        for line in wrap(d, why, wf, W - MARGIN - rx - 46):
            d.text((rx + 46, wy), line, font=wf, fill=INK_SOFT)
            wy += 44

    # ── 底部要点 ───────────────────────────────────────────
    by = ay + 620
    d.line([(MARGIN, by), (W - MARGIN, by)], fill=LINE, width=2)
    by += 44
    bf = font(F_REG, 34)
    for line in spec.get('notes', []):
        d.text((MARGIN, by), '· ' + line, font=bf, fill=INK_SOFT)
        by += 52

    page_footer(d, page_no, total)


def slide_items(d, spec, page_no, total):
    """内容页：编号标题 + 若干 ✓/✗ 条目。"""
    y = 150

    # 标题（可带编号）
    tf = font(F_BOLD, 66)
    title = spec['title']
    while measure(d, title, tf)[0] > SAFE_W and tf.size > 40:
        tf = font(F_BOLD, tf.size - 4)
    d.text((MARGIN, y), title, font=tf, fill=INK)
    y += int(tf.size * 1.35) + 16

    # 标题下的细线
    d.rectangle([MARGIN, y, W - MARGIN, y + 4], fill=LINE)
    y += 56

    for item in spec['items']:
        kind = item['kind']          # 'do' / 'dont' / 'note'
        color = {'do': GREEN, 'dont': RED, 'note': INK_SOFT}[kind]
        mk = 44                      # 标记的绘制尺寸

        # 标记（手画，不用字符）
        if kind == 'do':
            draw_check(d, MARGIN, y + 2, mk, color)
        elif kind == 'dont':
            draw_cross(d, MARGIN, y + 2, mk, color)
        else:
            draw_dot(d, MARGIN, y + 2, mk, color)

        # 小标题
        hf = font(F_BOLD, 46)
        head = item['head']
        while measure(d, head, hf)[0] > SAFE_W - 90 and hf.size > 28:
            hf = font(F_BOLD, hf.size - 2)
        hx = MARGIN + 78
        d.text((hx, y), head, font=hf, fill=INK)
        # 小标题下划线（关键词感）
        hw, hh = measure(d, head, hf)
        draw_hl(d, hx, y + hh + 8, hw, 10)
        y += int(hf.size * 1.5) + 14

        # 正文
        if item.get('body'):
            bf = font(F_REG, 38)
            for line in wrap(d, item['body'], bf, SAFE_W - 90):
                d.text((hx, y), line, font=bf, fill=INK_SOFT)
                y += int(bf.size * 1.5)
        y += 46

    page_footer(d, page_no, total)


def slide_end(d, spec, page_no, total):
    """收尾页：要点回顾 + 引导。"""
    y = 160
    tf = font(F_BOLD, 66)
    # 标题自动缩小，和封面同一套逻辑。
    # 不收尾页的标题往往是最长的一句（「驱蚊液怎么选，什么时候必须去医院」），
    # 66px 会直接冲出右边被裁掉 —— 2026-10-27 实测踩到过，别只改文案躲过去。
    while measure(d, spec['title'], tf)[0] > SAFE_W and tf.size > 38:
        tf = font(F_BOLD, tf.size - 2)
    d.text((MARGIN, y), spec['title'], font=tf, fill=INK)
    y += int(tf.size * 1.4) + 20
    d.rectangle([MARGIN, y, W - MARGIN, y + 4], fill=LINE)
    y += 64

    bf = font(F_REG, 40)
    for line in spec.get('lines', []):
        for wrapped in wrap(d, line, bf, SAFE_W):
            d.text((MARGIN, y), wrapped, font=bf, fill=INK)
            y += int(bf.size * 1.6)
        y += 22

    if spec.get('cta'):
        y += 40
        cf = font(F_BOLD, 40)
        for wrapped in wrap(d, spec['cta'], cf, SAFE_W):
            d.text((MARGIN, y), wrapped, font=cf, fill=GREEN)
            y += int(cf.size * 1.6)

    page_footer(d, page_no, total)


def slide_report(d, spec, page_no, total):
    """
    「模拟体检报告」页。

    ## 为什么需要这一页
    讲「怎么看体检报告箭头」却不给人看报告长什么样，等于让人凭空想象。
    用户的原话是「光看文字我都看不懂」—— 这是对的：
    **箭头这件事的核心矛盾（同一个符号代表完全不同的严重程度）
    只有把表格画出来才一眼看得出。**

    这一页要讲清的只有一件事：
      「尿酸 448（上限 428）」和「ALT 186（上限 50）」
      在报告上是**两个一模一样的 ↑**，但一个超了 4.7%，一个超了 272%。
    """
    y = 150
    tf = font(F_BOLD, 62)
    while measure(d, spec['title'], tf)[0] > SAFE_W and tf.size > 34:
        tf = font(F_BOLD, tf.size - 2)
    d.text((MARGIN, y), spec['title'], font=tf, fill=INK)
    y += int(tf.size * 1.4) + 18
    d.rectangle([MARGIN, y, W - MARGIN, y + 4], fill=LINE)
    y += 52

    cols = spec['cols']
    rows = spec['rows']
    header_h = 62
    row_h = 82
    pad = 26
    card_x0, card_x1 = MARGIN, W - MARGIN
    card_y0 = y
    card_h = header_h + row_h * len(rows) + 18

    d.rounded_rectangle([card_x0, card_y0, card_x1, card_y0 + card_h],
                        radius=16, fill=(255, 255, 255), outline=LINE, width=2)

    # 表头
    d.rounded_rectangle([card_x0, card_y0, card_x1, card_y0 + header_h],
                        radius=16, fill=(246, 244, 238))
    d.rectangle([card_x0, card_y0 + header_h - 14, card_x1, card_y0 + header_h],
                fill=(246, 244, 238))
    fh = font(F_BOLD, 28)
    cx = card_x0 + pad
    for label, width in cols:
        d.text((cx, card_y0 + 17), label, font=fh, fill=INK_SOFT)
        cx += width

    # 数据行
    xr = card_x0 + pad
    ry = card_y0 + header_h + 6
    for cells in rows:
        name, val, ref, arrow = cells
        hot = arrow is not None
        cx = xr
        f_name = font(F_BOLD if hot else F_REG, 31)
        f_val = font(F_BOLD, 34)
        f_ref = font(F_REG, 28)
        base_y = ry + (row_h - 40) // 2
        d.text((cx, base_y), name, font=f_name, fill=INK)
        cx += cols[0][1]
        vx = cx
        d.text((vx, base_y - 2), val, font=f_val, fill=RED if hot else INK)
        if hot:
            vw = measure(d, val, f_val)[0]
            d.text((vx + vw + 8, base_y - 6), arrow, font=font(F_BOLD, 34), fill=RED)
        cx += cols[1][1]
        d.text((cx, base_y + 2), ref, font=f_ref, fill=INK_SOFT)
        if hot:
            # 用一条极淡的红底把「异常行」框出来
            d.rounded_rectangle([card_x0 + 8, ry + 6, card_x1 - 8, ry + row_h - 8],
                                radius=10, fill=None, outline=(240, 214, 204), width=2)
        ry += row_h

    y = card_y0 + card_h + 54

    # 结论：两行字，把「箭头一样、严重程度差 60 倍」点破
    f_big = font(F_BOLD, 38)
    for wrapped in wrap(d, spec['caption'], f_big, SAFE_W):
        d.text((MARGIN, y), wrapped, font=f_big, fill=INK)
        y += int(f_big.size * 1.55)
    y += 14
    f_sub = font(F_REG, 32)
    for wrapped in wrap(d, spec['sub'], f_sub, SAFE_W):
        d.text((MARGIN, y), wrapped, font=f_sub, fill=INK_SOFT)
        y += int(f_sub.size * 1.55)

    page_footer(d, page_no, total)


def page_footer(d, page_no, total):
    f = font(F_REG, 28)
    d.text((MARGIN, H - 120), '高性价比健康指南', font=f, fill=INK_SOFT)
    t = f'{page_no} / {total}'
    tw, _ = measure(d, t, f)
    d.text((W - MARGIN - tw, H - 120), t, font=f, fill=INK_SOFT)
    d.rectangle([MARGIN, H - 150, W - MARGIN, H - 148], fill=LINE)


def check_safe(d, spec, idx):
    """
    检查「不会被折行的单行文本」是否超出安全宽度。

    ⚠️ 只查单行元素。这里第一版把 `cta` 也算进去了，属于误报——
    `cta` 在 slide_end 里是**会折行**的，按单行量当然超宽。
    会被折行的内容不需要这个检查，不折行的才需要：

      · `sub`     → 单行（黄底块），必须查
      · `notes`   → 单行（封面底部），必须查
      · `items[].head` → 单行（带下划线），必须查
      · `cta`     → 会折行，跳过
      · `title`   → 会自动缩字号，但**只查它缩到下限还放不放得下**

    📌 2026-10-27 的教训：这条注释原来写的是「title 会自动缩字号，跳过」，
    而当时**只有封面实现了自动缩小，收尾页没有** —— 于是
    「4. 驱蚊液怎么选，什么时候必须去医院」在收尾页被右边裁掉了两个字，
    检查却一声不响。**注释里的假设必须和实现对得上**，否则闸门就是摆设。
    """
    bad = []

    # 标题：封面缩到 60px、收尾页缩到 38px 为止。缩到下限仍超宽 = 一定会被裁。
    if spec.get('title'):
        floor = 60 if spec.get('kind') == 'cover' else 38
        f_floor = font(F_BOLD, floor)
        for raw in spec['title'].split('\n'):
            if measure(d, raw, f_floor)[0] > SAFE_W:
                bad.append(f'第{idx+1}页 title「{raw[:12]}…」缩到 {floor}px 仍超宽')

    # sub 只在封面是「固定单行的黄底块」，才需要查宽度。
    # 收尾页和报告页的 sub 走 wrap() 折行，按单行量必然误报
    # （2026-10-28 实测：报告页 124 字的说明被这里判成超宽）。
    if spec.get('sub') and spec.get('kind') == 'cover':
        f = font(F_BOLD, 46)
        if measure(d, spec['sub'], f)[0] > SAFE_W:
            bad.append(f'第{idx+1}页 sub「{spec["sub"][:16]}…」超宽')

    for note in spec.get('notes', []):
        f = font(F_REG, 34)
        if measure(d, '· ' + note, f)[0] > SAFE_W:
            bad.append(f'第{idx+1}页 notes「{note[:16]}…」超宽')

    for item in spec.get('items', []):
        if item.get('head'):
            f = font(F_BOLD, 46)
            if measure(d, item['head'], f)[0] > SAFE_W - 90:
                bad.append(f'第{idx+1}页 head「{item["head"][:16]}…」超宽')

    return bad


# ---------------- 内容：隔夜菜 ----------------

SETS = {
    '隔夜菜会致癌吗': [
        {
            'kind': 'cover',
            'title': '自己带午饭\n隔夜饭会致癌吗',
            'sub': '带饭有几个「雷区」要避开',
            'notes': ['正常冷藏的隔夜菜，亚硝酸盐远低于有害水平',
                      '真正危险的是：室温放太久 + 复热不彻底'],
        },
        {
            'kind': 'items',
            'title': '1. 致癌？被夸大了',
            'items': [
                {'kind': 'do', 'head': '亚硝酸盐的风险被放大了',
                 'body': '正常冷藏 24 小时的蔬菜，亚硝酸盐仍在安全范围内，远低于能引起急性中毒或明显致癌风险的量。'},
                {'kind': 'do', 'head': '真正让亚硝酸盐升高的是「室温放置」',
                 'body': '不是「隔夜」这个时间概念。细菌的硝酸还原酶在室温下活跃，在冷藏下很慢——冷藏才是关键变量。'},
                {'kind': 'note', 'head': '更该减少的是加工肉',
                 'body': '加工肉和腌制品里的亚硝酸盐添加量，比隔夜菜那点变化更值得关注。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 这几类菜，别隔夜带',
            'items': [
                {'kind': 'dont', 'head': '绿叶菜',
                 'body': '隔夜后亚硝酸盐上升相对明显，口感和营养也掉得多。优先当顿吃完。'},
                {'kind': 'dont', 'head': '凉拌菜、沙拉',
                 'body': '没有加热环节，冷藏也拦不住细菌繁殖。想配爽口的，带洗净的小番茄、生黄瓜，中午现拌。'},
                {'kind': 'dont', 'head': '海鲜、河鲜',
                 'body': '易变质，蛋白降解产物多，复热后腥味重。'},
                {'kind': 'dont', 'head': '溏心蛋、半熟蛋',
                 'body': '沙门氏菌风险。带饭的蛋要全熟。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 要带，做好这 4 步',
            'items': [
                {'kind': 'do', 'head': '趁热分装，2 小时内进冰箱',
                 'body': '不要等完全放凉。吃之前先分出来——筷子翻动会引入细菌。'},
                {'kind': 'do', 'head': '用浅而小的容器',
                 'body': '大锅直接放冰箱，中心温度会长时间停在 4–60 ℃ 的危险温度带。'},
                {'kind': 'do', 'head': '加热到中心沸腾，不是「温热」',
                 'body': '微波炉加盖、中途翻动。只热要吃的那份，不要整份反复热。'},
                {'kind': 'do', 'head': '最多复热一次',
                 'body': '反复加热让食物在危险温度带进进出出，风险累加。'},
            ],
        },
        {
            'kind': 'end',
            'title': '4. 米饭要单独提醒',
            'lines': [
                '煮熟的米饭容易被蜡样芽孢杆菌污染。它的芽孢耐热，普通加热杀不死。',
                '所以：米饭不要在室温放过夜（这是「炒饭综合征」的典型来源）。吃不完尽快冷藏，24 小时内吃掉。',
                '总结一句：隔夜菜的风险取决于「怎么存」，不是「隔不隔夜」。',
            ],
            # ⚠️ 这里**不放网址、不放二维码、不放「看主页」**。
            #
            # 小红书的图片检测会做 OCR，站外网址属于导流，可能被限流或审核不通过。
            # 而且图片里的网址**不可点击**，读者要手打域名——转化率接近 0。
            # 为一个几乎带不来访问的网址去冒限流的风险，不划算。
            #
            # 收尾就该给一句能直接用的动作，而不是引流。
            'cta': '明天带饭，就记住一条：\n趁热分装，2 小时内进冰箱。',
        },
    ],

    # ── 第 2 套：秋冬季节选题 ──
    # 选题依据（2026-10-26 数据）：
    #   身体乳（秋冬刚需）150 观看/天，是第二名（洗面奶 14.4/天）的 10 倍；
    #   同期「搜索来源」从 22% 涨到 27%。
    #   → 判据不是「知识点重要吗」，而是「这个月有人会主动去搜它吗」。
    #   「嘴唇干裂」是 10 月底最普遍的自查点，而且是产品词+症状词双高。
    '嘴唇干裂越舔越干': [
        {
            'kind': 'cover',
            'title': '嘴唇干裂\n越舔只会越干',
            'sub': '嘴唇没有皮脂腺，自己不会出油',
            'notes': ['唇膏不「补水」，它是封闭保湿',
                      '想舔的时候，改成涂一层'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么嘴唇特别容易干',
            'items': [
                {'kind': 'do', 'head': '嘴唇没有皮脂腺和汗腺',
                 'body': '它不能自己分泌油脂形成保护膜——这是它比脸更容易干的结构性原因。'},
                {'kind': 'do', 'head': '角质层很薄',
                 'body': '屏障能力弱，水分更容易散失。'},
                {'kind': 'do', 'head': '一直暴露在外',
                 'body': '风吹、干燥、紫外线、唾液，都在持续影响它。'},
                {'kind': 'note', 'head': '所以唇膏不「补水」',
                 'body': '它是封闭保湿——用外来的油脂把水锁住，而不是往里面加水。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 这三件事在加重干裂',
            'items': [
                {'kind': 'dont', 'head': '舔嘴唇',
                 'body': '唾液蒸发会带走更多水分，唾液里的消化酶还会刺激已经很薄的角质层。反复舔 → 干 → 更想舔，形成「舌舔性唇炎」。'},
                {'kind': 'dont', 'head': '撕干皮',
                 'body': '会撕到出血，反而好得更慢。厚涂凡士林软化后让它自然脱落。'},
                {'kind': 'dont', 'head': '用带薄荷的唇膏',
                 'body': '清凉感来自刺激，会让干裂更明显，还容易形成「越用越依赖」的循环。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 选唇膏只看成分表',
            'items': [
                {'kind': 'do', 'head': '有效的成分',
                 'body': '凡士林（最强的封闭剂，几乎不刺激）、矿物油/石蜡/微晶蜡、角鲨烷、神经酰胺。甘油能吸水，但要配合封闭剂。'},
                {'kind': 'dont', 'head': '要避开的成分',
                 'body': '薄荷醇、樟脑、苯酚、水杨酸、香精、色素、丙二醇。'},
                {'kind': 'note', 'head': '一条实用原则',
                 'body': '成分表越短越好，最好以凡士林或蜡为第一位。'},
            ],
        },
        {
            'kind': 'end',
            'title': '4. 怎么涂，什么时候看医生',
            'lines': [
                '一天多次，感觉干就涂，别等到裂开。睡前厚涂一层是最有效的单次操作。',
                '想舔的时候，用「涂唇膏」替换「舔」这个动作——用动作替换动作，比靠自制力管用。',
                '反复干裂脱屑、久不愈合，或出现白斑、色素改变、硬结，要看皮肤科（可能是唇炎或其他问题）。',
            ],
            'cta': '今天想舔嘴唇的时候，\n换成涂一层。',
        },
    ],
    '广东10月还在防蚊': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 9 篇',
            'title': '广东 10 月\n还在防蚊？',
            'sub': '你喷的驱蚊液，救不了你',
            'notes': ['省疾控《10月风险提示》：登革热排第一位',
                      '第一条建议不是喷药，是倒掉家里的积水'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么 10 月还要防蚊',
            'items': [
                {'kind': 'note', 'head': '登革热、基孔肯雅热，官方排第一',
                 'body': '广东省疾控《2026年10月广东省健康风险提示》把这两种病列在本月重点关注的第一位，排在流感和诺如前面。'},
                {'kind': 'note', 'head': '9—10 月是广东的蚊媒高峰',
                 'body': '官方原文：每年 9—10 月为我省蚊媒传染病流行高峰，近期气候条件仍适宜媒介伊蚊生长繁殖。'},
                {'kind': 'note', 'head': '都靠伊蚊叮咬，不人传人',
                 'body': '所以灭蚊就等于防病，没有第二条途径。喷药和清积水，做的是同一件事的两头。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 驱蚊液，管不了源头',
            'items': [
                {'kind': 'dont', 'head': '它只挡住已经飞出来的那只',
                 'body': '蚊子在静止的积水里产卵，卵、幼虫、蛹全在水里。你不清积水，灭的只是成虫，下一批还在长。'},
                {'kind': 'do', 'head': '官方第一条建议就是「清积水」',
                 'body': '疾控的原话是「消除伊蚊孳生环境」——翻盆倒罐、加盖、水培改土培、水中养鱼。'},
                {'kind': 'note', 'head': '最容易漏的几个地方，都在你自己家',
                 'body': '花盆托盘、空调外机接水盘、饮水机接水盘、水培植物。这些容器常年有水，又看不见。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 周末花 10 分钟清一遍',
            'items': [
                {'kind': 'do', 'head': '花盆托盘：每周倒一次',
                 'body': '家庭里最常见的积水容器，也是最容易被忽略的一个。倒掉、擦干。'},
                {'kind': 'do', 'head': '空调外机接水盘、饮水机接水盘',
                 'body': '常年有水、平时看不见。掀开盖子倒掉，顺手擦干。'},
                {'kind': 'do', 'head': '废弃容器、轮胎、竹筒、树洞',
                 'body': '能扔的扔掉；扔不掉的就戳孔排水或加盖。'},
                {'kind': 'do', 'head': '水培植物每周换水，排水沟保持畅通',
                 'body': '换水时顺便冲一下根部。想彻底省事，就把水培改成土培。'},
            ],
        },
        {
            'kind': 'end',
            'title': '4. 驱蚊液怎么选，什么时候必须去医院',
            'lines': [
                '认准这四种成分：避蚊胺（DEET 10–30%）、派卡瑞丁（20%）、驱蚊酯（IR3535）、柠檬桉油（PMD，3 岁以下不用）。',
                '没有可靠效果的：驱蚊手环、驱蚊贴、超声波驱蚊器、口服维生素 B1。',
                '出现「高热 + 剧烈头痛 + 眼眶痛 + 肌肉关节痛 + 皮疹」——这是登革热的典型表现，立即就医，并主动告诉医生你住在哪、最近去过哪。',
            ],
            'cta': '这个周末，\n先把花盆托盘倒一次。',
        },
    ],
    '体检报告的箭头要紧吗': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 10 篇',
            'title': '体检报告上的\n箭头要紧吗？',
            'sub': '箭头 ≠ 有病',
            'notes': ['参考区间按健康人群中间 95% 划定',
                      '所以每 20 个健康人就有 1 个「超标」'],
        },
        {
            'kind': 'report',
            'title': '两个箭头，长得一模一样',
            'cols': [('项目', 360), ('结果', 190), ('参考区间', 300)],
            'rows': [
                ('白细胞', '6.2', '3.5–9.5', None),
                ('血红蛋白', '152', '130–175', None),
                ('尿酸', '448', '208–428', '↑'),
                ('丙氨酸氨基转移酶', '186', '9–50', '↑'),
                ('空腹血糖', '5.1', '3.9–6.1', None),
            ],
            'caption': '尿酸 448，上限 428 —— 超出 4.7%。ALT 186，上限 50 —— 超出 272%。',
            'sub': '但在报告上，它们是两个一模一样的「↑」。报告只说「超了」，不说「超多少」——所以拿到报告的第一件事，是去看具体数值，不是看有没有箭头。',
        },
        {
            'kind': 'items',
            'title': '1. 箭头到底在说什么',
            'items': [
                {'kind': 'note', 'head': '参考区间 ≠ 你的健康目标',
                 'body': '把一群健康人的测定值排序，去掉两端各 2.5%，剩下中间 95% 就是参考区间。它描述的是「大多数健康人落在哪」，不是「多少算健康」。'},
                {'kind': 'note', 'head': '健康人也会出现箭头',
                 'body': '按定义，每 20 个健康人里就有 1 个某项超出。而一次体检查几十项——出现一两个箭头几乎是必然的。这在统计上叫「多重比较」：指标越多，偶然异常越多。'},
                {'kind': 'note', 'head': '反过来也成立：没箭头不等于没事',
                 'body': '有的人在「正常范围内」的数值，对自己已经异常；而且早期肿瘤、部分慢性病本来就不在常规指标里。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 先分类，别先紧张',
            'items': [
                {'kind': 'do', 'head': '轻度超出（刚过线一点点）',
                 'body': '最常见。多和当天状态有关：前一晚没睡好、没空腹、剧烈运动、感冒、月经期、喝水太少。'},
                {'kind': 'do', 'head': '明显超出（超出较多，或几项一起偏）',
                 'body': '需要认真对待，通常要进一步检查，别拖到明年体检。'},
                {'kind': 'dont', 'head': '只盯着「有没有箭头」',
                 'body': '超 1% 和超 500% 都只显示一个箭头，临床意义天差地别。拿到报告先看具体数值和参考区间，算一下超了多少。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 读报告的正确顺序',
            'items': [
                {'kind': 'do', 'head': '① 先分清：这份是筛查还是诊断',
                 'body': '两者判断阈值的逻辑不同。体检报告多是筛查，它回答的是「要不要进一步查」，不是诊断结论。'},
                {'kind': 'do', 'head': '② 看四列，不是只看结果',
                 'body': '项目名 + 结果 + 单位 + 参考区间。单位最容易出错：mg/dL 和 mmol/L 差十几倍，换算错会得出相反结论。'},
                {'kind': 'do', 'head': '③ 一组一起看，不要一项一项看',
                 'body': '肝功不能只看一项转氨酶；血常规要红系白系血小板一起；单看肌酐会漏掉老年人的肾功能下降。'},
                {'kind': 'do', 'head': '④ 和同一家医院的历史比趋势',
                 'body': '参考区间绑定检测系统，换一家医院「正常范围」就会变，两次结果不能跨机构直接比。趋势比单点更有信息量。'},
            ],
        },
        {
            'kind': 'end',
            'title': '4. 这几种，别等复查',
            'lines': [
                '血常规里白细胞明显升高或降低、血红蛋白明显偏低、血小板明显降低；便潜血阳性。',
                '肿瘤标志物成倍升高或多项同时升高；空腹血糖明显升高；肌酐升高、尿蛋白阳性。',
                '影像报告出现「占位」「建议进一步检查」「形态不规则」，或 BI-RADS／TI-RADS 4 类及以上。',
                '一句话总结：单项轻度偏离通常只要复查；一组同方向异常，才需要尽快就诊。',
            ],
            'cta': '把每年的报告留着，\n趋势比任何一次单点都更有用。',
        },
    ],
    '发烧别急着吃布洛芬': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 11 篇',
            'title': '发烧 39℃\n先别吃布洛芬',
            'sub': '广东还在「双热」活跃期',
            'notes': ['登革热、基孔肯雅热都由白纹伊蚊叮咬传播',
                      '确诊前吃布洛芬或阿司匹林，会增加出血风险'],
        },
        {
            'kind': 'items',
            'title': '1. 都 11 月了，为什么还要防',
            'items': [
                {'kind': 'note', 'head': '今年广东是暖冬',
                 'body': '广东省疾控明确提醒：叠加暖冬，由蚊子传播的登革热和基孔肯雅热，依旧处于活跃期。'},
                {'kind': 'note', 'head': '两种病都是「花蚊子」传的',
                 'body': '白纹伊蚊。它白天也咬人，尤其清晨和傍晚。所以「晚上才点蚊香」挡不住它。'},
                {'kind': 'note', 'head': '早期症状非常像，容易混',
                 'body': '两者都可能突然高烧、剧烈疼痛、出皮疹。普通人分不出来，也不需要自己分——分不清的时候，交给医生。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 出现这三个信号要当心',
            'items': [
                {'kind': 'dont', 'head': '信号一：突发高烧',
                 'body': '体温迅速升到 39℃ 以上，而不是慢慢烧起来。'},
                {'kind': 'dont', 'head': '信号二：剧烈疼痛',
                 'body': '登革热是头痛、眼眶痛、全身肌肉和骨关节痛（所以叫「断骨热」）；基孔肯雅热的关节痛更突出、更持久，可能持续数周甚至数月。'},
                {'kind': 'dont', 'head': '信号三：皮疹',
                 'body': '发烧后期或退烧之后，四肢或躯干出现红疹。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 为什么不能自己吃布洛芬',
            'items': [
                {'kind': 'dont', 'head': '这是官方明确要求，不是我吓你',
                 'body': '广东省疾控在「双热」防控提示里写得很直白：确诊前不要自行服用布洛芬、阿司匹林等退烧止痛药。'},
                {'kind': 'note', 'head': '两个原因',
                 'body': '① 这类药会增加出血风险；② 退烧后症状被掩盖，医生更难判断。'},
                {'kind': 'note', 'head': '那烧到 39℃ 怎么办',
                 'body': '先就医（发热门诊、感染科或急诊）。不要自己先吃一片「压下去」，也别等第二天。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 疑似感染，就三步',
            'items': [
                {'kind': 'do', 'head': '① 立即就医，不要拖',
                 'body': '去发热门诊、感染科或急诊。'},
                {'kind': 'do', 'head': '② 主动说两句话',
                 'body': '「我最近被蚊子咬过」「我刚从外地或国外回来」。这两句能帮医生快速判断，帮你省时间。'},
                {'kind': 'do', 'head': '③ 别自己先用药',
                 'body': '确诊前不吃布洛芬、阿司匹林。这一点上面已经说过，但它是最容易被忽略的一条。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 日常防护，还是那三件事',
            'lines': [
                '清积水：花盆托盘、闲置瓶罐、空调水托盘。无积水就无蚊虫。',
                '灭成蚊：检查纱窗有没有破损，用电蚊拍或正规灭蚊气雾剂。',
                '防叮咬：外出穿浅色长袖衣裤，裸露皮肤涂驱蚊剂。',
                '「双热」没有特效药，但都可防、可控、可治——不用恐慌，也别当没事。',
            ],
            'cta': '发烧的时候先想一件事：\n我最近被蚊子咬过吗？',
        },
    ],
    '免洗洗手液挡不住诺如': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 12 篇',
            'title': '免洗洗手液\n挡不住诺如',
            'sub': '酒精对它没用',
            'notes': ['诺如 10 月到次年 3 月是高峰',
                      '它是「无包膜病毒」，酒精破坏不了'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么酒精偏偏对诺如无效',
            'items': [
                {'kind': 'note', 'head': '酒精是怎么杀菌的',
                 'body': '它靠让蛋白质变性、破坏细菌的膜和有包膜病毒的脂质包膜。关键在「包膜」这两个字。'},
                {'kind': 'note', 'head': '诺如是「无包膜病毒」',
                 'body': '诺如、轮状、甲肝都没有脂质包膜可破坏，所以耐酒精。同理还有艰难梭菌的芽孢——结构致密，也杀不死。'},
                {'kind': 'note', 'head': '不是「效果差一点」',
                 'body': '是作用谱上有一个明确的空洞，而这个空洞恰好对应最常引起腹泻暴发的那几种病原体。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 免洗洗手液到底管什么',
            'items': [
                {'kind': 'do', 'head': '大多数细菌、流感、新冠',
                 'body': '这些能被破坏膜结构，酒精含量 60%–95% 时有效。'},
                {'kind': 'dont', 'head': '诺如、轮状病毒',
                 'body': '效果差。这不是用法问题，是成分对不上。'},
                {'kind': 'dont', 'head': '手上有可见污垢、油污、血',
                 'body': '无效。酒精穿不透有机物，脏的时候必须先用水洗。'},
                {'kind': 'note', 'head': '所以它的定位是「没水时的补充」',
                 'body': '不是替代品。手边有流动水的时候，它不该是第一选择。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 有效的洗手就四条',
            'items': [
                {'kind': 'do', 'head': '① 用肥皂，用流动水',
                 'body': '起泡但要冲掉的都算。免洗型是另一回事。'},
                {'kind': 'do', 'head': '② 搓够 20 秒',
                 'body': '大约唱两遍生日歌。效果取决于时长和覆盖范围，不取决于洗的是什么牌子。'},
                {'kind': 'do', 'head': '③ 六个部位都要到',
                 'body': '手心、手背、指缝、指尖、拇指、手腕。指缝和指尖最容易漏。'},
                {'kind': 'do', 'head': '④ 关键时刻洗',
                 'body': '做饭前后、处理生肉后、上厕所后、擤鼻涕后、外出回家后。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 诺如季，还有三件事',
            'items': [
                {'kind': 'do', 'head': '贝类海鲜煮熟煮透',
                 'body': '不喝生水，蔬菜瓜果洗净。诺如常经食物和水传播。'},
                {'kind': 'do', 'head': '呕吐物要用含氯消毒剂',
                 'body': '不是酒精。处理时戴手套和口罩，别直接用手接触。'},
                {'kind': 'do', 'head': '生病时的动作',
                 'body': '出现恶心、呕吐、腹泻，及时就医并居家休息，别带病做饭、别带病上班上学。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 别把免洗洗手液扔了',
            'lines': [
                '它仍然有用——在没水的时候、在通勤路上、在带孩子出门的时候，它是补充。',
                '但它不是「洗手的替代品」，尤其挡不住诺如这类无包膜病毒。',
                '诺如 10 月到次年 3 月是高峰，这段时间手边有水，就用水。',
            ],
            'cta': '今天洗手的时候，\n顺便把指缝和指尖搓一下。',
        },
    ],
    '流感疫苗11月还来得及吗': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 13 篇',
            'title': '流感疫苗\n11 月还来得及吗',
            'sub': '来得及，但别拖',
            'notes': ['今年多地报告流感季比往年提前',
                      '接种后约 2 周产生保护性抗体'],
        },
        {
            'kind': 'items',
            'title': '1. 今年有个前提变了',
            'items': [
                {'kind': 'note', 'head': '流感季提前了',
                 'body': '广东多地已报告流感提前进入高发期。往年这个时间还没起来，今年已经在爬坡。'},
                {'kind': 'note', 'head': '这意味着两件事',
                 'body': '① 你现在还在「高峰之前」这个窗口里；② 但窗口不会一直开着——接种后要 2 周才产生抗体。'},
                {'kind': 'note', 'head': '所以「还来得及」是有期限的',
                 'body': '不是「随时都行」。现在打，抗体正好赶上高峰；拖到 12 月再打，就变成高峰中了。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 误会一：去年打过，今年不用',
            'items': [
                {'kind': 'dont', 'head': '这是最常见的误会',
                 'body': '很多人觉得「我去年打了」，今年就跳过。流感疫苗是唯一每年都要打的成人疫苗之一。'},
                {'kind': 'do', 'head': '原因一：毒株每年在换',
                 'body': '流感病毒变异快，世界卫生组织每年根据全球监测结果更新疫苗配方。去年那针防的是去年的毒株。'},
                {'kind': 'do', 'head': '原因二：抗体在下降',
                 'body': '接种后的抗体水平会随时间下降。到第二年，即使毒株没变，保护也已经弱了很多。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 误会二：11 月太晚了',
            'items': [
                {'kind': 'dont', 'head': '很多人以为「要 9 月打」',
                 'body': '这是一个流传很广的说法。9–10 月接种确实好，但「过了就不打」是错的。'},
                {'kind': 'do', 'head': '接种后约 2 周产生抗体',
                 'body': '只要流感还在流行，季中接种就仍然有保护价值。现在打，正好赶上高峰前。'},
                {'kind': 'note', 'head': '一个判断标准',
                 'body': '看「流感还在不在流行」，而不是看「现在几月」。流行期没结束，接种就还有意义。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 谁最该现在去打',
            'items': [
                {'kind': 'do', 'head': '所有人 ≥6 月龄都能打',
                 'body': '这不是「高危人群专属」。健康成年人打，主要是减少自己患病和传给家人。'},
                {'kind': 'do', 'head': '但这几类人优先级最高',
                 'body': '65 岁以上老人、儿童、孕妇、慢性病患者（糖尿病、慢阻肺、心脏病、肾病、肝硬化）、医务人员。'},
                {'kind': 'do', 'head': '孕妇可以打，而且推荐',
                 'body': '灭活流感疫苗在孕期是推荐的——因为孕妇得流感后并发症风险更高。具体听产科医生。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 打了还会得吗',
            'lines': [
                '有可能。疫苗降低风险，但不等于 100% 保护——所以流行期在高风险场所仍然要注意。',
                '但打了之后即使感染，重症和并发症的风险通常也更低。这是接种最实在的收益。',
                '灭活流感疫苗不含活病毒，不会让你得流感。接种后低热、酸痛是免疫应答，通常 1–2 天缓解。',
            ],
            'cta': '如果今年还没打，\n这周可以去社区接种门诊问一次。',
        },
    ],
    '手脚冰凉不是体寒': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 14 篇',
            'title': '手脚冰凉\n不是「体寒」',
            'sub': '是血管在保护你',
            'notes': ['冷的时候四肢血管收缩，血液优先供应核心器官',
                      '但单侧、持续、伴颜色变化的凉，要查原因'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么会凉',
            'items': [
                {'kind': 'note', 'head': '这是身体的保命反应',
                 'body': '冷的时候，交感神经让四肢血管收缩，把血液优先供应心脏、大脑这些核心器官。手脚离心脏最远，本来就是「优先被牺牲」的部位。'},
                {'kind': 'note', 'head': '所以有人更明显',
                 'body': '女性、体型偏瘦、末梢循环有差异的人更明显。这不是病，是身体的配置不同。'},
                {'kind': 'note', 'head': '「体寒」这个词帮不上忙',
                 'body': '它没有可检验的标准，所以没法用来回答「这次要不要去医院」。而下面这类凉，是真的需要查的。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 「喝热水」为什么不管用',
            'items': [
                {'kind': 'dont', 'head': '它只暖了口腔和食道',
                 'body': '四肢血管该收缩还是收缩。热饮带来的温暖感通常十几分钟就过去了。'},
                {'kind': 'dont', 'head': '「调理体寒」没有具体做法',
                 'body': '做什么、做多久、怎么算有效，都没有标准。花在这上面的钱很难衡量回报。'},
                {'kind': 'do', 'head': '真正有用的是「锁住静止空气」',
                 'body': '三层穿法：贴身层排汗（别穿纯棉）、中间层保温、外层防风。干燥的蓬松层才保暖，压扁的和湿的都不行。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 这几种凉，别拖',
            'items': [
                {'kind': 'dont', 'head': '手指反复「白→紫→红」',
                 'body': '或伴关节痛、皮疹。建议去风湿免疫科评估。'},
                {'kind': 'dont', 'head': '长期怕冷，还伴乏力、体重增加、便秘',
                 'body': '建议查甲状腺功能。这已经不是「手脚凉」的问题了。'},
                {'kind': 'dont', 'head': '只有一侧凉，另一侧正常',
                 'body': '提示可能是血管方面的问题，要查清楚。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 保暖最容易做错的两件事',
            'items': [
                {'kind': 'dont', 'head': '穿太厚，出汗',
                 'body': '出汗会打湿衣服，一停下来体温反而掉得更快。正确做法是「出门时略感偏凉」，热了脱一层、冷了加一层。'},
                {'kind': 'dont', 'head': '鞋袜太紧',
                 'body': '太紧会压迫血管，反而更冷。鞋要稍宽松。脚部最重要的是干燥——湿袜子会迅速带走热量。'},
                {'kind': 'do', 'head': '重点护住四个部位',
                 'body': '头部、颈部、手部、脚部。这四个地方的热量散失最快，收益也最高。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 一句话总结',
            'lines': [
                '手脚凉多数不是「身体差」，是身体在省热量——把资源优先留给核心器官。',
                '所以有效的做法很朴素：穿对三层、保持干燥、别穿太紧。不是喝热水，也不是「调理」。',
                '但有一小部分凉不是这个机制：单侧、持续、伴颜色变化或疼痛的，要去查原因，别自己扛。',
            ],
            'cta': '天冷了，\n先看看鞋是不是挤脚。',
        },
    ],
    '加湿器里加什么水': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 15 篇',
            'title': '加湿器里\n你加的是什么水',
            'sub': '加错了，会雾化进肺里',
            'notes': ['超声波加湿器把水打成 1–5 μm 的液滴',
                      '这个粒径恰好能进肺泡'],
        },
        {
            'kind': 'items',
            'title': '1. 「加湿器肺炎」不是加湿器有毒',
            'items': [
                {'kind': 'note', 'head': '是脏水被雾化后吸进了肺里',
                 'body': '超声波加湿器把水打成 1–5 μm 的液滴。这个粒径恰好能进入肺泡——也就是说，水箱里有什么，就有机会直接进到肺里。'},
                {'kind': 'note', 'head': '它不制造病菌，只是「搬运」',
                 'body': '加湿器本身不产生细菌。但水箱长期存水、内壁长生物膜，再被雾化出来，就等于把细菌直接送进呼吸道。'},
                {'kind': 'note', 'head': '所以「加什么水」不是小事',
                 'body': '同样一台机器，加纯净水和加自来水，你吸进去的东西不一样。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 用什么水，要看机型',
            'items': [
                {'kind': 'do', 'head': '纯净水、蒸馏水（推荐）',
                 'body': '几乎不含矿物质，不产生白粉。超声波式必须用这个。'},
                {'kind': 'dont', 'head': '超声波式 + 自来水',
                 'body': '不推荐。它会把钙镁、氯仿随水雾喷进空气，还会在家具上留下一层白粉。'},
                {'kind': 'do', 'head': '蒸发式 + 自来水',
                 'body': '多数机型可以。蒸发式只让水分子挥发，矿物质留在机器里。但仍要定期清洁。'},
                {'kind': 'dont', 'head': '矿泉水',
                 'body': '不推荐。含矿物质，会产生白粉——「矿泉水更干净」在这里是反的。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 这三样，绝对不要加',
            'items': [
                {'kind': 'dont', 'head': '醋',
                 'body': '「加醋杀菌」是个流传很广的做法，但雾化后的酸性液滴会直接刺激气道。'},
                {'kind': 'dont', 'head': '精油',
                 'body': '香是香，但雾化后成分直接进肺。想闻香，用扩香，别用加湿器。'},
                {'kind': 'dont', 'head': '消毒剂',
                 'body': '有害，而且会让你误以为水已经干净了——真正该做的是洗水箱，不是往里倒东西。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 比水更重要的，是清洁',
            'items': [
                {'kind': 'do', 'head': '每天：倒掉剩水、洗水箱、擦干',
                 'body': '不要留着水过夜再用。这一条能解决大部分问题。'},
                {'kind': 'do', 'head': '每 3–7 天：彻底洗一次',
                 'body': '水箱、水槽、雾化片或蒸发芯、接缝和密封圈都要洗到，冲净后完全晾干。'},
                {'kind': 'do', 'head': '每周：除一次水垢',
                 'body': '水垢是生物膜的附着面。用白醋或柠檬酸泡，然后彻底冲净，别留残留。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 三句话收尾',
            'lines': [
                '加湿器不是「让房间变湿」，是把水打成雾送进你肺里——所以水要纯净、机器要干净。',
                '湿度到 40%–60% 就够，最好 50% 上下。已经 50% 以上还继续加，是在给尘螨和霉菌创造条件。',
                '每天倒水擦干、每 3–7 天彻底洗、每周除垢。这三件事比买多贵的机器都重要。',
            ],
            'cta': '今晚先做一件事：\n把水箱里的剩水倒掉。',
        },
    ],
    '保温杯里哪些东西不能装': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 16 篇',
            'title': '保温杯里\n哪些东西不能装',
            'sub': '尤其是牛奶和豆浆',
            'notes': ['「不锈钢什么都装」是错的',
                      '耐腐蚀 ≠ 不腐蚀，划痕处更容易出问题'],
        },
        {
            'kind': 'items',
            'title': '1. 先说一个反常识',
            'items': [
                {'kind': 'note', 'head': '耐腐蚀 ≠ 不腐蚀',
                 'body': '304/316 是食品级奥氏体不锈钢，耐腐蚀性好。但酸性、高盐、长期接触仍可能造成金属迁移——尤其内胆有划痕的时候。'},
                {'kind': 'note', 'head': '所以「不锈钢能装一切」不成立',
                 'body': '它不是惰性材料。装什么、装多久，都影响它会不会「还回来一点东西」。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 这几样，别长期装',
            'items': [
                {'kind': 'dont', 'head': '果汁、酸梅汤这类酸的',
                 'body': '酸性会加速金属腐蚀，也影响口感。想喝就喝完，别泡一整天。'},
                {'kind': 'dont', 'head': '浓盐水、中药',
                 'body': '同上。长期接触不合适，尤其内胆已有划痕时。'},
                {'kind': 'dont', 'head': '牛奶、豆浆长时间保温',
                 'body': '这是微生物繁殖的温床。要么 2 小时内喝完，要么改用能冷藏的容器。'},
                {'kind': 'dont', 'head': '碳酸饮料',
                 'body': '除了酸，还有个风险：密闭升温后内压升高，开盖可能喷溅甚至崩开。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 保温杯不是锅',
            'items': [
                {'kind': 'dont', 'head': '别用它焖粥、焖蛋',
                 'body': '温度不够持续、也不均匀。长时间焖煮食物有微生物风险，不是「省事」，是「省错地方」。'},
                {'kind': 'do', 'head': '要焖煮，用保温焖烧罐',
                 'body': '那种是专门设计来焖煮的，按说明做。普通保温杯只适合装已经做好的热饮。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 杯子本身也该换',
            'items': [
                {'kind': 'dont', 'head': '内胆有划痕、涂层脱落、异味洗不掉',
                 'body': '直接换。划痕是藏污和腐蚀的起点，洗不掉的异味说明生物膜已经形成了。'},
                {'kind': 'dont', 'head': '别用钢丝球擦内胆',
                 'body': '会留下划痕，反而让杯子更快报废。'},
                {'kind': 'do', 'head': '每天倒空、冲洗、晾干',
                 'body': '不要一直有水闷着。'},
                {'kind': 'do', 'head': '杯盖、吸管、密封圈拆开洗',
                 'body': '这是最容易被忽略、也最容易长霉的地方。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 一句话总结',
            'lines': [
                '保温杯真正要管的不是「保不保温」，是「装对东西 + 保持干净」。',
                '牛奶豆浆 2 小时内喝完；酸的和浓盐水别长期装；碳酸饮料少装。',
                '有异味、有划痕、涂层脱落，就换——一个杯子几十块，不值得冒这个险。',
            ],
            'cta': '现在打开你的保温杯，\n闻一下杯盖的密封圈。',
        },
    ],
    '火锅刚捞出来的能直接吃吗': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 17 篇',
            'title': '火锅刚捞出来\n能直接吃吗',
            'sub': '65℃ 以上是 2A 类',
            'notes': ['食管黏膜的耐受温度比口腔低',
                      '「嘴里不觉得烫」不等于食管没事'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么「烫」是件事',
            'items': [
                {'kind': 'note', 'head': '65 ℃ 以上，被列为 2A 类',
                 'body': '世界卫生组织下属的国际癌症研究机构（IARC）把 65 ℃ 以上的热饮列为 2A 类——很可能致癌，主要关联食管癌。'},
                {'kind': 'note', 'head': '食管比嘴怕烫',
                 'body': '食管黏膜的耐受温度比口腔低。所以「嘴里不觉得烫」，不代表食管没事——你觉得刚好的温度，对食管可能已经偏高。'},
                {'kind': 'note', 'head': '机制是反复损伤',
                 'body': '反复热损伤 → 黏膜反复发炎、修复增生 → 每次细胞分裂都有突变机会。这是慢性刺激促进癌变的一般机制。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 判断标准只有一条',
            'items': [
                {'kind': 'do', 'head': '入口不烫，能一口接一口连续喝',
                 'body': '这就是安全的。不用记温度计，用嘴巴判断就行。'},
                {'kind': 'dont', 'head': '「我一直这么吃也没觉得烫」',
                 'body': '这不能当标准。长期吃烫食的人，对温度的敏感度会下降——会越吃越烫。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 火锅里最容易踩的坑',
            'items': [
                {'kind': 'dont', 'head': '丸子和豆腐的内部',
                 'body': '刚捞出来时，外面不烫了、里面还很烫。咬开就中招。先放碗里、切开、等一会儿。'},
                {'kind': 'dont', 'head': '「趁热吃」的习惯',
                 'body': '「趁热」被当成关心的代名词，但它其实是个模糊的建议。食物该吃，温度降下来再吃就行，不损失什么。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 还有三个场景',
            'items': [
                {'kind': 'do', 'head': '热茶、热水：倒出来放 3–5 分钟',
                 'body': '刚烧开的水远高于 65 ℃。'},
                {'kind': 'do', 'head': '热汤、热粥：刚离火的温度很危险',
                 'body': '尤其是上面飘着油、看起来不冒烟的——油层会锁住热气。'},
                {'kind': 'do', 'head': '保温杯：它保温的能力也是风险',
                 'body': '它能让液体长时间停在高温。倒出来晾一会儿再喝。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 什么时候别自己观察，去医院',
            'lines': [
                '吞咽困难、或吞咽疼痛持续超过 2 周。',
                '不明原因的体重下降；反复的胸骨后烧灼感。',
                '有食管癌家族史，或来自高发地区——这类情况更要留意。',
                '最后说一句：这不是「不能吃火锅」，是「捞出来先放碗里，切开，等一会儿」。',
            ],
            'cta': '下次夹起丸子，\n先咬一小口试试温度。',
        },
    ],
    '在家量血压多少才算高': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 18 篇',
            'title': '在家量血压\n多少才算高',
            'sub': '不是 140/90',
            'notes': ['家庭自测的高血压线是 135/85',
                      '这是等效值，不是「更严格的人为标准」'],
        },
        {
            'kind': 'items',
            'title': '1. 家里的线，比医院低',
            'items': [
                {'kind': 'note', 'head': '两条线不一样',
                 'body': '诊室 140/90，家庭自测 135/85。很多人不知道这两条线不同，所以在家量到 138/86，会觉得「没到 140 就还好」——按家庭标准其实已经超了。'},
                {'kind': 'note', 'head': '为什么低：这是换算，不是加严',
                 'body': '人群研究发现，家庭自测平均值 135/85 对应的心血管风险，和诊室 140/90 相当。所以它不是谁划得更严，是等效值。'},
                {'kind': 'note', 'head': '诊室还有两个偏差',
                 'body': '一是「白大衣效应」——紧张让一部分人诊室偏高、在家正常；二是「隐匿性高血压」——诊室正常、日常偏高。后者更危险，因为会被漏诊。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 量之前 30 分钟，这几件事别做',
            'items': [
                {'kind': 'dont', 'head': '咖啡、浓茶、吸烟、饮酒',
                 'body': '都会让读数偏高。'},
                {'kind': 'dont', 'head': '憋尿测',
                 'body': '憋尿会显著抬高读数。先上厕所，再测。'},
                {'kind': 'do', 'head': '静坐 5 分钟',
                 'body': '不说话、不看手机。这一步最容易被跳过，而它造成的偏差往往比设备误差更大。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 设备和姿势，错了就白量',
            'items': [
                {'kind': 'do', 'head': '必须上臂式',
                 'body': '不要腕式、不要手指式。腕部动脉细、容易因手腕位置偏移而失真。'},
                {'kind': 'do', 'head': '背靠椅背，双脚平放不翘腿',
                 'body': '上臂裸露或只隔一层薄衣，别把厚袖子卷起来测——卷起的袖子会压迫血管。'},
                {'kind': 'do', 'head': '袖带中心与心脏同高',
                 'body': '把上臂放在桌上。手臂悬空或位置过低，读数都会偏高。'},
                {'kind': 'do', 'head': '袖带下缘在肘窝上 2–3 厘米',
                 'body': '缠好后能塞进一根手指为宜——太松偏高，太紧偏低。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 测一次，不算数',
            'items': [
                {'kind': 'do', 'head': '每次测 2 遍，间隔 1 分钟',
                 'body': '取两次的平均值。如果两次相差超过 5 mmHg，再测第 3 次，取后两次的平均。'},
                {'kind': 'do', 'head': '早晚各一次，连测 7 天',
                 'body': '早上在起床后 1 小时内、排尿后、服降压药之前、早饭前；晚上在睡前。去掉第一天再取平均——第一天往往偏高。'},
                {'kind': 'dont', 'head': '不要一天反复测十几次',
                 'body': '越紧张读数越高，反复测只会陷进焦虑循环。一天固定早晚各一次就够。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 什么情况该去医院',
            'lines': [
                '连续多天家庭自测达到或超过 135/85 —— 需要评估是不是高血压，或要不要调整用药。',
                '≥ 180/120 且伴头痛、胸痛、呼吸困难、视力模糊、肢体无力或说话不清 —— 立即就医或叫急救。',
                '双臂血压差持续超过 10–15 mmHg，或血压突然明显低于平常并伴头晕 —— 也要查。',
            ],
            'cta': '明早起床后、排尿后、吃药前，\n量一次看看。',
        },
    ],
    '躺下睡不着该起来还是继续躺': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 19 篇',
            'title': '躺下睡不着\n该起来还是继续躺',
            'sub': '20 分钟就该起',
            'notes': ['躺着睡不着，会让大脑把「床」和「清醒焦虑」绑在一起',
                      '慢性失眠的一线治疗不是安眠药'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么「硬躺」是错的',
            'items': [
                {'kind': 'dont', 'head': '躺着睡不着，越躺越焦虑',
                 'body': '大脑会慢慢把「床」和「清醒 + 焦虑」绑在一起。几次之后，你一上床就清醒——这不是失眠加重了，是条件反射形成了。'},
                {'kind': 'do', 'head': '躺下约 20 分钟睡不着，就起来',
                 'body': '离开卧室，做点单调安静的事：读纸质书、听舒缓的音频。有困意再回床。'},
                {'kind': 'do', 'head': '床只留给睡觉',
                 'body': '不刷手机、不看剧、不办公、不吃饭。让「上床」这个动作重新只意味着睡觉。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 更反直觉的是：固定起床时间',
            'items': [
                {'kind': 'note', 'head': '重点不是「几点睡」，是「几点起」',
                 'body': '每天同一时间起床，包括周末。起床时间锚定了生物钟，比纠结几点睡有用得多。'},
                {'kind': 'note', 'head': '因为你能控制的只有起床',
                 'body': '你没法命令自己几点睡着，但能命令自己几点起。睡眠这件事，从「能控制的那一端」入手才有效。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 睡眠限制：躺得越少，睡得越好',
            'items': [
                {'kind': 'note', 'head': '先算你实际睡多久',
                 'body': '记一周睡眠日记，算出平均实际睡着时长——比如 5.5 小时。然后把卧床时间压缩到「这个时长 + 30 分钟」。'},
                {'kind': 'note', 'head': '为什么反着来有效',
                 'body': '这是在制造轻度的睡眠压力，让「上床就能睡着」重新成立。等这段时间能睡满 85% 以上，再每周提前 15–20 分钟上床。'},
                {'kind': 'dont', 'head': '白天不要补觉',
                 'body': '一补觉，这条就失效了。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 四个加重因素',
            'items': [
                {'kind': 'dont', 'head': '下午 2 点后的咖啡因',
                 'body': '咖啡、浓茶都算。咖啡因的半衰期有 5 小时左右，下午喝的一杯，到睡前还在起效。'},
                {'kind': 'dont', 'head': '睡前喝酒',
                 'body': '酒精让人更快入睡，但后半夜容易醒、睡眠变浅。这是「睡了个假觉」的典型。'},
                {'kind': 'dont', 'head': '午睡过长',
                 'body': '控制在 20–30 分钟，且不晚于下午 3 点。'},
                {'kind': 'dont', 'head': '睡前刷手机',
                 'body': '重点不是「蓝光」，是内容让大脑兴奋，以及刷着刷着挤占了睡眠时间。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 偶尔睡不好，和慢性失眠不是一回事',
            'lines': [
                '偶尔一两晚睡不好，不用慌，也不用立刻吃药。',
                '但如果是每周三次以上、持续三个月以上，那叫慢性失眠——它的一线治疗是失眠认知行为治疗（CBT-I），不是安眠药。这是各主要指南一致的推荐。',
                '记两周睡眠日记再去就医，医生最需要的就是这个。',
            ],
            'cta': '今晚试一件事：\n不管几点睡着，明天同一个时间起。',
        },
    ],
    '在家测血糖多少才算高': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 20 篇',
            'title': '在家测血糖\n多少才算高',
            'sub': '空腹和餐后，标准不一样',
            'notes': ['混着测、混着比，没有意义',
                      '「餐后 2 小时」从第一口开始算'],
        },
        {
            'kind': 'items',
            'title': '1. 先分清你测的是哪个时间点',
            'items': [
                {'kind': 'note', 'head': '空腹：通常 4.4–7.0',
                 'body': '禁食 8 小时以上，通常是早上起床后、用药和早餐之前。'},
                {'kind': 'note', 'head': '餐后 2 小时：通常低于 10.0',
                 'body': '注意计时起点见下一页——这是最容易错的地方。'},
                {'kind': 'note', 'head': '睡前：通常 5.6–7.8',
                 'body': '这个区间主要是为了避免夜间低血糖。'},
                {'kind': 'note', 'head': '所以「多少算高」没有唯一答案',
                 'body': '同一个数字，空腹和餐后 2 小时的判定完全不同。混着测、混着比，就没有意义。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 最容易搞错：从「第一口」开始算',
            'items': [
                {'kind': 'dont', 'head': '从吃完开始计时',
                 'body': '很多人这么算。但这样实际测到的是餐后 1 小时左右的血糖，数值偏高，容易误判。'},
                {'kind': 'do', 'head': '从吃第一口开始计时',
                 'body': '这才是「餐后 2 小时」的正确起点。'},
                {'kind': 'note', 'head': '上面那些数值要医生个体化',
                 'body': '老年人、有低血糖风险的人、孕期、有并发症的人，目标值都不同。这些区间只是参考，不要拿它自己改药。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 洗手，比什么都重要',
            'items': [
                {'kind': 'dont', 'head': '刚剥过水果、喝过果汁、拿过甜食的手',
                 'body': '残留的糖分能让读数高得离谱。这是家用血糖仪最常见的错误来源。'},
                {'kind': 'dont', 'head': '用酒精棉片代替洗手',
                 'body': '酒精残留会稀释血样、影响结果。也不要用湿手测。'},
                {'kind': 'do', 'head': '温水加肥皂洗，然后彻底擦干',
                 'body': '这两步做对，比换一台更贵的仪器有用。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 还有两个小细节',
            'items': [
                {'kind': 'do', 'head': '手冷时先搓一搓',
                 'body': '手冷血流差，采血困难、读数也容易受影响。温水泡一下或者搓热再测。'},
                {'kind': 'note', 'head': '第一滴血怎么处理，看说明书',
                 'body': '各家仪器的要求不一样，这一点不要照搬别人的做法。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 记的时候，把时间点写上',
            'lines': [
                '血糖的「高」，不能脱离时间点讲。同一个数字，空腹和餐后 2 小时的含义完全不同。',
                '所以记录时写清：日期、时间点（空腹/餐后 2 小时/睡前）、数值。',
                '给医生看的时候，趋势比单次数值有用得多。',
            ],
            'cta': '下次测之前，\n先去洗个手。',
        },
    ],
    '失眠怎么办20分钟就该起': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 19 篇',
            'title': '失眠怎么办\n20 分钟就该起',
            'sub': '别硬躺',
            'notes': ['躺着睡不着，会让大脑把「床」和「清醒焦虑」绑在一起',
                      '慢性失眠的一线治疗不是安眠药'],
        },
        {
            'kind': 'items',
            'title': '1. 为什么「硬躺」是错的',
            'items': [
                {'kind': 'dont', 'head': '躺着睡不着，越躺越焦虑',
                 'body': '大脑会慢慢把「床」和「清醒 + 焦虑」绑在一起。几次之后，你一上床就清醒——这不是失眠加重了，是条件反射形成了。'},
                {'kind': 'do', 'head': '躺下约 20 分钟睡不着，就起来',
                 'body': '离开卧室，做点单调安静的事：读纸质书、听舒缓的音频。有困意再回床。'},
                {'kind': 'do', 'head': '床只留给睡觉',
                 'body': '不刷手机、不看剧、不办公、不吃饭。让「上床」这个动作重新只意味着睡觉。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 更反直觉的是：固定起床时间',
            'items': [
                {'kind': 'note', 'head': '重点不是「几点睡」，是「几点起」',
                 'body': '每天同一时间起床，包括周末。起床时间锚定了生物钟，比纠结几点睡有用得多。'},
                {'kind': 'note', 'head': '因为你能控制的只有起床',
                 'body': '你没法命令自己几点睡着，但能命令自己几点起。睡眠这件事，从「能控制的那一端」入手才有效。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 睡眠限制：躺得越少，睡得越好',
            'items': [
                {'kind': 'note', 'head': '先算你实际睡多久',
                 'body': '记一周睡眠日记，算出平均实际睡着时长——比如 5.5 小时。然后把卧床时间压缩到「这个时长 + 30 分钟」。'},
                {'kind': 'note', 'head': '为什么反着来有效',
                 'body': '这是在制造轻度的睡眠压力，让「上床就能睡着」重新成立。等这段时间能睡满 85% 以上，再每周提前 15–20 分钟上床。'},
                {'kind': 'dont', 'head': '白天不要补觉',
                 'body': '一补觉，这条就失效了。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 四个加重因素',
            'items': [
                {'kind': 'dont', 'head': '下午 2 点后的咖啡因',
                 'body': '咖啡、浓茶都算。咖啡因的半衰期有 5 小时左右，下午喝的一杯，到睡前还在起效。'},
                {'kind': 'dont', 'head': '睡前喝酒',
                 'body': '酒精让人更快入睡，但后半夜容易醒、睡眠变浅。这是「睡了个假觉」的典型。'},
                {'kind': 'dont', 'head': '午睡过长',
                 'body': '控制在 20–30 分钟，且不晚于下午 3 点。'},
                {'kind': 'dont', 'head': '睡前刷手机',
                 'body': '重点不是「蓝光」，是内容让大脑兴奋，以及刷着刷着挤占了睡眠时间。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 偶尔睡不好，和慢性失眠不是一回事',
            'lines': [
                '偶尔一两晚睡不好，不用慌，也不用立刻吃药。',
                '但如果是每周三次以上、持续三个月以上，那叫慢性失眠——它的一线治疗是失眠认知行为治疗（CBT-I），不是安眠药。这是各主要指南一致的推荐。',
                '记两周睡眠日记再去就医，医生最需要的就是这个。',
            ],
            'cta': '今晚试一件事：\n不管几点睡着，明天同一个时间起。',
        },
    ],
    '煲汤的五指毛桃可能混着断肠草': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 21 篇',
            'title': '煲汤的五指毛桃\n可能混着断肠草',
            'sub': '省疾控 11 月提示',
            'notes': ['钩吻全株有剧毒，且没有快速特效解毒药',
                      '普通人仅凭外观，很难和五指毛桃分开'],
        },
        {
            'kind': 'items',
            'title': '1. 钩吻是什么',
            'items': [
                {'kind': 'note', 'head': '俗称「断肠草」，全株含剧毒',
                 'body': '它含的是神经毒素，不是「吃多了才出事」的那种——少量就可能中毒。'},
                {'kind': 'note', 'head': '没有快速特效解毒药',
                 'body': '这意味着一旦误食，抢救靠的是时间和支持治疗，没有「打一针就解」的东西。'},
                {'kind': 'note', 'head': '它和常用汤料长得很像',
                 'body': '普通人仅凭外观，很难把它和五指毛桃、海风藤、鸡血藤这些常用滋补药材分开。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 中毒会是什么样',
            'items': [
                {'kind': 'dont', 'head': '误食后短时间内就会出现',
                 'body': '头晕、呕吐、肌肉无力、视物模糊。'},
                {'kind': 'dont', 'head': '重症会呼吸麻痹',
                 'body': '可致死。所以这不是「不舒服就歇歇」的那类中毒。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 风险具体在哪',
            'items': [
                {'kind': 'dont', 'head': '路边摊的野生草药',
                 'body': '省疾控点名的就是这个场景——煲汤泡酒用的中草药材，不要在路边摊买。'},
                {'kind': 'dont', 'head': '自己上山采「五指毛桃」',
                 'body': '认错一次的代价太大，而且没有解药。'},
                {'kind': 'do', 'head': '去正规药店、有资质的市场买',
                 'body': '买得到、能追溯，比「野生的更补」重要得多。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 11 月还有一个风险：桐油果',
            'items': [
                {'kind': 'note', 'head': '11 月是桐油果成熟期',
                 'body': '城乡接合部、山区的孩子日常接触机会较多，误食中毒的风险仍在。'},
                {'kind': 'do', 'head': '教孩子一件事就够',
                 'body': '野外的果子，不采、不捡、不吃。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 万一怀疑误食',
            'lines': [
                '带上剩下的可疑草药或植物，第一时间去附近医院。',
                '主动告诉医生吃了什么、吃了多少、什么时候吃的——这直接决定救治速度。',
                '不要等症状加重再去。钩吻没有特效解药，抢的就是时间。',
            ],
            'cta': '把这篇转给家里\n负责买菜煲汤的那个人。',
        },
    ],
    '诺如病毒好了还要隔离三天': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 22 篇',
            'title': '诺如病毒好了\n还要隔离 3 天',
            'sub': '不吐不拉 不等于不传染',
            'notes': ['省疾控 11 月提示：康复后 3 天内尽量居家',
                      '呕吐物要用含氯消毒剂，酒精没用'],
        },
        {
            'kind': 'items',
            'title': '1. 官方原文是这么写的',
            'items': [
                {'kind': 'note', 'head': '「自患病期至康复后 3 天内」',
                 'body': '广东省疾控 2026 年 11 月健康风险提示的原话：患者自患病期至康复后 3 天内应尽量居家隔离。'},
                {'kind': 'note', 'head': '还跟了一句',
                 'body': '「避免为他人准备食物」。这半句是最容易被忽略的。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 为什么「好了」还算传染期',
            'items': [
                {'kind': 'dont', 'head': '症状消失 ≠ 停止排毒',
                 'body': '不吐不拉了，不代表体内已经不排病毒。所以你感觉「好了」的那几天，仍然可能传给别人。'},
                {'kind': 'dont', 'head': '最容易踩的坑：给家人做饭',
                 'body': '这 3 天里给全家做饭、夹菜、尝味道，是最容易把病毒送出去的场景。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 消毒：酒精在这里没用',
            'items': [
                {'kind': 'dont', 'head': '免洗洗手液、酒精',
                 'body': '诺如是没有包膜的病毒，酒精对它效果差。手边没水时它只能凑合，不能替代洗手。'},
                {'kind': 'do', 'head': '含氯消毒剂',
                 'body': '呕吐物、粪便及其污染的环境和物品，按省疾控的说法要用含氯消毒剂规范处理。'},
                {'kind': 'do', 'head': '肥皂 + 流动水',
                 'body': '饭前便后、加工食物前、外出归来后，认真洗手。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 还有三个容易漏的点',
            'items': [
                {'kind': 'dont', 'head': '餐饮从业者带病上岗',
                 'body': '省疾控明确写了「严禁带病上岗」。点外卖、在外吃饭时，这其实和你有关。'},
                {'kind': 'do', 'head': '家里有人中招，餐具分开',
                 'body': '生熟食物分开处理，避免交叉污染。'},
                {'kind': 'do', 'head': '学校、托幼的晨午检',
                 'body': '集体单位聚集性疫情风险高，孩子班上有病例时留意通知。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 诺如季就是现在',
            'lines': [
                '每年 10 月到次年 3 月是诺如病毒胃肠炎的流行季，现在正在其中。',
                '它传染性极强：被污染的食物和水、接触患者、接触被污染的物品、甚至吸入呕吐时产生的气溶胶，都可能传播。',
                '所以「好了再关三天」不是小题大做——它是把最后一波传播按下去的那三天。',
            ],
            'cta': '家里有人刚好\n先别让他下厨房。',
        },
    ],
    '黑芝麻补钙真比牛奶强七倍': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 23 篇',
            'title': '黑芝麻补钙\n真比牛奶强 7 倍',
            'sub': '但一勺只有 78 毫克',
            'notes': ['每 100g 黑芝麻含钙 780mg，牛奶约 100–120mg',
                      '可 100g 黑芝麻也有 559 千卡、46g 脂肪'],
        },
        {
            'kind': 'items',
            'title': '1. 数字是真的，但要看完',
            'items': [
                {'kind': 'note', 'head': '按重量算，确实高出一大截',
                 'body': '黑芝麻每 100g 含钙 780mg，白芝麻约 620mg，牛奶约 100–120mg。数据出自《中国食物成分表》。'},
                {'kind': 'dont', 'head': '但没人一次吃 100g',
                 'body': '100g 黑芝麻是 559 千卡、脂肪 46g——它本质上是油料种子，不是可以大把吃的「补品」。'},
                {'kind': 'do', 'head': '一勺大约是 10g',
                 'body': '换算下来约 78mg 钙。比牛奶的「含量」低不少，但作为日常搭配仍然有贡献。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 它真正拿得出手的，是这几项',
            'items': [
                {'kind': 'do', 'head': '铁 22.7mg / 维生素 E 50.4mg',
                 'body': '每 100g 的含量。维生素 E 是脂溶性抗氧化剂，铁是血红蛋白的组成部分。'},
                {'kind': 'do', 'head': '膳食纤维 14g / 蛋白质 19.1g',
                 'body': '冬天活动少、吃得精细，膳食纤维这件事确实有用。'},
                {'kind': 'note', 'head': '还有芝麻素、芝麻林素',
                 'body': '这类木脂素是芝麻特有的成分，被研究过抗炎、调节血脂等潜在作用——注意是「潜在」，不是结论。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 「以黑补黑」是另一件事',
            'items': [
                {'kind': 'dont', 'head': '吃黑芝麻，不会让白头发变黑',
                 'body': '头发变白是毛囊里黑色素细胞减少，吃进去的黑色素和毛发的黑色素不是一回事。目前没有证据表明吃黑色食物能逆转白发。'},
                {'kind': 'note', 'head': '但它的营养对毛发是有支持的',
                 'body': '维生素 E、锌、铁参与毛发的正常生长和抗氧化。这两件事要分开讲：营养支持 ≠ 白发返黑。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 那「补肾」怎么算',
            'items': [
                {'kind': 'note', 'head': '「黑色入肾」属于传统理论',
                 'body': '它没有可检验的判定标准——没法客观说「你补够了没有」「该不该补」。所以它不进证据分级。'},
                {'kind': 'note', 'head': '但营养成分是实的',
                 'body': '钙、铁、维生素 E、膳食纤维，这些有明确数据。传统归经和营养成分，是两套语言，可以并存，但不能互相证明。'},
                {'kind': 'do', 'head': '所以更稳的说法是',
                 'body': '把黑芝麻当一种营养成分密集的食物来吃，而不是当「补肾药」。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 怎么吃更划算',
            'lines': [
                '先炒香再研磨——香气出得来，口感也更好。整粒吃容易原样排出去。',
                '控制量：它一半是油。一碗黑芝麻糊（20g 芝麻 + 10g 糯米 + 5g 冰糖）约 180 千卡。',
                '对芝麻过敏的人避开；糖尿病患者做芝麻糊时少放或不放糖。',
            ],
            'cta': '这个冬天\n先从一小勺开始。',
        },
    ],
    '暖宝宝贴着睡会烫伤吗': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 24 篇',
            'title': '暖宝宝贴着睡\n会烫伤吗',
            'sub': '44℃ 就够了 而且不疼',
            'notes': ['低温烫伤不是被火烫到，是长时间接触中等温度',
                      '最危险的地方是：它不疼'],
        },
        {
            'kind': 'items',
            'title': '1. 低温烫伤是什么',
            'items': [
                {'kind': 'note', 'head': '不是被火烫到',
                 'body': '是长时间接触「中等温度」的热源造成的损伤——大致 44℃ 以上、持续足够长的时间就可能发生。'},
                {'kind': 'note', 'head': '决定损伤的是「温度 × 时间」',
                 'body': '44℃ 贴几小时，和 60℃ 贴几秒，可能造成相近的损伤。所以「不算烫」不代表没事。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 为什么它最危险：不疼',
            'items': [
                {'kind': 'dont', 'head': '它不疼，所以最容易被忽略',
                 'body': '等你发现的时候，往往已经伤到真皮深层了。这不是「忍一忍就过去」的那种烫伤。'},
                {'kind': 'dont', 'head': '睡着的时候尤其危险',
                 'body': '人睡着后不会翻身躲开，同一个部位会持续受热几个小时。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 三个最常见的场景',
            'items': [
                {'kind': 'dont', 'head': '暖宝宝直接贴皮肤',
                 'body': '隔着衣服也可能出问题，尤其睡着、或长时间不动的时候。'},
                {'kind': 'dont', 'head': '热水袋灌太满、水温太高',
                 'body': '抱着睡或压在身下，就是同一个部位持续受热。'},
                {'kind': 'dont', 'head': '电热毯开整夜',
                 'body': '这三个是最常见的低温烫伤来源。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 谁最需要小心',
            'items': [
                {'kind': 'dont', 'head': '糖尿病患者',
                 'body': '末梢感觉减退，烫伤了也可能不知道。这类人不建议直接用热水袋、暖宝宝贴皮肤。'},
                {'kind': 'dont', 'head': '感觉减退的人、老年人、睡着的人',
                 'body': '共同点是「疼了也不会及时躲开」，而这正是低温烫伤成立的条件。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 怎么用才安全',
            'lines': [
                '热水袋：水温不要过高，外面套布套；睡前暖被窝，睡时取出来。',
                '暖宝宝：隔着衣服贴，不要贴着睡，同一个位置别超过说明书的时间。',
                '电热毯：睡前预热，睡时关掉或调低，不要整夜开。',
            ],
            'cta': '今晚用之前\n先看一眼说明书上写的时间。',
        },
    ],
    '五十岁以后带状疱疹疫苗该不该打': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 25 篇',
            'title': '50 岁以后\n带状疱疹疫苗该不该打',
            'sub': '保护效力超过 90%',
            'notes': ['它是水痘病毒在神经里「醒过来」',
                      '很多人根本不知道有这支疫苗'],
        },
        {
            'kind': 'items',
            'title': '1. 带状疱疹是什么',
            'items': [
                {'kind': 'note', 'head': '不是新感染 是老病毒醒了',
                 'body': '小时候得过水痘，病毒并没有走，它潜伏在神经节里。几十年后免疫下降，它再激活，就成了带状疱疹。'},
                {'kind': 'note', 'head': '疼是它的特点',
                 'body': '皮疹沿着神经分布，通常只在一侧。很多人描述最难忍的不是疹子，是那种烧灼、针刺一样的疼。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 为什么 50 岁以后风险高',
            'items': [
                {'kind': 'note', 'head': '免疫衰老',
                 'body': '随年龄增长，免疫系统的应答变弱，压不住潜伏的病毒。所以 50 岁以后发病率明显上升。'},
                {'kind': 'dont', 'head': '「得过一次就不会再得」是错的',
                 'body': '可能复发。而且疫苗对已经得过的人，仍然有接种价值。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 这支疫苗的关键数字',
            'items': [
                {'kind': 'do', 'head': '保护效力超过 90%',
                 'body': '重组带状疱疹疫苗在临床试验中对带状疱疹的保护效力很高，而且对 50 岁以上人群效果稳定。这是近年成人疫苗里证据较强的一个。'},
                {'kind': 'do', 'head': '要打 2 剂 间隔 2–6 个月',
                 'body': '不是一针。很多人以为打完第一针就完了。'},
                {'kind': 'do', 'head': '50 岁以上；有免疫抑制情况可更早',
                 'body': '具体能不能打、什么时候打，问接种医生。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 谁尤其值得考虑',
            'items': [
                {'kind': 'note', 'head': '50 岁以上',
                 'body': '这是核心人群。'},
                {'kind': 'note', 'head': '有过带状疱疹的人',
                 'body': '可能复发，疫苗仍有价值——具体时机问医生。'},
                {'kind': 'note', 'head': '免疫功能受影响的人',
                 'body': '可以更早评估。但这类人接种要由医生决定，不能自己判断。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 三句实话',
            'lines': [
                '它不是「打了绝对不得」，但能明显降低风险——90% 以上是临床试验里的数字。',
                '疫苗不是只有儿童才打。50 岁之后，带状疱疹、肺炎球菌和流感是核心组合。',
                '价格和供应各地不同，值不值得打，结合自己的情况和医生聊一次更准。',
            ],
            'cta': '爸妈过了 50 岁的话\n可以问问社区接种门诊。',
        },
    ],
    '老人防跌倒为什么散步不够': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 26 篇',
            'title': '老人防跌倒\n为什么散步不够',
            'sub': '要练的是力量和平衡',
            'notes': ['单纯散步 不能显著降低跌倒风险',
                      '另外 有些药本身会增加跌倒风险'],
        },
        {
            'kind': 'items',
            'title': '1. 先把家里的绊脚点清一遍',
            'items': [
                {'kind': 'dont', 'head': '浴室（最该先改）',
                 'body': '湿滑地面、没有扶手、淋浴没座位、马桶过低。这是跌倒最高发的地方。'},
                {'kind': 'dont', 'head': '起夜路线（第二）',
                 'body': '从床到卫生间的路上有没有灯？起夜是最容易摔的时段，装个夜灯很划算。'},
                {'kind': 'dont', 'head': '松动卷边的小地毯（第三）',
                 'body': '最容易绊倒。宁可不铺，或者用双面胶固定住。'},
                {'kind': 'dont', 'head': '拖鞋和只穿袜子走路',
                 'body': '要穿合脚、防滑、有后跟的鞋。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 几个便宜但有用的东西',
            'items': [
                {'kind': 'do', 'head': '浴室扶手（马桶旁 + 淋浴区）',
                 'body': '花不了多少钱，但效果明确。'},
                {'kind': 'do', 'head': '淋浴椅 + 手持花洒',
                 'body': '站着洗澡对老人来说风险很高。'},
                {'kind': 'do', 'head': '夜灯 + 防滑垫',
                 'body': '走廊、卫生间、床边各一个。'},
                {'kind': 'do', 'head': '加高的马桶座圈',
                 'body': '如果有起身困难，这个能减少不少风险。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 这才是最容易被忽略的一项',
            'items': [
                {'kind': 'dont', 'head': '「天天散步就够了」',
                 'body': '单纯散步不能显著降低跌倒风险。这是这一点最反直觉的地方——很多人觉得腿在动就行。'},
                {'kind': 'do', 'head': '要练下肢力量和平衡',
                 'body': '坐站练习（从椅子上反复起立坐下）、靠墙静蹲、提踵、抬腿。针对性练，比多走两圈管用。'},
                {'kind': 'note', 'head': '为什么',
                 'body': '跌倒往往发生在「平衡被打断」的瞬间——转身、起夜、踩到东西。走路练不到这些。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 还有一件很多人没想到的',
            'items': [
                {'kind': 'note', 'head': '让医生查一次正在吃的药',
                 'body': '部分降压药、镇静类药、降糖药会增加跌倒风险。不是让停药，是让医生评估一次。'},
                {'kind': 'note', 'head': '维生素 D 和钙',
                 'body': '按医嘱补，不要自己加量。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 如果已经跌倒过',
            'lines': [
                '一定要就医评估。跌倒往往不是「不小心」，而是有原因——血压、平衡、视力、药物、骨质疏松。',
                '还有一个反直觉的坑：因为怕再摔而减少活动，反而会更快失去力量和平衡，更容易再摔。',
                '所以正确的做法不是「少动」，是「改环境 + 练力量」。',
            ],
            'cta': '这周末回家\n陪老人走一圈看看。',
        },
    ],
    '每天该吃多少盐五克你可能吃了十克': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 27 篇',
            'title': '每天该吃多少盐\n5 克 你可能吃了 10 克',
            'sub': '问题不在盐罐里',
            'notes': ['推荐每天不超过 5g  我国居民平均 9–10g',
                      '隐形盐才是大头  1 汤匙酱油约 2–3g 盐'],
        },
        {
            'kind': 'items',
            'title': '1. 先记住三个量',
            'items': [
                {'kind': 'do', 'head': '盐：每天不超过 5g',
                 'body': '也就是约 2000mg 钠。我国居民平均吃到 9–10g，接近两倍。'},
                {'kind': 'do', 'head': '烹调油：25–30g',
                 'body': '多数家庭明显超标。'},
                {'kind': 'do', 'head': '添加糖：最好 25g 以内',
                 'body': '上限是 50g。含糖饮料是主要来源。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 减盐的重点不是盐罐',
            'items': [
                {'kind': 'dont', 'head': '酱油 1 汤匙（约 15ml）',
                 'body': '就含 2–3g 盐。一勺下去，一天额度的一半就没了。'},
                {'kind': 'dont', 'head': '蚝油、豆瓣酱、鸡精、味精',
                 'body': '每样都含钠，叠加起来很快。'},
                {'kind': 'dont', 'head': '挂面、面包',
                 'body': '制作时就加盐，你不觉得咸而已。'},
                {'kind': 'dont', 'head': '火腿、香肠、咸菜、榨菜',
                 'body': '含量很高。'},
                {'kind': 'dont', 'head': '外卖、快餐、火锅蘸料',
                 'body': '一餐常超过全天目标。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 能立刻做的四件事',
            'items': [
                {'kind': 'do', 'head': '换一个 2g 的定量盐勺',
                 'body': '全家一天不超过 2.5 勺。有刻度才不是凭感觉。'},
                {'kind': 'do', 'head': '起锅前再放盐',
                 'body': '咸味留在表面，用量能减少而口感不差。'},
                {'kind': 'do', 'head': '用香料和酸味替代一部分咸味',
                 'body': '葱姜蒜、花椒、醋、柠檬都能提味。'},
                {'kind': 'do', 'head': '少买加工食品',
                 'body': '这可能是最省力的一条——不买，就不用控制。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 看标签的一个算式',
            'items': [
                {'kind': 'note', 'head': '钠（mg）÷ 400 = 盐（g）',
                 'body': '包装食品的营养成分表上都有钠。一包零食标钠 800mg，就是 2g 盐。'},
                {'kind': 'note', 'head': '为什么要换算',
                 'body': '因为标签上写的是钠，不是盐。这两者差 2.5 倍，很容易低估。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 油和糖也一样',
            'lines': [
                '油：换成带刻度的油壶，比「少放一点」可执行。',
                '糖：主要盯饮料。一瓶甜饮料就可能顶掉一天的上限。',
                '这三件事不用全做——先改一样，坚持下来就有效果。',
            ],
            'cta': '今晚做饭\n试试起锅前再放盐。',
        },
    ],
    '中风前兆症状消失了也不是好了': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 28 篇',
            'title': '中风前兆\n症状消失了也不是好了',
            'sub': '那是脑梗的高危预警',
            'notes': ['每 12 秒 1 人发生  每 21 秒 1 人死',
                      '不用所有症状都出现  任意一条就要打 120'],
        },
        {
            'kind': 'items',
            'title': '1. 三个动作，先记住',
            'items': [
                {'kind': 'do', 'head': '1 看脸',
                 'body': '突然口角歪斜、两边脸不对称、一侧嘴角往下掉。'},
                {'kind': 'do', 'head': '2 查胳膊',
                 'body': '两臂向前平举，一侧抬不住、无力、发麻。'},
                {'kind': 'do', 'head': '0 听说话',
                 'body': '说话含糊、词不达意、听不懂别人讲话。'},
                {'kind': 'note', 'head': '这就是「中风 1-2-0」',
                 'body': '中国卒中学会推广的识别口诀，三个动作，家里人都该会。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 还有几个容易被当成别的问题',
            'items': [
                {'kind': 'dont', 'head': '突然一只眼看不清、发黑、重影',
                 'body': '很多人以为是眼睛累了。'},
                {'kind': 'dont', 'head': '突然走路不稳、站不住、像喝醉',
                 'body': '容易被当成颈椎病、低血糖、老寒腿。'},
                {'kind': 'dont', 'head': '突然剧烈头痛，伴恶心呕吐',
                 'body': '没有明显诱因的那种。'},
                {'kind': 'note', 'head': '关键一句：不用全部出现',
                 'body': '只要是「突然」发生任意一条，就要高度怀疑卒中。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 最反常识的一条',
            'items': [
                {'kind': 'dont', 'head': '「过一会儿就好了」',
                 'body': '症状几分钟到一小时内自己缓解，叫短暂性脑缺血发作，俗称小中风。它不是好了，是脑梗的高危预警。'},
                {'kind': 'note', 'head': '为什么不能等',
                 'body': '研究里这种人不及时处理，接下来几天到几周内发生真正脑梗的风险明显升高。'},
                {'kind': 'do', 'head': '症状消失了也要去医院',
                 'body': '这是这条里最该记住的一句。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 家里有人中招，三件不要做',
            'items': [
                {'kind': 'dont', 'head': '不要等子女下班再送',
                 'body': '这是最常见的延误。每延误 1 分钟，约 190 万个脑细胞死亡。'},
                {'kind': 'dont', 'head': '不要拖拽摔倒的人',
                 'body': '如果是脑出血，拖到床上沙发上可能让血肿扩大。原地等急救。'},
                {'kind': 'dont', 'head': '不要喂水、喂药、喂饭',
                 'body': '卒中后约四成人会有吞咽困难，误吸的危险大过喂药的好处。'},
                {'kind': 'do', 'head': '只做一件事：打 120',
                 'body': '记下症状开始的时间，医生要这个。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 为什么现在要讲这个',
            'lines': [
                '脑卒中是我国成年人首位致死、致残病因。秋冬气温波动大，血管容易收缩，正是高发时段。',
                '它可防可治——高血压、糖尿病、血脂异常、房颤、吸烟、高盐饮食，都是能干预的因素。',
                '所以两件事：管好血压；记住那三个动作。',
            ],
            'cta': '把 1-2-0 这三个动作\n发给家里有老人的群。',
        },
    ],
    '腰疼怎么办卧床和推拿可能都不对': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 29 篇',
            'title': '腰疼怎么办\n卧床和推拿可能都不对',
            'sub': '大多数 4–6 周会好',
            'notes': ['过去说卧床  现在不推荐  躺着反而恢复更慢',
                      '推拿只有短期效果  几周后就没差别了'],
        },
        {
            'kind': 'items',
            'title': '1. 先说最重要的一条',
            'items': [
                {'kind': 'dont', 'head': '「腰疼就躺着养」',
                 'body': '过去确实这么建议，现在不推荐。严格卧床会让肌肉更弱、恢复更慢。'},
                {'kind': 'do', 'head': '保持能忍受的适度活动',
                 'body': '恢复更快。可以短时间用舒服的姿势歇一下（侧卧屈膝，或仰卧膝下垫枕），但不要整天躺着。'},
                {'kind': 'note', 'head': '给个预期',
                 'body': '大多数急性腰疼在 4–6 周内明显好转。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 刚疼起来的头几天，别急着按摩',
            'items': [
                {'kind': 'dont', 'head': '不要推拿、正骨、暴力扳动',
                 'body': '急性期可能加重损伤。要找就找有资质的医疗机构，别去路边店。'},
                {'kind': 'do', 'head': '可以冷敷，之后改热敷',
                 'body': '前 1–2 天局部冷敷，每次 15–20 分钟，不要直接接触皮肤。'},
                {'kind': 'do', 'head': '疼得明显可以按说明书用非处方止痛药',
                 'body': '有胃病、肾病、心血管病、正在用抗凝药的人，先问医生或药师。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 推拿到底有用吗',
            'items': [
                {'kind': 'note', 'head': '短期有用，长期没证据',
                 'body': '对腰痛有短期缓解作用，效果大致与热敷、运动相当。但长期效果没有证据——通常几周后和对照组就没差别了。'},
                {'kind': 'dont', 'head': '脖子「咔咔」那一下要当心',
                 'body': '颈椎高速旋转扳法与椎动脉夹层、脑卒中相关。虽然罕见，但后果严重。'},
                {'kind': 'dont', 'head': '这几类人风险更高',
                 'body': '骨质疏松、脊柱肿瘤转移、正在服抗凝药的人。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 腰带别长期戴',
            'items': [
                {'kind': 'dont', 'head': '长期依赖护腰',
                 'body': '会让肌肉更弱，反而更容易复发。'},
                {'kind': 'do', 'head': '长期防复发靠核心和髋部力量',
                 'body': '「护腰」的本质是让腰少承担它不该承担的负荷，不是把腰练硬。'},
                {'kind': 'do', 'head': '日常动作也要改',
                 'body': '弯腰搬重、久坐不动、突然扭转，是三个最常见的诱发动作。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 这些情况别自己扛',
            'lines': [
                '大小便功能异常、会阴部麻木、双腿无力——这三个要立刻就医。',
                '发热、夜间痛醒、体重明显下降、外伤后疼痛——也要尽快查，不要当成普通腰疼。',
                '反过来说：没有这些信号、能正常活动的腰疼，大多数会在几周内好转，不用急着做各种检查。',
            ],
            'cta': '腰疼的时候\n先别躺 也别急着按摩。',
        },
    ],
    '体检加项哪些其实是白花钱': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 30 篇',
            'title': '体检加项\n哪些其实是白花钱',
            'sub': '这三类多数人不需要',
            'notes': ['肿瘤标志物套餐  全身 PET-CT  微量元素',
                      '不吸烟的人做肺癌 CT 也没有证据支持'],
        },
        {
            'kind': 'items',
            'title': '1. 先把体检分成三类',
            'items': [
                {'kind': 'do', 'head': '基础项：年年做',
                 'body': '血压、体重腰围、血脂、血糖、口腔与视力。便宜、无创、有意义、可干预。'},
                {'kind': 'do', 'head': '按年龄性别的筛查项',
                 'body': '宫颈癌、乳腺癌、结直肠癌、肺癌等。有明确获益人群和间隔。'},
                {'kind': 'dont', 'head': '加项：多数人不需要',
                 'body': '证据不足，或只适合特定高危人群。'},
            ],
        },
        {
            'kind': 'items',
            'title': '2. 这几类，多数人不必做',
            'items': [
                {'kind': 'dont', 'head': '肿瘤标志物套餐',
                 'body': '对没有症状的人缺乏证据，容易带来假阳性和后续的过度检查。'},
                {'kind': 'dont', 'head': '全身 PET-CT',
                 'body': '同理。查出一堆「需要复查」的东西，最后大多没事。'},
                {'kind': 'dont', 'head': '微量元素检测',
                 'body': '不建议作为常规项目。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 基础项里最值的是这两项',
            'items': [
                {'kind': 'do', 'head': '血压——最便宜、最有价值',
                 'body': '一次偏高不算高血压，要不同日多次测量。'},
                {'kind': 'do', 'head': '腰围，比体重更能说明问题',
                 'body': '它反映内脏脂肪。建议和体重、BMI 一起记。'},
                {'kind': 'note', 'head': '血脂和血糖：一般 40 岁起',
                 'body': '有家族史、糖尿病、肥胖等情况要更早、更勤。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 癌症筛查都有年龄门槛',
            'items': [
                {'kind': 'note', 'head': '不是越早查越好',
                 'body': '宫颈癌一般 25–30 岁开始；乳腺癌一般风险女性 40 岁起；结直肠癌一般风险 50 岁起。'},
                {'kind': 'dont', 'head': '肺癌 CT 只针对高危人群',
                 'body': '长期吸烟且达到一定包年数的人。不吸烟的低风险人群做，没有证据支持。'},
                {'kind': 'note', 'head': '骨密度也有门槛',
                 'body': '65 岁以上女性、70 岁以上男性，或绝经后合并危险因素的女性。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 一句话总结',
            'lines': [
                '体检的价值来自「按年龄、性别和风险选有证据的单项」，不是套餐越贵越好。',
                '基础项年年做，筛查项按年龄和风险做，加项多数不用做。',
                '各版指南的年龄和间隔略有差异，具体加不加、什么时候加，问一下医生更准。',
            ],
            'cta': '下次体检前\n先看看套餐里加了什么。',
        },
    ],
    '血压计腕式和上臂式差在哪': [
        {
            'kind': 'cover',
            'kicker': '日常健康　第 31 篇',
            'title': '血压计腕式和上臂式\n差在哪',
            'sub': '腕式不是「差一点」',
            'notes': ['腕式对姿势和位置极度敏感  家用误差明显更大',
                      '袖带太小还会测出偏高的假象'],
        },
        {
            'kind': 'devices',
            'title': '三种血压计，位置不一样',
            'notes': ['同一根手臂，只有上臂这一处位置是稳的',
                      '国内外指南都把上臂式列为家庭自测的首选'],
        },
        {
            'kind': 'items',
            'title': '2. 为什么腕式不行',
            'items': [
                {'kind': 'note', 'head': '上臂的动脉位置稳定',
                 'body': '肱动脉在组织厚实的上臂，位置不容易跑。'},
                {'kind': 'note', 'head': '腕部动脉细，又容易移位',
                 'body': '手腕稍微偏一点、抬一点，读数就变了。而家里测血压时，你很难每次都在同一个位置。'},
            ],
        },
        {
            'kind': 'items',
            'title': '3. 买之前还有两个坑',
            'items': [
                {'kind': 'dont', 'head': '袖带太小',
                 'body': '会测出偏高的假象。买之前量一下自己的上臂围，对照说明书选。上臂较粗的人要换大号。'},
                {'kind': 'do', 'head': '认准医疗器械注册证',
                 'body': '这是最基本的一条。'},
                {'kind': 'do', 'head': '每隔 1–2 年校准一次',
                 'body': '按说明书操作。电子设备也会飘。'},
            ],
        },
        {
            'kind': 'items',
            'title': '4. 买回来之后，这两件事也要对',
            'items': [
                {'kind': 'do', 'head': '袖带中心与心脏同高',
                 'body': '手臂悬空或位置过低，读数都会偏高。'},
                {'kind': 'do', 'head': '袖带下缘在肘窝上 2–3 厘米',
                 'body': '缠好后能塞进一根手指为宜——太松偏高，太紧偏低。'},
            ],
        },
        {
            'kind': 'end',
            'title': '5. 一句话',
            'lines': [
                '血压计这件事，容错率最低的是手腕，所以宁可多花钱买上臂式。',
                '而「量得准」还有一半在操作：姿势、位置、袖带松紧，任何一个不对，读数就差 10–20 mmHg。',
                '这个幅度足以决定一个人是不是被诊断成高血压。',
            ],
            'cta': '要买血压计的话\n认准上臂式。',
        },
    ],
}


def render_set(name, slides):
    out = os.path.abspath(os.path.join(OUT_ROOT, name))
    os.makedirs(out, exist_ok=True)

    probe = ImageDraw.Draw(Image.new('RGB', (W, H)))
    problems = []
    for i, s in enumerate(slides):
        problems += check_safe(probe, s, i)
    if problems:
        for p in problems:
            print(f'  [!] {p}')
        print('  [!] 有文字超宽，可能被裁切')
        return False

    total = len(slides)
    for i, s in enumerate(slides):
        img = Image.new('RGB', (W, H), BG)
        d = ImageDraw.Draw(img)
        if s['kind'] == 'cover':
            slide_cover(d, s)
            page_footer(d, 1, total)
        elif s['kind'] == 'items':
            slide_items(d, s, i + 1, total)
        elif s['kind'] == 'report':
            slide_report(d, s, i + 1, total)
        elif s['kind'] == 'devices':
            slide_devices(d, s, i + 1, total)
        else:
            slide_end(d, s, i + 1, total)
        p = os.path.join(out, f'{i+1:02d}.png')
        img.save(p, 'PNG', optimize=True)
        print(f'  [OK] {name}/{i+1:02d}.png  {os.path.getsize(p)//1024} KB')
    return True


def main():
    # 可选：只渲染指定的那套。
    #   python make-xhs-carousel.py "广东10月还在防蚊"
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only and only not in SETS:
        print(f'没有这套内容：{only}')
        print('可选：' + '、'.join(SETS.keys()))
        sys.exit(2)

    ok = True
    for name, slides in SETS.items():
        if only and name != only:
            continue
        print(f'\n=== {name}（{len(slides)} 张）===')
        ok = render_set(name, slides) and ok
    if not ok:
        sys.exit(2)
    print(f'\n  输出：{os.path.abspath(OUT_ROOT)}')


if __name__ == '__main__':
    main()
