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
