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

    block_h = title_h + sub_h + note_h
    y = max(170, (H - block_h) // 2)

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

      · `title`   → 会自动缩字号，跳过
      · `sub`     → 单行（黄底块），必须查
      · `notes`   → 单行（封面底部），必须查
      · `items[].head` → 单行（带下划线），必须查
      · `cta`     → 会折行，跳过
    """
    bad = []

    if spec.get('sub'):
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
        else:
            slide_end(d, s, i + 1, total)
        p = os.path.join(out, f'{i+1:02d}.png')
        img.save(p, 'PNG', optimize=True)
        print(f'  [OK] {name}/{i+1:02d}.png  {os.path.getsize(p)//1024} KB')
    return True


def main():
    ok = True
    for name, slides in SETS.items():
        print(f'\n=== {name}（{len(slides)} 张）===')
        ok = render_set(name, slides) and ok
    if not ok:
        sys.exit(2)
    print(f'\n  输出：{os.path.abspath(OUT_ROOT)}')


if __name__ == '__main__':
    main()
