# Gen 6 overlay, layout A (v3). 1920x1080, 3DS top screen x3, built on the Gen 5 Secondary Screen layout.
# Panels are cut from a real Gen 5 render (background keyed out) and get the production drop shadow back
# (`filter: drop-shadow(0px 1px 1px)`); the movepool is rebuilt (frame geometry of images/gen5/ui/movepool.svg,
# table per .movepoolDemo in games/gen5/style.css, rows fitted to the frame like core/logic/movepoolFit.ts).
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '../assets/black_keyed.png'
W, H = 1920, 1080

# ---------------- geometry ----------------
SIDE = 13                      # outer side margin == gap between a column and the game border (Gen 4/5: 13)
TOP, BOT = 20, 1062            # panel top line / bottom line (Gen 4/5)
MW, MH = 1200, 720             # 400x240 x3
MX = (W - MW) // 2             # 360 -> border 358..1562
MY = 19                        # inner top (Gen 4/5 game area inner top 19, border at 17)
BORDER = 2
COL = MX - BORDER - 2 * SIDE   # column width: 332
LX = SIDE                      # left column x
RX = MX + MW + BORDER + SIDE   # right column x: 1575
K = COL / 420                  # Gen 4/5 left panels are 420 wide
MAIN_BOTTOM = MY + MH + BORDER # 741 (outer bottom of the border)
SS_GAP = 12                    # Gen 4/5: movepool frame bottom 735 -> 2nd screen 747
SS_H = 303                                     # inner 404x303 (exact 4:3); with its 2px border 408x307,
SS_W = 404                                     # filling 755..1062 (14px under the game border)
SS_X = W - SIDE - BORDER - SS_W                # border's right edge on the column's right edge (1907)
SS_Y = BOT - BORDER - SS_H

def crop(sx, sy, sw, sh, dx, dy, k, z=5, shadow=True, img=SRC, IW=1920, IH=1080):
    f = 'filter:drop-shadow(0px 1px 1px #000);' if shadow else ''
    return (f'<div class="crop" style="{f}z-index:{z};background-image:url({img});left:{dx:.2f}px;top:{dy:.2f}px;'
            f'width:{sw*k:.2f}px;height:{sh*k:.2f}px;background-size:{IW*k:.2f}px {IH*k:.2f}px;'
            f'background-position:{-sx*k:.2f}px {-sy*k:.2f}px"></div>')

b = []
# game areas (images/gen5/ui/game_area.svg: 2px black border, drop-shadow 0 0 1px)
b.append(f'<div class="screen top" style="left:{MX}px;top:{MY}px;width:{MW}px;height:{MH}px"><div class="lbl"><b>3DS TOP SCREEN</b><span>400×240 × 3 = 1200×720</span></div></div>')
b.append(f'<div class="screen bot" style="left:{SS_X}px;top:{SS_Y}px;width:{SS_W}px;height:{SS_H}px"><div class="lbl small"><b>BOTTOM SCREEN</b><span>320×240 → {SS_W}×{SS_H} (4:3)</span></div></div>')

# ---- left column (Gen 4/5 panels x13..433) ----
lx = lambda x: LX + (x - 13) * K
top_y = lambda y: TOP + (y - 20) * K           # anchored to the top line
bot_y = lambda y: BOT - (1062 - y) * K         # anchored to the bottom line
b.append(crop(15, 20, 416, 286, lx(15), top_y(20), K))             # timer, badges, faults
b.append(crop(13, 766, 420, 296, lx(13), bot_y(766), K))           # stats (+ exp / nature rows)
# pokeball (elements/pokeball.webp: x0..482, y607..803, flush to the canvas edge), stats overlap it as in Gen 4/5
ball_y = bot_y(607)
b.append(crop(0, 607, 482, 196, 0, ball_y, K, z=2, shadow=False, img='../assets/elements/pokeball.webp'))
b.append(crop(165, 706, 120, 48, 165 * K, bot_y(706), K, z=4).replace('class="crop"', 'class="crop pill"'))     # type pill on the ball
# species art: Gen 4/5 shows it ~382px tall standing in the ball's bowl; here it fills the space under the faults box
faults_bottom = top_y(306)
feet = bot_y(690)
art_h = 440                                    # keeps the art inside the column (Gen 4/5: ~382 tall)
art_top = feet - art_h
ak = art_h / 1280
art_w = 883 * ak
b.append(crop(198, 0, 883, 1280, (482 * K - art_w) / 2 + 6, art_top, ak, z=3, shadow=False,
              img='../assets/Tornadus.webp', IW=1280, IH=1280))

