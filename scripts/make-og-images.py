#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成社交分享图（Open Graph image）。

为什么要自己生成：把链接发到微信/小红书时，如果页面没有 og:image，
显示的就是一个裸链接——没有标题、没有摘要、没有图，点击率会低很多。
而 50 条词条如果共用一张站点图，看不出每条的区别，所以**每条词条生成一张**。

设计：左侧品牌色竖条 + 品牌名 + 大标题（自动折行）+ 一句话结论 + 证据等级/分类徽标。
尺寸 1200x630（Open Graph 通用比例，微信/微博/FB/Twitter 都能用）。

字体：用 Windows 自带的微软雅黑（本机 C:\\Windows\\Fonts）。
⚠️ 换机器要注意字体路径；找不到就报错退出（宁可不生成，也不要出一堆豆腐块）。

体积：纯色块图，用调色板量化（256 色）。实测平均约 26 KB/张。
分享时每个链接只加载一张，所以总量（51 张约 1.3 MB）不影响页面速度。

⚠️ 所有输出用 ASCII：Windows 控制台默认 GBK，打印 ✓ 这类字符会直接抛
UnicodeEncodeError（实测踩过）。要么只用 ASCII，要么显式把 stdout 设成 UTF-8。

用法：
  python scripts/make-og-images.py            # 生成到 public/og/（跳过已存在的）
  python scripts/make-og-images.py --force    # 全部重新生成