# ---- bottom centre: ability / held item band + moveset (Gen 4/5 x449..1471) ----
MS_X0 = MX + 1                                  # Gen 4/5 moveset starts 3px inside the game border
MS_X1 = SS_X - BORDER - SIDE                    # same 13px gap to the 2nd screen's border as everywhere else
KB = (MS_X1 - MS_X0) / 1022
ab_h, ms_h, mid = 52 * KB, 180 * KB, 21 * KB
free = (BOT - 2) - MAIN_BOTTOM - ab_h - ms_h - mid   # moveset bottom 1060 as in Gen 4/5
ab_y = MAIN_BOTTOM + free * 0.5
ms_y = ab_y + ab_h + mid + free * 0.5
b.append(crop(462, 807, 999, 52, MS_X0 + (462 - 449) * KB, ab_y, KB))
b.append(crop(449, 880, 1022, 180, MS_X0, ms_y, KB))

# ---- right column: the right panel (movepool here; the enemy team / splits / trainers take the same slot) ----
MP_X, MP_Y, MP_W = RX, TOP - 2, COL           # movepool.svg frame starts at y 18, 2px above the panel line
MP_BOTTOM = MAIN_BOTTOM                        # frame bottom lines up with the game border, 12px above the 2nd screen
MP_H = MP_BOTTOM - MP_Y
C = 18.83 * K * 1.0                            # chamfer
def frame_svg(w, h):
    c = 18.83
    outer = f'M0,{h} V{c} L{c},0 H{w-c} L{w},{c} V{h} Z'
    inner = f'M3,{h-3} V38 H{w-3} V{h-3} Z'
    return f'''<svg class="mpframe" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="left:{MP_X}px;top:{MP_Y}px">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#9c83b0"/><stop offset=".5" stop-color="#c6adda"/><stop offset="1" stop-color="#9c83b0"/></linearGradient></defs>
<path d="{outer} {inner}" fill="url(#g)" fill-rule="evenodd"/>
<path d="{outer}" fill="none" stroke="#543b68" stroke-width="2" transform="translate(1,1) scale({(w-2)/w},{(h-2)/h})"/>
<path d="{inner}" fill="none" stroke="#543b68" stroke-width="2"/>
<path d="M3,{c+3} L{c+2},4 H{w-c-2} L{w-3},{c+3}" fill="none" stroke="#826996" stroke-width="2"/>
</svg>'''
b.append(frame_svg(MP_W, MP_H))
b.append(f'<div class="mptitle" style="left:{MP_X}px;top:{MP_Y+2}px;width:{MP_W}px">Movepool</div>')

T = {'Normal':'#8f918f','Ghost':'#653b65','Flying':'#74a7d8','Dark':'#584546','Fighting':'#e67300','Psychic':'#d83b6d',
     'Water':'#2573d8','Poison':'#833bb7','Grass':'#399125','Rock':'#b8a038','Fire':'#e62829','Bug':'#91a119'}
DC = {'Special':'#3251a1','Physical':'#d44e24','Status':'#757575'}
ROWS = '''1|Uproar|Normal|Special|90|100|10
1|Astonish|Ghost|Physical|30|100|15
1|Gust|Flying|Special|40|100|35
7|Swagger|Normal|Status|-|90|15
13|Bite|Dark|Physical|60|100|25
19|Revenge|Fighting|Physical|60|100|10
25|Air Cutter|Flying|Special|55|95|25
31|Extrasensory|Psychic|Special|80|100|30
37|Agility|Psychic|Status|-|-|30
43|Air Slash|Flying|Special|75|95|20
49|Crunch|Dark|Physical|80|100|15
55|Tailwind|Flying|Status|-|-|30
61|Rain Dance|Water|Status|-|-|5
67|Hurricane|Flying|Special|120|70|10
73|Dark Pulse|Dark|Special|80|100|15
79|Hammer Arm|Fighting|Physical|100|90|10
85|Thrash|Normal|Physical|120|100|10
TM06|Toxic|Poison|Status|-|90|10
~TM08|Bulk Up|Fighting|Status|-|-|20
TM10|Hidden Power|Dark|Special|-|100|15
TM12|Taunt|Dark|Status|-|100|20
TM15|Hyper Beam|Normal|Special|150|90|5
TM17|Protect|Normal|Status|-|-|10
TM18|Rain Dance|Water|Status|-|-|5
TM21|Frustration|Normal|Physical|-|100|20
~TM23|Smack Down|Rock|Physical|50|100|15
TM27|Return|Normal|Physical|-|100|20
~TM29|Psychic|Psychic|Special|90|100|10
TM31|Brick Break|Fighting|Physical|75|100|15
~TM32|Double Team|Normal|Status|-|-|15
~TM34|Sludge Wave|Poison|Special|95|100|10
TM36|Sludge Bomb|Poison|Special|90|100|10
TM40|Aerial Ace|Flying|Physical|60|-|20
TM41|Torment|Dark|Status|-|100|15
TM42|Facade|Normal|Physical|70|100|20
TM44|Rest|Psychic|Status|-|-|10
TM45|Attract|Normal|Status|-|100|15
TM46|Thief|Dark|Physical|40|100|10
~TM48|Round|Normal|Special|60|100|15
TM52|Focus Blast|Fighting|Special|120|70|5
TM56|Fling|Dark|Physical|-|100|10
TM58|Sky Drop|Flying|Physical|60|100|10
~TM59|Incinerate|Fire|Special|30|100|15
TM62|Acrobatics|Flying|Physical|55|100|15
TM63|Embargo|Dark|Status|-|100|15
TM66|Payback|Dark|Physical|50|100|10
TM68|Giga Impact|Normal|Physical|150|90|5
TM86|Grass Knot|Grass|Special|-|100|20
~TM87|Swagger|Normal|Status|-|90|15
~ERR|U-turn|Bug|Physical|70|100|20
TM90|Substitute|Normal|Status|-|-|10
TM94|Rock Smash|Fighting|Physical|40|100|15
HM02|Fly|Flying|Physical|90|95|15
HM04|Strength|Normal|Physical|80|100|15'''.splitlines()
# table geometry relative to the frame (Gen 5: frame x1489, table x1494 w404 top 60; window inner x1492..1901 from y56)
tk = MP_W / 415
tbl_x, tbl_w = MP_X + 5 * tk, MP_W - 10 * tk
tbl_y = MP_Y + (60 - 18) * tk
tbl_h = MP_BOTTOM - 5 - tbl_y
hdr_h = 17 * tk
row_h = (tbl_h - hdr_h - 4) / len(ROWS)
font = min(13 * tk * 1.0, row_h * 13 / 15)
trs = []
for i, r in enumerate(ROWS):
    struck = r.startswith('~'); r = r.lstrip('~')
    way, mv, ty, dc, pw, ac, pp = r.split('|')
    bg = '#e6e6e6' if i % 2 == 0 else '#bbbbbb'
    st = ' class="struck"' if struck else ''
    trs.append(f'<tr{st} style="background:{bg}"><td class="w">{way}</td><td class="m">{mv}</td>'
               f'<td class="t" style="background:{T[ty]}">{ty}</td><td class="t" style="background:{DC[dc]}">{dc}</td>'
               f'<td class="c">{pw}</td><td class="c">{ac}%</td><td class="c">{pp}</td></tr>')