"""

import hashlib
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRIES_DIR = os.path.join(ROOT, 'src', 'content', 'entries')
OUT_DIR = os.path.join(ROOT, 'public', 'og')

W, H = 1200, 630

# 设计版本：改了下面任何一处版式/配色/字号，就把这个数字加一。
# 它进了内容指纹，所以加一之后全部图片会被重新生成（见 content_fingerprint 的说明）。
DESIGN_VERSION = 1

BRAND = (31, 122, 90)
BRAND_SOFT = (230, 242, 236)
TEXT = (31, 35, 40)
SOFT = (107, 114, 128)
BG = (255, 255, 255)
LINE = (227, 223, 215)

FONT_DIR = r'C:\Windows\Fonts'
BOLD = os.path.join(FONT_DIR, 'msyhbd.ttc')
REG = os.path.join(FONT_DIR, 'msyh.ttc')

EVIDENCE_LABEL = {'A': 'A · 证据强', 'B': 'B · 证据中', 'C': 'C · 证据弱', 'D': 'D · 有争议'}
EVIDENCE_COLOR = {
    'A': ((47, 143, 91), (231, 245, 236)),
    'B': ((58, 123, 213), (232, 240, 252)),
    'C': ((140, 120, 90), (244, 241, 234)),
    'D': ((200, 106, 106), (251, 234, 234)),
}


def load_fonts():
    if not os.path.exists(BOLD) or not os.path.exists(REG):
        sys.exit('[X] 找不到中文字体（%s / %s）。请修改脚本里的 FONT_DIR。' % (BOLD, REG))
    return {
        'brand': ImageFont.truetype(BOLD, 34),
        'title': ImageFont.truetype(BOLD, 62),
        'title_small': ImageFont.truetype(BOLD, 52),
        'sub': ImageFont.truetype(REG, 31),
        'badge': ImageFont.truetype(BOLD, 26),
        'site': ImageFont.truetype(REG, 28),
    }


def wrap(text, font, max_w, draw, max_lines):
    """按像素宽度折行；中文逐字断，英文/数字按词断。"""
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=font) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
            if len(lines) >= max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    return lines


def parse_frontmatter(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    m = re.match(r'^---\r?\n([\s\S]*?)\r?\n---', text)
    if not m:
        return None
    fm = m.group(1)

    def scalar(key):
        mm = re.search(r'^%s:[ \t]*(.*)$' % key, fm, re.M)
        if not mm:
            return ''
        v = mm.group(1).strip()
        # ⚠️ 只能剥**成对的**外层引号（2026-10-13 修）。
        #
        # 原来是 `.strip("'\"")`，那会反复剥掉首尾所有引号字符。
        # 对 YAML 里的  '"上火"到底是什么'（外层单引号，内层是全角/半角引号作内容）
        # 它会得到  上火"到底是什么  —— 把**内容里的引号也削掉了**。
        # 而 check-og.mjs 用 js-yaml 解析，得到的是正确的  "上火"到底是什么。
        # 两者不一致 → 该词的分享图被永久判为"内容不一致"，
        # 且因为 0 张需重生成、1 张被判过期，形成互相矛盾的死循环。
        #
        # 现在按 YAML 规则只处理成对的外层引号，并还原单引号转义（'' → '）。
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            inner = v[1:-1]
            if v[0] == "'":
                inner = inner.replace("''", "'")
            v = inner
        return v

    return {
        'title': scalar('title'),
        'category': scalar('category'),
        'evidence': scalar('evidence'),
        'summary': scalar('summary'),
    }


def draw_badge(d, x, y, text, fg, bg, font):
    pad_x, pad_y = 18, 9
    w = d.textlength(text, font=font)
    box = [x, y, x + w + pad_x * 2, y + font.size + pad_y * 2]
    d.rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=bg, outline=fg, width=2)
    d.text((x + pad_x, y + pad_y - 2), text, font=font, fill=fg)
    return box[2]


def content_fingerprint(title, summary, evidence, category):
    """
    图片内容指纹：包含**画进图里的字段** + **设计版本**。

    为什么必须在这里定义、并且写进 PNG 元数据：
      分享图是构建产物，一旦词条标题/结论改了，图就过期了，但图片自己不会报错。
      靠文件修改时间判断会**误报**——本项目的 apply-review 脚本会给所有词条加
      review_after 字段、刷新 mtime，但那完全不影响图片内容（实测 80 张全被误判为过期）。
      所以改用内容指纹：生成时把它写进 PNG 的 tEXt 元数据，
      校验器（check-og.mjs）读出元数据与当前词条重新算一遍对比，就能精确判断是否过期。

    ⚠️ DESIGN_VERSION 的作用：指纹只覆盖"画什么"，不覆盖"怎么画"。
       改了字号、间距、配色之后，内容没变但图应该重生成——这时必须**手动把
       DESIGN_VERSION 加一**，否则 80 张图不会更新，而校验器也不会发现
       （因为内容指纹确实一致）。这是这套机制唯一需要人工维护的地方，所以要写清楚。
    """
    raw = '|'.join('' if v is None else str(v) for v in (title, summary, evidence, category))
    return hashlib.sha256(f'{DESIGN_VERSION}|{raw}'.encode('utf-8')).hexdigest()[:16]


def render(title, summary, evidence, category, out_path, fonts, is_site=False):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    # 左侧品牌色竖条
    d.rectangle([0, 0, 14, H], fill=BRAND)

    # 顶栏：品牌名 + 分类
    d.text((80, 66), '高性价比健康指南', font=fonts['brand'], fill=BRAND)
    if category:
        cw = d.textlength(category, font=fonts['badge'])
        d.text((W - 80 - cw, 72), category, font=fonts['badge'], fill=SOFT)

    # 标题：长了就用小一号字
    max_w = W - 160
    title_font = fonts['title']
    lines = wrap(title, title_font, max_w, d, 3)
    if len(lines) == 3 and d.textlength(lines[-1], font=title_font) > max_w * 0.9:
        title_font = fonts['title_small']
        lines = wrap(title, title_font, max_w, d, 3)

    y = 190
    for ln in lines:
        d.text((80, y), ln, font=title_font, fill=TEXT)
        y += int(title_font.size * 1.32)

    # 一句话结论
    y += 14
    for ln in wrap(summary, fonts['sub'], max_w, d, 2):
        d.text((80, y), ln, font=fonts['sub'], fill=SOFT)
        y += 44

    # 底部：证据等级徽标 + 域名
    badge_y = H - 108
    if evidence in EVIDENCE_LABEL:
        fg, bgc = EVIDENCE_COLOR[evidence]
        draw_badge(d, 80, badge_y, EVIDENCE_LABEL[evidence], fg, bgc, fonts['badge'])
    site = 'costlifehealth.com'
    sw = d.textlength(site, font=fonts['site'])
    d.text((W - 80 - sw, badge_y + 8), site, font=fonts['site'], fill=SOFT)

    # 分隔线
    d.line([80, H - 140, W - 80, H - 140], fill=LINE, width=2)

    # 量化压缩：纯色块图，256 色足够
    im = im.quantize(colors=256, method=Image.MEDIANCUT)

    # 把内容指纹写进 PNG 元数据，供 check-og.mjs 判断图片是否过期
    meta = PngInfo()
    meta.add_text('SiteFingerprint', content_fingerprint(title, summary, evidence, category))
    meta.add_text('SiteSlug', os.path.basename(out_path)[:-4])
    im.save(out_path, 'PNG', optimize=True, pnginfo=meta)
    return os.path.getsize(out_path)


def read_fingerprint(path):
    """
    读出 PNG 里嵌入的内容指纹。读不到（老图、或格式不对）返回 None，
    调用方会当作"需要重新生成"处理。
    """
    try:
        with Image.open(path) as im:
            return im.text.get('SiteFingerprint') if hasattr(im, 'text') else None
    except Exception:
        return None


def main():
    force = '--force' in sys.argv
    fonts = load_fonts()
    os.makedirs(os.path.join(OUT_DIR, 'entry'), exist_ok=True)

    files = sorted(f for f in os.listdir(ENTRIES_DIR) if f.endswith('.md'))
    made, skipped, total = 0, 0, 0

    for f in files:
        slug = f[:-3]
        out = os.path.join(OUT_DIR, 'entry', slug + '.png')
        data = parse_frontmatter(os.path.join(ENTRIES_DIR, f))
        if not data or not data['title']:
            print('  skip %s: no title' % f)
            continue

        # 按内容指纹决定是否需要重新生成（而不是只看文件在不在）。
        # 这样「改了词条的标题或结论」会自动重生成，而「只改了不画进图的字段」
        # （如 review_after）不会白白重生成 80 张图。
        want = content_fingerprint(data['title'], data['summary'], data['evidence'], data['category'])
        if not force and os.path.exists(out) and read_fingerprint(out) == want:
            skipped += 1
            continue

        size = render(data['title'], data['summary'], data['evidence'], data['category'], out, fonts)
        made += 1
        total += size

    # 首页/通用图
    home_out = os.path.join(OUT_DIR, 'site.png')
    home_title = '高性价比健康指南'
    home_summary = '把健康从医院拉回日常生活：每个问题给一个能直接照做的答案，并标注证据等级、成本与时间。'
    want_home = content_fingerprint(home_title, home_summary, '', '')
    if force or not os.path.exists(home_out) or read_fingerprint(home_out) != want_home:
        size = render(home_title, home_summary, None, None, home_out, fonts, is_site=True)
        made += 1
        total += size

    print('[OK] 生成 %d 张分享图（指纹一致、跳过 %d 张）' % (made, skipped))
    if made:
        print('     平均 %.1f KB，输出目录 public/og/' % (total / made / 1024))


if __name__ == '__main__':
    main()