b.append(f'''<table class="mp" style="left:{tbl_x:.1f}px;top:{tbl_y:.1f}px;width:{tbl_w:.1f}px;font-size:{font:.2f}px;line-height:{row_h:.2f}px">
<tr class="hdr" style="height:{hdr_h:.1f}px;line-height:{hdr_h:.1f}px"><th class="w">Way</th><th class="m">Move</th><th class="t">Type</th><th class="t">DC</th><th class="c">Pwr.</th><th class="c">Acc.</th><th class="c">PP</th></tr>
{''.join(trs)}</table>''')

CSS = f'''
@font-face{{font-family:titan;src:url(../assets/fonts/TitanOne-Regular.ttf)}}
@font-face{{font-family:play;src:url(../assets/fonts/Play-Bold.ttf);font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#00202a url(../assets/textures/Flying.jpg) center/cover;font-family:play,sans-serif}}
.crop{{position:absolute;background-repeat:no-repeat}} .pill{{border-radius:20px}}
.screen{{position:absolute;outline:2px solid #000;display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:6;filter:drop-shadow(0 0 1px #000000c5)}}
.screen.top{{background:repeating-linear-gradient(0deg,#1d1d22 0 3px,#222229 3px 6px)}}
.screen.bot{{background:repeating-linear-gradient(0deg,#1b2a1e 0 3px,#203223 3px 6px)}}
.lbl{{text-align:center;color:#d9d2e6;text-shadow:0 2px 4px #000;font-family:play;font-weight:700}}
.lbl b{{display:block;font-size:44px;letter-spacing:2px}}
.lbl span{{display:block;font-size:22px;opacity:.75;margin-top:4px}}
.lbl.small b{{font-size:30px}} .lbl.small span{{font-size:17px}}
.mpframe{{position:absolute;z-index:5;filter:drop-shadow(0px 1px 1px #000)}}
.mptitle{{position:absolute;z-index:7;font-family:titan;font-size:{26*tk:.1f}px;text-align:center;color:#000}}
table.mp{{position:absolute;z-index:6;border-collapse:collapse;table-layout:fixed;font-family:play;font-weight:700;color:#000;opacity:.95}}
table.mp th{{font-weight:700;background:#74a7d8}} table.mp tr.hdr{{outline:2px solid #000}}
table.mp td,table.mp th{{white-space:nowrap;overflow:hidden;padding:0}}
.w{{width:11%;text-align:left;padding-left:{4*tk:.1f}px!important}} .m{{width:28%;text-align:left}} .t{{width:17.2%;text-align:center}} .c{{width:8.87%;text-align:center}}
tr.struck td{{opacity:.4;text-decoration:line-through}}
'''
open(os.path.join(HERE, 'A3.html'), 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(b)}</body></html>')
print(f'COL={COL} K={K:.4f} RX={RX} SS={SS_X},{SS_Y} {SS_W}x{SS_H} KB={KB:.4f} ab_y={ab_y:.1f} ms_y={ms_y:.1f} free={free:.1f} art {art_top:.0f}..{feet:.0f} row_h={row_h:.2f} font={font:.2f}')
