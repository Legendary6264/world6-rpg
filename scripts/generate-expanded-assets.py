#!/usr/bin/env python3
"""Original, editable 64 px art for World 6. No downloaded images or fonts.

Run from any directory: python scripts/generate-expanded-assets.py
Pillow is optional and only used for the review contact sheets. SVG generation
uses Python's standard library. Recipes intentionally describe distinct objects,
not colour/rotation permutations. The file is dedicated to CC0 with its output.
"""
from __future__ import annotations
import json
import math
from pathlib import Path
from collections import Counter
from html import escape
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = ImageDraw = ImageFont = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/expanded'
PREVIEW = ROOT / 'docs/assets'
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
P = dict(ink='#0c1520', dark='#182633', shade='#283a45', stone='#4c636b',
         steel='#7d9ca4', light='#c1d9d2', white='#edf3df', wood='#735343',
         bark='#48372f', tan='#a67c55', gold='#d5ac65', leaf='#346b55',
         green='#5c9871', mint='#83cbb0', water='#346979', blue='#73b5c9',
         purple='#8164a1', violet='#b39acd', red='#a8525a', fire='#e59861',
         skin='#c99982', skinshade='#8d6659')

class Art:
    def __init__(self, w=64, h=64):
        self.w, self.h, self.parts = w, h, []
        self.im = Image.new('RGBA', (w,h), (0,0,0,0)) if Image else None
        self.draw = ImageDraw.Draw(self.im) if Image else None
    def r(self,x,y,w,h,c):
        if w<=0 or h<=0: return
        c=P.get(c,c)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}"/>')
        if self.draw: self.draw.rectangle((x,y,x+w-1,y+h-1),fill=c)
    def p(self,pts,c):
        c=P.get(c,c)
        self.parts.append(f'<polygon points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="{c}"/>')
        if self.draw: self.draw.polygon(pts,fill=c)
    def line(self,x1,y1,x2,y2,c='steel',width=2):
        # Closed integer polygons, rather than anti-aliased strokes.
        if x1==x2: self.r(x1,y1,width,y2-y1+1,c); return
        if y1==y2: self.r(x1,y1,x2-x1+1,width,c); return
        self.p([(x1,y1),(x1+width,y1),(x2+width,y2),(x2,y2)],c)
    def gem(self,x,y,s=10,c='mint'):
        self.p([(x+s//2,y),(x+s,y+s//3),(x+s,y+2*s//3),(x+s//2,y+s),(x,y+2*s//3),(x,y+s//3)],'ink')
        self.p([(x+s//2,y+2),(x+s-2,y+s//3),(x+s-2,y+2*s//3),(x+s//2,y+s-2),(x+2,y+2*s//3),(x+2,y+s//3)],c)
        self.p([(x+s//2,y+2),(x+s//2,y+s-3),(x+2,y+s//3)],'light')
    def box(self,x,y,w,h,c='wood'):
        self.r(x,y,w,h,'ink'); self.r(x+2,y+2,w-4,h-4,c)
        self.r(x+2,y+2,w-4,2,'tan'); self.r(x+w-4,y+4,2,h-6,'bark')
    def shadow(self,x=9,y=55,w=46):
        self.p([(x,y),(x+w,y),(x+w-5,y+3),(x+5,y+3)],'ink')
    def frame(self,accent='mint'):
        self.r(0,0,self.w,self.h,'ink'); self.r(2,2,self.w-4,self.h-4,'shade')
        self.r(4,4,self.w-8,self.h-8,'dark')
        for x,y in [(4,4),(self.w-8,4),(4,self.h-8),(self.w-8,self.h-8)]:
            self.r(x,y,4,4,accent); self.r(x+1,y+1,2,2,'ink')
    def save(self,path,title):
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" shape-rendering="crispEdges" role="img"><title>{escape(title)}</title>{"".join(self.parts)}</svg>\n'
        path.write_text(svg,encoding='utf-8')

manifest=[]
images=[]
def add(slug,label,category,art,tags,kind=None):
    ident='expanded-'+slug
    assert not any(e['id']==ident for e in manifest),ident
    filename=slug+'.svg'; art.save(OUT/filename,label)
    e=dict(id=ident,label=label,category=category,tags=tags,file=filename)
    if kind: e['objectKind']=kind
    manifest.append(e); images.append((label,category,art.im))

def noise(a,base,colors,mode='dots'):
    a.r(0,0,a.w,a.h,base)
    for i in range(108):
        x=(i*37+i*i*3)%a.w; y=(i*19+i*i*7)%a.h
        if mode=='grass':
            a.r(x,y,1,3,colors[i%len(colors)]); a.r((x+2)%a.w,(y+2)%a.h,2,1,colors[(i+1)%len(colors)])
        else: a.r(x,y,2+i%3,1+i%2,colors[i%len(colors)])

SURFACES=[
 ('meadow','Луговая трава','grass'),('moss','Мох и камни','moss'),('forest-soil','Лесная подстилка','leaves'),('leaf-path','Тропа в опавшей листве','leafpath'),
 ('dirt-road','Утоптанная дорога','dirt'),('mud-track','Грязь с колеями','mud'),('furrows','Пахотные борозды','furrows'),('wheat','Спелые колосья','wheat'),
 ('sand','Песчаные дюны','sand'),('gravel','Крупный гравий','gravel'),('pebble-shore','Галечный берег','shore'),('salt-flat','Соляная корка','salt'),
 ('snow','Рыхлый снег','snow'),('cracked-ice','Расколотый лёд','ice'),('bog','Болотные кочки','bog'),('reed-pond','Заросший пруд','reedwater'),
 ('deep-water','Глубокая вода','deepwater'),('shallow-water','Прозрачное мелководье','shallow'),('river','Речное течение','river'),('basalt','Базальтовые плиты','basalt'),
 ('lava','Лавовые трещины','lava'),('ash','Пепел и угли','ash'),('limestone','Известняк','limestone'),('slate','Сланцевая порода','slate'),
 ('marble','Мраморный пол','marble'),('flagstones','Плиты песчаника','flagstone'),('mosaic','Геометрическая мозаика','mosaic'),('cobbles','Булыжная мостовая','cobble'),
 ('planks','Дощатый настил','planks'),('parquet','Паркет ёлочкой','parquet'),('carpet','Тканый ковёр','carpet'),('grate','Металлическая решётка','grate'),
 ('cellar-tile','Плитка подвала','cellar'),('rune-floor','Пол с руническими вставками','runes'),('roots','Переплетённые корни','roots'),('crystal-floor','Кристаллическая порода','crystals')]

def surface(mode):
    a=Art(96,64)
    if mode in ['grass','moss','leaves','leafpath','dirt','mud','furrows','wheat','sand','gravel','shore','salt','snow','ice','bog','reedwater','deepwater','shallow','river','basalt','lava','ash','limestone','slate','roots','crystals']:
        base,colors={
          'grass':('leaf',['green','mint','#284d42']), 'moss':('#29463e',['leaf','green','shade']),
          'leaves':('bark',['wood','tan','#705942']), 'leafpath':('bark',['wood','tan','gold']),
          'dirt':('#625345',['wood','tan','#4a4039']),'mud':('#3f3b36',['bark','shade','wood']),
          'furrows':('bark',['wood','tan']),'wheat':('#5b5336',['gold','tan','#8b7949']),
          'sand':('#b09268',['gold','#80674a','#cdb790']),'gravel':('shade',['stone','steel','wood']),
          'shore':('stone',['steel','light','shade']),'salt':('#acb5aa',['white','light','steel']),
          'snow':('#b5ccd0',['white','light','steel']),'ice':('#6296a6',['blue','light','steel']),
          'bog':('#283c34',['leaf','wood','water']),'reedwater':('water',['blue','leaf','shade']),
          'deepwater':('#214455',['water','blue','#2b5363']),'shallow':('#3d7980',['mint','blue','gold']),
          'river':('water',['blue','light','shade']),'basalt':('#2a333a',['shade','stone','ink']),
          'lava':('ink',['bark','red','shade']),'ash':('#373839',['shade','stone','bark']),
          'limestone':('#839084',['light','steel','stone']),'slate':('shade',['stone','steel','ink']),
          'roots':('#30372d',['bark','wood','leaf']),'crystals':('dark',['purple','shade','stone'])}[mode]
        noise(a,base,colors,'grass' if mode in ['grass','wheat','moss'] else 'dots')
    else: noise(a,'dark',['shade','stone'])
    if mode=='moss':
        for x,y,w in [(13,14,14),(59,35,20),(74,5,10)]: a.p([(x,y),(x+w,y-3),(x+w+3,y+8),(x+4,y+10)],'stone'); a.r(x+3,y,w-3,3,'leaf')
    elif mode in ['leaves','leafpath']:
        if mode=='leafpath': a.p([(32,0),(55,0),(62,23),(47,64),(19,64),(35,26)],'#6e6050')
        for i in range(22):
            x=i*29%92;y=i*17%60;a.p([(x,y),(x+5,y+2),(x+3,y+5),(x,y+3)],['gold','red','tan'][i%3])
    elif mode in ['dirt','mud']:
        for x in (23,68):
            a.p([(x,0),(x+3,0),(x+8,30),(x+5,64),(x+1,64),(x+4,30)],'bark')
        if mode=='mud':
            for x,y in [(4,11),(34,35),(72,9)]: a.p([(x,y),(x+16,y),(x+21,y+6),(x+13,y+10),(x-2,y+7)],'water');a.r(x+2,y+2,9,1,'steel')
    elif mode=='furrows':
        for y in range(1,64,12): a.r(0,y,96,3,'wood');a.r(0,y+3,96,2,'tan');a.r(0,y+9,96,2,'ink')
    elif mode=='wheat':
        for x in range(2,96,9):
            for y in range(7,64,16): a.r(x,y,1,12,'tan');a.r(x-2,y,5,5,'gold');a.r(x+1,y+1,1,3,'light')
    elif mode=='sand':
        for y in (10,30,50): a.p([(0,y),(20,y-4),(55,y+4),(96,y-1),(96,y+1),(55,y+6),(20,y-2),(0,y+2)],'#cdb790')
    elif mode in ['gravel','shore']:
        for i in range(30):
            x=i*23%96;y=i*11%64;a.p([(x,y),(x+6,y-1),(x+9,y+3),(x+7,y+6),(x+1,y+5)],'shade');a.r(x+1,y,5,2,'steel')
        if mode=='shore':a.p([(70,0),(96,0),(96,64),(63,64),(75,43),(65,26)],'water');a.line(70,0,76,28,'light',2)
    elif mode=='salt':
        for x,y in [(5,6),(35,5),(68,9),(18,32),(48,30),(79,37),(2,55),(38,55)]:
            a.p([(x,y+3),(x+7,y),(x+21,y+2),(x+26,y+13),(x+17,y+22),(x+3,y+18)],'steel');a.p([(x+2,y+4),(x+8,y+2),(x+20,y+4),(x+23,y+12),(x+16,y+19),(x+5,y+16)],'light');a.r(x+8,y+7,9,2,'white')
    elif mode=='slate':
        for x,y in [(1,8),(28,3),(56,19),(5,35),(36,42),(74,48)]:
            a.p([(x,y+7),(x+19,y),(x+29,y+7),(x+10,y+17)],'ink');a.p([(x+3,y+7),(x+18,y+2),(x+24,y+7),(x+10,y+13)],'stone');a.line(x+8,y+8,x+20,y+5,'steel',1)
    elif mode in ['ice','basalt']:
        for i in range(8):
            x=i*17%96;y=i*23%64;a.p([(x,y),(x+7,y+2),(x+14,y-4),(x+19,y),(x+15,y+2),(x+7,y+5),(x,y+2)],'light' if mode in ['ice','salt'] else 'ink')
    elif mode=='snow':
        for x,y in [(8,13),(38,35),(67,10),(75,46)]:a.p([(x,y),(x+15,y-4),(x+22,y),(x+18,y+5),(x+2,y+6)],'white')
    elif mode in ['bog','reedwater']:
        if mode=='reedwater':
            a.p([(16,8),(76,8),(88,23),(87,50),(66,59),(24,54),(8,32)],'water');a.r(22,24,44,1,'blue');a.r(39,40,30,1,'mint');a.p([(39,33),(44,29),(52,31),(55,36),(49,40),(42,39)],'leaf')
        for x,y in [(11,10),(50,40),(78,15)]:
            if mode=='reedwater':x,y=((5,8) if x==11 else (70,43) if x==50 else (76,8))
            a.p([(x-5,y+10),(x+10,y+7),(x+18,y+13),(x+14,y+18),(x-3,y+17)],'leaf')
            for j in range(3):a.r(x+j*4,y-3-j*2,1,17+j*2,'green');a.r(x+j*4-1,y-5-j*2,3,5,'tan')
    elif mode in ['deepwater','shallow','river']:
        for i in range(13):
            x=i*31%96;y=i*17%64;a.r(x,y,14 if mode=='river' else 8,1,'blue');a.r(x+5,y+2,12,1,'light' if mode=='river' else 'water')
        if mode=='shallow':
            for x,y in [(19,23),(71,45),(42,7)]: a.p([(x,y),(x+6,y-2),(x+10,y+4),(x+2,y+7)],'gold');a.r(x+1,y,5,1,'mint')
    elif mode=='lava':
        for x,y in [(12,0),(40,19),(68,40)]:a.p([(x,y),(x+7,y+12),(x+2,y+27),(x+12,y+44),(x+7,y+45),(x-3,y+28),(x+2,y+12)],'red');a.line(x+1,y,x+8,y+17,'fire',2);a.r(x+5,y+11,2,5,'gold')
    elif mode=='ash':
        for x,y in [(8,13),(50,20),(74,42)]:a.r(x,y,5,3,'red');a.r(x+1,y,2,1,'fire')
    elif mode=='limestone':
        for y in (16,39,59):a.r(0,y,96,1,'stone');a.r(15,y-3,29,2,'light')
    elif mode=='roots':
        for i in range(8):
            x=i*13;a.p([(x,0),(x+5,0),(x+17,21),(x+8,41),(x+23,64),(x+16,64),(x+2,42),(x+10,22)],'wood');a.line(x+2,0,x+14,21,'tan',2)
    elif mode=='crystals':
        for x,y,s in [(3,8,17),(35,37,22),(67,11,23),(79,49,15)]:a.gem(x,y,s,'purple')
    elif mode in ['marble','flagstone','cobble','cellar']:
        sizes={'marble':(32,24),'flagstone':(24,16),'cobble':(12,8),'cellar':(16,16)}
        tw,th=sizes[mode]
        for row,y in enumerate(range(-th,64,th)):
            for col,x in enumerate(range(-tw,96,tw)):
                offset=tw//2 if row%2 and mode!='cellar' else 0
                base=['stone','shade','steel'][ (row+col)%3] if mode=='cobble' else ('light' if mode=='marble' else 'stone')
                a.r(x+offset+1,y+1,tw-2,th-2,base);a.r(x+offset+2,y+2,tw-4,1,'steel' if mode!='marble' else 'white')
                if mode=='marble':a.line(x+4,y+5,x+20,y+th-4,'steel',1)
                if mode=='flagstone':a.r(x+offset+tw-5,y+th-6,2,2,'shade')
    elif mode=='mosaic':
        for y in range(0,64,16):
            for x in range(0,96,16):a.p([(x+8,y),(x+16,y+8),(x+8,y+16),(x,y+8)],'gold' if (x+y)%32 else 'purple');a.p([(x+8,y+3),(x+13,y+8),(x+8,y+13),(x+3,y+8)],'dark')
    elif mode=='planks':
        for y in range(0,64,8):
            a.r(0,y,96,7,'wood');a.r(0,y+1,96,1,'tan')
            for x in range((y*7)%24,96,24):a.r(x,y,1,7,'bark');a.r(x+3,y+3,1,1,'gold')
    elif mode=='parquet':
        for y in range(-16,64,16):
            for x in range(-16,96,16):
                a.p([(x,y+4),(x+4,y),(x+16,y+12),(x+12,y+16)],'tan');a.p([(x+16,y+12),(x+20,y+16),(x+8,y+28),(x+4,y+24)],'wood');a.line(x+3,y+4,x+12,y+13,'gold',1)
    elif mode=='carpet':
        a.r(0,0,96,64,'purple')
        for y in range(0,64,8):a.r(0,y,96,1,'shade')
        for x in range(0,96,24):
            for y in range(0,64,24):a.p([(x+12,y+2),(x+22,y+12),(x+12,y+22),(x+2,y+12)],'gold');a.p([(x+12,y+5),(x+19,y+12),(x+12,y+19),(x+5,y+12)],'red')
    elif mode=='grate':
        for x in range(0,96,8):a.r(x,0,3,64,'stone');a.r(x,0,1,64,'steel')
        for y in range(0,64,8):a.r(0,y,96,3,'stone');a.r(0,y,96,1,'steel')
    elif mode=='runes':
        a.r(3,3,90,58,'shade');a.r(5,5,86,54,'dark')
        for x in (13,39,65):
            a.r(x,16,2,31,'mint');a.line(x+2,18,x+12,27,'mint',2);a.line(x+2,41,x+13,33,'mint',2);a.r(x+11,25,2,10,'mint')
        for x,y in [(7,7),(85,7),(7,53),(85,53)]:a.r(x,y,4,4,'gold')
    return a

for slug,label,mode in SURFACES:
    tags=['поверхность','вид сверху',mode]
    if mode in ['marble','flagstone','mosaic','cobble','planks','parquet','carpet','grate','cellar']:tags.append('тайл')
    add('ground-'+slug,label,'background',surface(mode),tags)

def scenic(mode):
    a=Art(96,64)
    a.r(0,0,96,64,'dark');a.r(0,0,96,38,'#263444');a.r(0,39,96,25,'shade')
    a.r(71,8,8,8,'light');a.r(75,6,7,12,'light');a.r(72,12,8,3,'white')
    if mode in ['forest','clearing','marsh']:
        a.p([(0,38),(19,29),(40,36),(70,27),(96,33),(96,64),(0,64)],'leaf')
        for x,y,s in [(0,6,1),(16,13,1),(65,3,1),(82,15,1)]:
            a.r(x+8,y+22,4,24,'bark')
            if mode=='forest':
                a.p([(x+10,y),(x+22,y+20),(x+16,y+20),(x+26,y+34),(x-7,y+34),(x+3,y+20),(x-2,y+20)],'#254b43')
                a.p([(x+10,y+5),(x+18,y+20),(x+10,y+18),(x+20,y+30),(x+1,y+30)],'green')
            else:
                a.p([(x-3,y+10),(x+3,y+3),(x+17,y+1),(x+25,y+9),(x+26,y+18),(x+17,y+24),(x+1,y+21),(x-5,y+16)],'#254b43');a.r(x+4,y+8,13,3,'leaf')
        if mode=='marsh':
            a.p([(26,34),(66,36),(96,55),(96,64),(15,64),(45,48)],'water')
            for x,y in [(26,44),(62,53),(12,56)]:a.r(x,y,1,8,'mint');a.r(x+3,y-3,1,12,'green')
        else:a.p([(30,64),(42,41),(61,39),(50,64)],'wood')
    elif mode in ['mountain','canyon']:
        a.p([(0,32),(24,5),(48,36),(65,15),(96,32),(96,64),(0,64)],'stone')
        a.p([(0,42),(23,14),(35,41),(47,35),(62,24),(80,46),(96,40),(96,64),(0,64)],'shade')
        if mode=='mountain':a.p([(16,15),(24,5),(34,17),(27,14),(22,17)],'light');a.p([(49,64),(54,42),(60,41),(64,64)],'steel')
        else:
            a.p([(0,0),(23,0),(33,20),(21,38),(31,64),(0,64)],'wood');a.p([(70,0),(96,0),(96,64),(60,64),(74,30),(66,16)],'tan')
            for y in (14,29,47):a.r(0,y,21,2,'gold');a.r(75,y+4,21,2,'bark')
    elif mode in ['harbor','square']:
        a.r(0,38,96,26,'water' if mode=='harbor' else 'stone')
        for x,y,w,h in [(3,16,21,25),(29,23,18,18),(60,13,31,29)]:
            a.r(x,y,w,h,'wood');a.p([(x-3,y),(x+w//2,y-12),(x+w+3,y)],'red');a.r(x+3,y+4,4,7,'gold');a.r(x+w-7,y+4,4,7,'gold')
            a.r(x+w//2-3,y+h-11,6,11,'dark');a.r(x,y+h-2,w,2,'tan')
        if mode=='harbor':
            a.r(0,48,74,7,'wood');a.r(0,48,74,2,'tan')
            for x in (8,34,62):a.r(x,48,3,16,'bark')
            a.p([(64,45),(91,45),(85,52),(70,52)],'gold');a.r(77,23,2,22,'wood');a.p([(79,24),(91,41),(79,41)],'light')
        else:a.r(46,36,4,14,'steel');a.r(38,46,20,3,'shade');a.r(40,43,16,3,'water')
    elif mode in ['temple','crossing']:
        a.r(0,45,96,19,'stone')
        for x,h in [(5,28),(23,20),(69,31),(86,18)]:a.r(x,44-h,7,h,'shade');a.r(x-2,44-h,11,3,'steel');a.r(x,43,9,3,'steel')
        a.p([(29,20),(36,12),(60,12),(67,20),(67,45),(59,45),(59,23),(37,23),(37,45),(29,45)],'stone')
        a.r(31,20,4,24,'steel');a.r(39,14,18,2,'steel')
        if mode=='crossing':a.r(38,24,20,21,'purple');a.p([(48,25),(55,31),(51,41),(45,42),(41,35)],'violet');a.r(45,30,3,8,'light')
        else:a.r(42,28,12,17,'dark');a.r(46,39,4,4,'mint')
        for x,y in [(12,52),(65,53),(73,48)]:a.p([(x,y),(x+12,y-2),(x+17,y+6),(x+4,y+8)],'shade')
    elif mode in ['inn','library']:
        a.r(0,0,96,43,'bark');a.r(0,43,96,21,'wood')
        for x in (0,46,92):a.r(x,0,4,43,'tan')
        a.r(0,4,96,4,'wood');a.r(0,40,96,3,'tan')
        if mode=='library':
            for x in (5,55):
                a.r(x,12,34,31,'dark')
                for y in (15,27,39):a.r(x,y,34,2,'tan')
                for i in range(12):a.r(x+2+(i%6)*5,16+(i//6)*12,3,8-i%3,['red','gold','purple','leaf'][i%4])
            a.r(35,48,31,3,'tan');a.r(38,51,3,11,'bark');a.r(60,51,3,11,'bark');a.r(43,45,13,3,'light')
        else:
            a.r(9,15,21,28,'shade');a.r(13,22,13,19,'ink');a.r(17,33,4,8,'fire');a.r(19,35,2,6,'gold')
            a.r(52,15,25,15,'gold');a.r(55,18,19,9,'dark');a.r(62,18,2,9,'wood')
            for x in (36,69):a.r(x,47,22,4,'tan');a.r(x+3,51,3,11,'bark');a.r(x+16,51,3,11,'bark');a.r(x+9,42,3,5,'gold')
    elif mode=='cavern':
        a.p([(0,0),(96,0),(96,64),(77,51),(79,28),(63,13),(30,11),(13,26),(18,49),(0,64)],'stone')
        a.p([(0,0),(96,0),(96,15),(79,10),(72,24),(63,8),(54,16),(40,7),(24,19),(16,7),(0,18)],'shade')
        a.p([(0,64),(16,45),(24,55),(28,37),(34,57),(77,53),(87,39),(96,54),(96,64)],'shade')
        a.gem(10,27,14,'blue');a.gem(75,40,19,'purple');a.r(40,53,23,4,'water');a.r(45,53,13,1,'blue')
    return a

SCENES=[('pine-grove','Сосновый бор','forest'),('oak-clearing','Лесная поляна','clearing'),('mountain-pass','Горный перевал','mountain'),('red-canyon','Каменный каньон','canyon'),('harbor','Пристань','harbor'),('village-square','Деревенская площадь','square'),('ruined-temple','Руины святилища','temple'),('inn-hall','Зал трактира','inn'),('library','Комната библиотеки','library'),('crystal-cavern','Кристальная пещера','cavern'),('marsh-dusk','Болотный сумрак','marsh'),('shadow-gate','Древний переход','crossing')]
for slug,label,mode in SCENES:add('scene-'+slug,label,'background',scenic(mode),['фон','вид сбоку','локация',mode])

def tree(a,mode):
    a.shadow()
    if mode=='pine':
        a.r(29,38,6,18,'bark');a.r(30,42,2,14,'tan')
        for y,w in [(5,17),(16,29),(28,43)]:a.p([(32,y),(32+w//2,y+20),(32-w//2,y+20)],'ink');a.p([(32,y+3),(32+w//2-3,y+18),(32-w//2+3,y+18)],'leaf');a.p([(32,y+4),(32,y+17),(32-w//2+4,y+17)],'green')
    elif mode=='dead':
        a.p([(25,57),(29,34),(24,25),(14,22),(9,12),(12,11),(18,19),(27,20),(24,6),(28,5),(31,19),(36,15),(37,5),(41,5),(41,17),(35,23),(36,31),(44,25),(49,13),(52,15),(47,29),(36,40),(38,57)],'bark');a.line(30,27,32,55,'tan',2)
    elif mode=='willow':
        a.r(29,29,6,27,'bark');a.r(31,35,2,20,'tan')
        a.p([(10,18),(20,8),(40,8),(53,18),(49,29),(15,29)],'ink');a.p([(12,18),(21,11),(39,11),(50,18),(47,25),(17,25)],'leaf')
        for x,h in [(12,25),(18,32),(24,19),(39,24),(46,32),(51,22)]:a.r(x,21,3,h,'green');a.r(x,21,1,h-4,'mint')
    elif mode=='birch':
        a.r(27,26,6,31,'light');a.r(34,31,4,26,'light')
        for x,y in [(27,31),(27,42),(30,51),(34,40),(35,53)]:a.r(x,y,3,2,'shade')
        a.p([(12,18),(20,7),(34,5),(46,11),(52,23),(41,31),(19,29)],'ink');a.p([(14,18),(22,10),(33,8),(43,13),(49,22),(40,28),(21,26)],'green');a.r(19,15,16,4,'mint');a.r(36,18,9,3,'gold')
    elif mode=='baobab':
        a.p([(21,57),(25,35),(24,22),(18,15),(19,10),(28,18),(36,19),(44,10),(47,14),(39,27),(42,57)],'bark');a.r(28,28,5,27,'tan');a.r(36,38,3,15,'wood')
        for x,y,w in [(8,9,18),(25,5,21),(40,10,17)]:a.p([(x,y+3),(x+5,y),(x+w-4,y),(x+w,y+7),(x+w-3,y+12),(x+3,y+12)],'leaf');a.r(x+5,y+2,w-10,2,'green')
    elif mode=='root-tree':
        a.p([(26,14),(36,14),(38,41),(49,48),(57,55),(49,57),(36,48),(34,58),(26,58),(25,45),(10,57),(6,53),(22,39)],'bark');a.line(29,23,31,48,'tan',3)
        a.p([(7,18),(15,6),(38,4),(55,15),(51,31),(39,36),(17,33),(5,27)],'ink');a.p([(10,18),(18,9),(37,7),(52,16),(48,28),(37,32),(19,30),(8,25)],'leaf');a.r(19,13,18,4,'green');a.r(34,21,12,3,'mint')
    elif mode=='cherry':
        a.p([(26,57),(28,34),(20,25),(14,23),(14,19),(23,22),(32,29),(41,21),(48,19),(49,23),(43,26),(35,34),(38,57)],'bark');a.r(30,38,3,17,'tan')
        for x,y,w in [(7,16,20),(15,6,25),(37,13,20),(29,24,21)]:
            a.p([(x,y+5),(x+5,y),(x+w-5,y),(x+w,y+6),(x+w-2,y+12),(x+3,y+13)],'red');a.r(x+4,y+3,w-8,3,'skin');a.r(x+7,y+7,4,3,'light')
    else:
        a.p([(26,57),(28,30),(23,21),(27,19),(32,28),(39,19),(42,23),(35,32),(37,57)],'bark');a.r(30,35,3,20,'tan')
        leaves='red' if mode=='cherry' else 'leaf'
        canopy=[(7,22),(11,12),(22,8),(39,7),(50,14),(56,25),(49,36),(18,37),(8,31)] if mode!='apple' else [(8,22),(14,11),(25,13),(30,7),(45,10),(47,18),(55,23),(51,34),(40,38),(22,33),(12,35)]
        a.p(canopy,'ink');a.p([(x+(3 if x<32 else -3),y+(3 if y<24 else -3)) for x,y in canopy],leaves)
        for x,y,w in [(15,18,13),(31,14,12),(35,25,12),(20,28,8)]:a.r(x,y,w,3,'skin' if mode=='cherry' else 'green')
        if mode=='apple':
            for x,y in [(19,21),(39,19),(31,30)]:a.r(x,y,4,4,'red');a.r(x+1,y,1,1,'fire')

def plant(a,mode):
    a.shadow(11,55,42)
    if mode in ['fern','reeds','cattails','grass-tuft','lupine','sunflower','thistle','thorn-bush','berry-bush','vine','hanging-vine']:
        if mode in ['thorn-bush','berry-bush']:
            a.p([(11,47),(15,30),(24,23),(37,25),(50,38),(48,54),(14,54)],'ink');a.p([(14,47),(18,34),(25,27),(36,29),(46,39),(45,51),(17,51)],'leaf')
            for x,y in [(19,35),(32,32),(38,44),(22,46)]:
                if mode=='berry-bush':a.r(x,y,4,4,'purple');a.r(x,y,1,1,'violet')
                else:a.p([(x,y+6),(x+3,y-3),(x+5,y+6)],'tan')
        elif mode=='fern':
            a.r(31,26,2,28,'green')
            for y in (28,35,42):a.p([(31,y+5),(13+y//4,y-4),(17+y//4,y+4),(31,y+7)],'leaf');a.p([(33,y+4),(53-y//5,y-5),(51-y//5,y+3),(33,y+7)],'green')
        elif mode in ['vine','hanging-vine']:
            a.p([(17,3),(22,3),(28,17),(20,31),(34,44),(40,57),(35,58),(29,46),(14,31),(22,16)],'wood')
            for x,y in [(22,12),(17,27),(28,38),(35,50)]:a.p([(x,y),(x-10,y-3),(x-12,y+4),(x-5,y+7)],'leaf');a.p([(x+2,y),(x+12,y-7),(x+15,y),(x+8,y+4)],'green')
            if mode=='hanging-vine':a.r(6,2,52,4,'bark');a.r(44,7,2,30,'green');a.r(48,13,2,32,'leaf')
        else:
            for j in range(5 if mode in ['reeds','cattails','grass-tuft'] else 3):
                x=19+j*6;y=18+(j*11)%17;a.r(x,y,2,37-y,'green');a.p([(x,y+17),(x-5,y+5),(x-3,y+17)],'leaf')
                if mode=='cattails':a.r(x-1,y-5,4,10,'wood');a.r(x,y-4,1,6,'gold')
                elif mode=='reeds':a.p([(x,y+1),(x-4,y-8),(x-1,y-4),(x+1,y-13),(x+3,y-4),(x+5,y-7),(x+2,y+2)],'tan');a.r(x,y-5,1,6,'gold')
                elif mode=='grass-tuft':a.p([(x,55),(x-8,y),(x-2,y+7)],'green');a.p([(x,55),(x+7,y+5),(x+5,y+13)],'mint')
                elif mode=='lupine':
                    for k in range(4):a.r(x-2,y-k*4,6,3,'purple' if k%2 else 'violet')
                elif mode=='sunflower':a.p([(x-6,y-4),(x-2,y-8),(x+4,y-7),(x+8,y-2),(x+5,y+4),(x-3,y+5)],'gold');a.r(x-2,y-3,6,6,'wood')
                elif mode=='thistle':a.r(x-3,y-3,8,5,'purple');a.p([(x-4,y),(x-7,y+4),(x+8,y+4),(x+5,y)],'leaf')
    elif mode in ['red-mushroom','glow-mushroom','giant-mushroom','mushroom-cluster']:
        if mode=='glow-mushroom':
            for x,y,w,h in [(10,23,22,30),(29,12,26,42)]:
                a.r(x+w//2-2,y+11,5,h-11,'water');a.r(x+w//2-1,y+13,1,h-15,'mint')
                a.p([(x,y+12),(x+4,y+3),(x+w//2,y),(x+w-4,y+4),(x+w,y+12),(x+w-3,y+17),(x+3,y+17)],'mint');a.r(x+3,y+12,w-6,3,'light')
                for px in range(x+5,x+w-3,4):a.r(px,y+15,1,4,'blue')
            return
        n=3 if mode=='mushroom-cluster' else 1
        for i in range(n):
            x=13+i*13 if n==3 else 13;y=29-i%2*9 if n==3 else 13 if mode=='giant-mushroom' else 24;w=20 if n==3 else 38
            a.r(x+w//2-3,y+10,6,42-y,'light');a.r(x+w//2+1,y+13,2,36-y,'tan')
            a.p([(x,y+12),(x+4,y+3),(x+w//2,y),(x+w-4,y+4),(x+w,y+12),(x+w,y+16),(x,y+16)],'ink');a.p([(x+3,y+12),(x+6,y+5),(x+w//2,y+3),(x+w-6,y+6),(x+w-3,y+12)],'mint' if mode=='glow-mushroom' else 'red')
            for dx,dy in [(7,9),(w//2,5),(w-10,11)]:a.r(x+dx,y+dy,3,2,'light')
            if mode=='giant-mushroom':
                a.r(x+8,y+14,w-16,3,'tan');a.r(x+w//2-6,y+23,13,4,'light');a.r(x+w//2-1,y+28,2,12,'wood')
                for px in range(x+6,x+w-4,5):a.r(px,y+13,1,6,'skinshade')
    elif mode in ['stump','log','woodpile']:
        if mode=='stump':
            a.p([(19,30),(43,30),(46,53),(52,56),(40,58),(34,53),(20,58),(12,55),(18,50)],'bark');a.r(21,32,19,20,'wood');a.p([(17,27),(23,23),(39,23),(46,27),(42,34),(22,34)],'tan');a.r(25,26,13,5,'wood');a.r(28,27,7,2,'gold')
        else:
            for i in range(3 if mode=='woodpile' else 1):
                x=7+i*7;y=43-i*10;a.box(x,y,44-i*7,10,'bark');a.r(x+3,y+3,32-i*7,2,'tan');a.r(x+36-i*7,y+2,6,6,'gold');a.r(x+38-i*7,y+3,2,4,'wood')
    elif mode=='lily-pad':
        a.p([(10,29),(19,21),(43,21),(53,31),(45,47),(23,50),(10,39)],'leaf');a.p([(31,24),(35,36),(51,35),(42,43),(32,43),(19,35)],'green');a.p([(32,24),(29,12),(35,16),(43,13),(42,22),(49,26),(36,31)],'violet');a.r(34,22,4,4,'gold')
    elif mode=='lotus':
        a.r(30,30,3,25,'green');a.p([(31,29),(15,18),(20,11),(30,17),(32,5),(38,16),(48,10),(51,20),(36,31)],'violet');a.p([(31,28),(24,17),(31,22),(35,13),(39,25)],'light');a.r(29,27,8,3,'gold')
    elif mode=='cactus':
        a.box(26,12,12,45,'leaf');a.box(13,27,9,17,'leaf');a.box(42,22,9,19,'leaf');a.r(19,37,9,6,'leaf');a.r(36,34,9,6,'leaf');a.r(30,16,2,36,'mint')
        for x,y in [(28,20),(15,31),(45,27),(34,40)]:a.r(x,y,1,5,'gold');a.r(x-2,y+2,5,1,'gold')
    elif mode=='bamboo':
        for x,y in [(19,8),(30,4),(42,15)]:
            a.r(x,y,5,51-y,'leaf');a.r(x+1,y,1,51-y,'mint')
            for k in range(y+8,54,10):a.r(x,k,5,2,'gold')
            a.p([(x+2,y+9),(x+13,y+4),(x+8,y+13)],'green')

BOTANY=[('oak','Дуб','tree'),('pine','Сосна','tree'),('birch','Берёза','tree'),('willow','Ива','tree'),('dead','Сухое дерево','tree'),('baobab','Толстоствольное дерево','tree'),('cherry','Цветущее дерево','tree'),('root-tree','Дерево с мощными корнями','tree'),('apple','Яблоня','tree'),('fern','Папоротник','plant'),('reeds','Камыш','plant'),('cattails','Рогоз','plant'),('grass-tuft','Пучок травы','plant'),('lupine','Люпин','plant'),('sunflower','Подсолнух','plant'),('thistle','Чертополох','plant'),('thorn-bush','Колючий куст','plant'),('berry-bush','Ягодный куст','plant'),('vine','Лоза','plant'),('hanging-vine','Свисающие лианы','plant'),('red-mushroom','Красный гриб','plant'),('glow-mushroom','Светящийся гриб','plant'),('giant-mushroom','Огромный гриб','plant'),('mushroom-cluster','Группа грибов','plant'),('stump','Пень','plant'),('log','Упавшее бревно','plant'),('woodpile','Поленница','plant'),('lily-pad','Кувшинка на листе','plant'),('lotus','Лотос','plant'),('cactus','Кактус','plant'),('bamboo','Бамбук','plant')]
for mode,label,family in BOTANY:
    a=Art();(tree if family=='tree' else plant)(a,mode);add('object-'+mode,label,'object',a,['окружение','растительность',mode],'tree' if family=='tree' else 'rock')

def mineral(a,mode):
    a.shadow()
    if mode in ['boulder','flat-rock','rock-pile','ore-iron','ore-copper','ore-gold','meteorite']:
        if mode=='flat-rock':pts=[(8,45),(19,36),(43,35),(57,44),(52,54),(13,54)]
        else:pts=[(12,54),(6,39),(18,21),(42,18),(57,37),(52,54)]
        a.p(pts,'ink')
        if mode=='flat-rock':a.p([(12,45),(20,39),(43,38),(53,44),(49,51),(15,51)],'stone');a.p([(13,45),(21,40),(41,39),(48,43)],'steel');a.r(19,48,29,2,'shade');return
        a.p([(15,51),(10,39),(20,25),(41,22),(53,37),(49,51)],'stone');a.p([(20,25),(40,22),(32,37),(11,40)],'steel');a.p([(32,37),(53,37),(49,51),(31,51)],'shade')
        if mode.startswith('ore-'):
            c={'ore-iron':'light','ore-copper':'fire','ore-gold':'gold'}[mode]
            if mode=='ore-iron':
                a.p([(18,28),(29,26),(32,32),(27,39),(17,37)],c);a.r(21,29,5,3,'steel');a.p([(36,34),(46,33),(49,40),(43,45),(35,43)],c);a.r(39,37,6,2,'steel')
            elif mode=='ore-copper':
                a.p([(21,25),(25,26),(28,33),(39,34),(42,40),(47,46),(43,49),(36,39),(27,38),(24,31)],c);a.line(26,34,17,43,'fire',2);a.r(36,34,3,2,'gold')
            else:
                for x,y,w in [(18,30,4),(29,27,3),(32,36,6),(24,43,3),(41,41,3),(43,31,4)]:a.p([(x,y),(x+w,y-1),(x+w+1,y+3),(x+1,y+4)],c);a.r(x,y,2,1,'white')
        if mode=='meteorite':a.gem(23,29,17,'violet');a.r(13,42,5,3,'red')
        if mode=='rock-pile':
            for x,y in [(4,43),(42,46)]:a.p([(x,y+10),(x+4,y),(x+13,y+2),(x+17,y+11)],'shade');a.r(x+5,y+2,6,2,'steel')
    elif mode in ['crystal-cluster','ice-spire','stalagmites','stalactites']:
        if mode=='ice-spire':
            a.p([(9,55),(19,24),(17,15),(27,20),(33,4),(41,19),(38,28),(51,19),(48,37),(57,55)],'ink')
            a.p([(14,52),(24,26),(23,22),(29,27),(34,10),(38,21),(35,31),(47,27),(42,42),(52,52)],'blue');a.line(34,12,33,51,'light',3);a.line(25,29,18,49,'light',2);a.p([(14,52),(51,52),(47,57),(19,57)],'steel');return
        if mode in ['stalagmites','stalactites']:
            for x,y,w in [(10,25,13),(25,10,16),(40,30,13)]:
                pts=[(x-2,56),(x+1,43),(x+3,30),(x+w//2,y),(x+w-2,40),(x+w+3,56)]
                if mode=='stalactites':pts=[(px,64-py) for px,py in pts]
                a.p(pts,'stone');a.p([(x+2,55),(x+4,32),(x+w//2,y+6),(x+w//2,52)],'steel') if mode=='stalagmites' else a.p([(x+2,9),(x+4,32),(x+w//2,58-y),(x+w//2,12)],'steel')
            return
        c='blue' if mode=='ice-spire' else 'purple' if mode=='crystal-cluster' else 'stone'
        for x,y,w in [(11,26,12),(25,7,15),(39,21,14)]:
            if mode=='stalactites':a.p([(x,8),(x+w,8),(x+w//2,57-y//2)],c);a.line(x+2,9,x+w//2,50-y//2,'steel',2)
            else:a.p([(x,55),(x,y+9),(x+w//2,y),(x+w,y+9),(x+w,55)],'ink');a.p([(x+2,53),(x+2,y+10),(x+w//2,y+4),(x+w-2,y+10),(x+w-2,53)],c);a.line(x+w//2,y+5,x+w//2,50,'light',2)
    elif mode=='geode':
        a.p([(10,22),(26,10),(43,14),(56,30),(51,48),(35,56),(17,50),(6,37)],'stone');a.p([(17,26),(29,17),(42,23),(47,35),(39,46),(23,44),(13,35)],'ink');a.gem(22,25,15,'purple');a.gem(32,34,10,'violet')
    elif mode=='fossil':
        a.p([(9,17),(49,13),(57,43),(44,55),(14,52),(5,37)],'stone');a.r(23,25,18,4,'light');a.r(19,30,4,15,'light');a.r(25,44,16,3,'light');a.r(39,30,4,13,'light');a.r(27,32,10,3,'light');a.r(26,36,3,7,'light');a.r(31,39,7,3,'light')
    elif mode=='bones':
        a.p([(8,22),(12,17),(18,19),(39,43),(46,42),(49,48),(44,53),(38,49),(15,26),(10,27)],'light');a.p([(8,46),(11,40),(17,40),(37,20),(39,13),(45,12),(49,18),(44,24),(18,47),(15,53),(9,53)],'steel');a.r(12,20,4,2,'white')
    elif mode=='lava-rock':
        a.p([(8,55),(10,29),(22,13),(45,20),(57,45),(51,56)],'ink');a.p([(13,51),(16,31),(24,19),(43,25),(50,44),(46,51)],'shade');a.p([(26,20),(32,30),(27,40),(40,51),(34,51),(22,42),(27,30),(21,22)],'red');a.r(28,32,2,6,'fire')
    elif mode=='rune-stone':
        a.p([(15,55),(17,16),(25,8),(40,11),(49,24),(48,55)],'ink');a.p([(18,53),(20,18),(27,12),(38,14),(45,25),(44,53)],'stone');a.r(29,23,3,25,'mint');a.line(30,23,39,31,'mint',2);a.line(30,39,39,33,'mint',2);a.r(22,31,6,2,'mint')

MINERALS=[('boulder','Валун'),('flat-rock','Плоский камень'),('rock-pile','Каменная осыпь'),('ore-iron','Железная руда'),('ore-copper','Медная руда'),('ore-gold','Золотая жила'),('meteorite','Оплавленный метеорит'),('crystal-cluster','Друза кристаллов'),('ice-spire','Ледяной шпиль'),('stalagmites','Сталагмиты'),('stalactites','Сталактиты'),('geode','Расколотая жеода'),('fossil','Камень с окаменелостью'),('bones','Останки костей'),('lava-rock','Камень с лавовыми трещинами'),('rune-stone','Рунический камень')]
for mode,label in MINERALS:
    a=Art();mineral(a,mode);add('object-'+mode,label,'object',a,['окружение','камень','ресурс',mode],'rock')

def furniture(a,mode):
    a.shadow()
    if mode in ['table','round-table','bench','chair','throne','stool','desk','workbench','altar']:
        if mode in ['chair','throne']:
            a.box(19,12 if mode=='throne' else 21,26,33 if mode=='throne' else 25,'purple' if mode=='throne' else 'wood');a.box(16,39,32,8,'wood')
            a.r(19,47,4,10,'bark');a.r(41,47,4,10,'bark');a.r(14,30,4,16,'gold');a.r(46,30,4,16,'gold')
            if mode=='throne':a.p([(20,13),(18,4),(27,10),(32,3),(37,10),(46,4),(44,13)],'gold');a.gem(27,20,10,'mint')
        elif mode=='altar':a.box(11,28,42,10,'stone');a.box(20,38,24,17,'shade');a.r(14,30,36,2,'light');a.gem(26,15,12,'violet');a.r(27,44,10,2,'mint')
        else:
            w=48 if mode in ['table','desk','workbench'] else 44 if mode in ['round-table','bench'] else 26
            x=(64-w)//2;a.box(x,33,w,10,'wood');a.r(x+4,43,4,13,'bark');a.r(x+w-8,43,4,13,'bark')
            if mode=='round-table':a.p([(x+7,28),(x+w-7,28),(x+w,34),(x+w-6,43),(x+6,43),(x,34)],'wood');a.r(x+8,30,w-16,2,'tan')
            if mode=='bench':a.r(x,25,w,5,'tan');a.r(x+3,29,3,8,'bark');a.r(x+w-6,29,3,8,'bark')
            if mode=='desk':a.box(38,43,15,13,'wood');a.r(42,47,7,2,'gold');a.r(15,29,15,4,'light');a.r(38,27,3,6,'gold')
            if mode=='workbench':a.box(11,43,42,8,'wood');a.r(15,27,8,6,'steel');a.r(17,21,3,7,'wood');a.r(33,30,15,3,'gold')
    elif mode in ['bed','cot','bedroll','hammock']:
        if mode=='cot':
            a.p([(12,25),(52,25),(56,43),(8,43)],'ink');a.p([(15,28),(49,28),(51,39),(12,39)],'tan');a.r(16,29,14,6,'light');a.line(13,43,26,56,'wood',4);a.line(13,56,26,43,'wood',4);a.line(38,43,51,56,'wood',4);a.line(38,56,51,43,'wood',4);return
        if mode=='hammock':
            a.r(5,14,3,42,'wood');a.r(55,14,3,42,'wood');a.p([(8,25),(29,39),(54,25),(53,32),(32,47),(24,46),(9,32)],'purple');a.line(9,26,28,40,'violet',2)
        elif mode=='bedroll':a.box(15,17,34,36,'leaf');a.r(17,20,30,7,'tan');a.r(22,28,2,20,'mint');a.r(39,28,2,20,'mint')
        else:a.box(12,18,40,34,'wood');a.r(16,22,32,25,'purple' if mode=='bed' else 'tan');a.r(17,22,13,9,'light');a.r(16,34,32,2,'violet');a.r(12,12,4,45,'wood');a.r(48,17,4,40,'wood')
    elif mode in ['bookcase','cabinet','wardrobe','shelf','weapon-rack']:
        a.box(12,10,40,47,'wood');a.r(16,14,32,38,'dark')
        if mode=='wardrobe':a.r(15,14,15,39,'wood');a.r(33,14,15,39,'wood');a.r(27,31,2,8,'gold');a.r(34,31,2,8,'gold')
        elif mode=='cabinet':
            for y in (16,29,42):a.box(16,y,32,10,'wood');a.r(28,y+4,8,2,'gold')
        elif mode=='weapon-rack':
            for x,y in [(19,14),(32,20),(43,14)]:a.r(x,y,2,34,'steel');a.r(x-4,41,10,2,'gold');a.r(x,44,2,7,'wood')
            a.r(15,25,34,3,'tan')
        else:
            for j,y in enumerate((24,38,52)):
                a.r(14,y,36,3,'tan')
                if mode=='bookcase':
                    for i in range(6):a.r(17+i*5,y-8-i%3,3,8+i%3,['red','leaf','purple','gold','steel'][i%5]);a.r(18+i*5,y-6,1,2,'light')
                else:a.box(17,y-10,10,9,'bark');a.r(35,y-7,6,7,'gold');a.r(37,y-11,2,4,'gold')
    elif mode in ['chest','locked-chest','crate','barrel','sack','basket','jar','amphora']:
        if mode in ['chest','locked-chest','crate']:
            a.box(11,26,42,29,'wood');a.r(12,38,40,3,'bark')
            if mode=='crate':
                a.line(14,29,48,51,'tan',3);a.line(15,50,49,29,'tan',3)
            else:
                for x in (17,43):a.r(x,26,4,29,'steel');a.r(x,27,1,26,'light')
                a.box(27,36,10,9,'gold');a.r(31,39,2,4,'ink')
                if mode=='locked-chest':a.r(29,30,6,3,'steel');a.r(28,31,2,6,'steel');a.r(34,31,2,6,'steel')
        elif mode=='barrel':
            a.p([(17,16),(47,16),(52,26),(52,46),(47,56),(17,56),(12,46),(12,26)],'ink');a.p([(20,19),(44,19),(48,27),(48,45),(44,53),(20,53),(16,45),(16,27)],'wood')
            for x in (23,31,39):a.r(x,20,1,32,'tan')
            a.r(15,25,34,4,'steel');a.r(15,44,34,4,'steel');a.r(20,19,24,2,'tan')
        elif mode in ['jar','amphora']:
            a.r(27,13,10,7,'gold');a.p([(27,20),(18,28),(15,45),(22,55),(43,55),(49,45),(45,28),(37,20)],'wood');a.r(20,31,4,15,'tan');a.r(25,50,16,2,'gold');a.r(26,14,12,2,'tan')
            if mode=='amphora':a.box(10,24,9,19,'tan');a.box(45,24,9,19,'tan');a.r(12,27,4,12,'ink');a.r(48,27,4,12,'ink')
        elif mode=='basket':
            a.p([(10,32),(54,32),(47,54),(17,54)],'tan');a.r(20,16,24,3,'wood');a.r(17,19,3,16,'wood');a.r(44,19,3,16,'wood')
            for y in (36,42,48):a.r(15,y,34,2,'bark')
            for x in (22,31,40):a.line(x,32,x-3,53,'gold',2)
        else:a.p([(25,22),(20,12),(24,9),(32,16),(40,9),(44,13),(39,22),(49,35),(48,52),(38,56),(21,56),(14,46),(16,33)],'tan');a.r(23,21,19,3,'bark');a.r(20,34,3,13,'gold')
    elif mode in ['rug','screen','mirror','bathtub','anvil','forge','loom','spinning-wheel']:
        if mode=='rug':a.p([(11,22),(53,22),(58,49),(6,49)],'purple');a.p([(17,27),(47,27),(51,44),(13,44)],'red');a.p([(32,27),(42,36),(32,44),(22,36)],'gold');a.r(10,50,45,3,'tan')
        elif mode=='screen':
            for x,y in [(7,13),(25,10),(43,13)]:a.box(x,y,15,42,'wood');a.r(x+3,y+3,9,34,'purple');a.r(x+3,y+18,9,2,'gold')
        elif mode=='mirror':a.p([(21,12),(43,12),(51,23),(51,44),(43,52),(21,52),(13,44),(13,23)],'gold');a.p([(23,16),(41,16),(47,25),(47,42),(41,48),(23,48),(17,42),(17,25)],'blue');a.p([(21,20),(39,20),(23,42),(20,42)],'light');a.r(25,52,14,4,'wood')
        elif mode=='bathtub':a.p([(8,30),(56,30),(53,48),(44,55),(20,55),(11,48)],'steel');a.p([(12,28),(52,28),(56,34),(51,40),(13,40),(8,34)],'light');a.r(14,31,36,6,'water');a.r(18,32,22,1,'blue');a.r(15,54,4,4,'wood');a.r(45,54,4,4,'wood')
        elif mode=='anvil':a.p([(7,25),(47,25),(57,30),(48,35),(38,35),(37,45),(46,50),(46,55),(18,55),(18,50),(27,45),(26,35),(13,35)],'steel');a.r(10,25,36,3,'light');a.r(27,35,10,8,'stone')
        elif mode=='forge':a.box(10,24,44,30,'shade');a.r(17,31,30,19,'ink');a.p([(21,48),(19,41),(25,36),(28,42),(34,30),(40,42),(45,46),(41,50)],'red');a.p([(26,48),(28,39),(34,36),(38,46)],'gold');a.box(16,10,32,14,'stone');a.r(22,4,20,6,'shade')
        elif mode=='loom':a.box(9,10,46,47,'wood');a.r(13,14,38,32,'dark');a.r(12,20,40,3,'tan');a.r(12,43,40,3,'tan')
        elif mode=='spinning-wheel':
            a.p([(11,23),(19,15),(35,15),(43,23),(43,38),(35,46),(19,46),(11,38)],'wood');a.p([(15,25),(21,19),(33,19),(39,25),(39,36),(33,42),(21,42),(15,36)],'dark')
            for x1,y1,x2,y2 in [(26,18,26,43),(15,29,39,29),(18,22,35,39),(18,39,35,22)]:a.line(x1,y1,x2,y2,'tan',2)
            a.r(26,44,4,12,'wood');a.r(49,20,4,36,'wood');a.r(43,33,12,3,'gold');a.r(44,17,14,4,'light')
        if mode=='loom':
            for x in range(17,49,4):a.r(x,15,1,27,'light')
            a.r(16,29,34,11,'purple');a.r(16,33,34,2,'gold')

FURNITURE=[('table','Обеденный стол'),('round-table','Круглый стол'),('bench','Скамья'),('chair','Кресло'),('throne','Трон'),('stool','Табурет'),('desk','Письменный стол'),('workbench','Верстак'),('altar','Алтарь'),('bed','Кровать'),('cot','Походная койка'),('bedroll','Спальный тюфяк'),('hammock','Гамак'),('bookcase','Книжный шкаф'),('cabinet','Комод'),('wardrobe','Гардероб'),('shelf','Полка с утварью'),('weapon-rack','Стойка оружия'),('chest','Сундук'),('locked-chest','Сундук с навесным замком'),('crate','Дощатый ящик'),('barrel','Бочка'),('sack','Мешок припасов'),('basket','Плетёная корзина'),('jar','Глиняный сосуд'),('amphora','Амфора'),('rug','Узорчатый ковёр'),('screen','Складная ширма'),('mirror','Напольное зеркало'),('bathtub','Купель'),('anvil','Наковальня'),('forge','Горн'),('loom','Ткацкий станок'),('spinning-wheel','Прялка')]
for mode,label in FURNITURE:
    a=Art();furniture(a,mode);add('object-'+mode,label,'object',a,['окружение','интерьер','мебель',mode],'crate' if mode in ['chest','locked-chest','crate','barrel','sack','basket','jar','amphora'] else 'platform')

def structure(a,mode):
    a.shadow()
    if mode in ['brick-wall','stone-wall','palisade','iron-fence','broken-wall']:
        if mode=='stone-wall':
            a.box(5,17,54,39,'shade')
            for x,y,w,h in [(7,19,17,12),(26,19,15,8),(43,19,13,12),(7,33,10,12),(19,33,20,8),(41,33,15,10),(7,47,15,7),(24,43,16,11),(42,45,14,9)]:a.p([(x+2,y),(x+w,y+1),(x+w-1,y+h),(x,y+h-1),(x,y+3)],'stone');a.r(x+3,y+2,w-6,1,'steel')
            return
        if mode=='palisade':
            for x,h in [(7,37),(17,46),(27,40),(37,46),(47,37)]:a.p([(x,56),(x,56-h+5),(x+4,56-h),(x+8,56-h+5),(x+8,56)],'wood');a.r(x+2,56-h+7,2,h-9,'tan')
            a.r(6,34,51,4,'bark');a.r(6,46,51,4,'bark')
        elif mode=='iron-fence':
            for x in range(8,58,10):a.r(x,17,3,40,'steel');a.p([(x-2,17),(x+1,10),(x+5,17)],'gold')
            a.r(6,26,52,3,'stone');a.r(6,47,52,3,'stone')
        else:
            h=39 if mode!='broken-wall' else 29;a.box(5,56-h,54,h,'wood' if mode=='brick-wall' else 'stone')
            for row,y in enumerate(range(57-h,56,9)):
                a.r(7,y+7,50,1,'ink')
                for x in range(8+(row%2)*8,58,16):a.r(x,y,1,7,'ink');a.r(x+2,y+1,10,1,'tan' if mode=='brick-wall' else 'steel')
            if mode=='broken-wall':a.p([(24,20),(34,20),(34,30),(44,30),(44,40),(30,40),(30,34),(24,34)],'dark')
    elif mode in ['wood-door','iron-door','arched-door','portcullis','gate','window','shutters']:
        if mode in ['window','shutters']:a.box(12,13,40,38,'wood');a.r(16,17,32,30,'blue');a.r(30,17,3,30,'wood');a.r(16,31,32,3,'wood');a.p([(18,18),(28,18),(18,29)],'light')
        elif mode=='arched-door':a.p([(13,57),(13,24),(22,10),(42,10),(51,24),(51,57)],'stone');a.p([(19,55),(19,26),(26,17),(38,17),(45,26),(45,55)],'wood');a.r(23,27,2,27,'tan');a.r(39,38,3,4,'gold')
        else:
            a.box(10,8,44,49,'stone');a.r(16,13,32,42,'dark')
            if mode=='portcullis':
                for x in range(17,48,6):a.r(x,14,2,38,'steel');a.p([(x,52),(x+2,52),(x+1,57)],'steel')
                for y in (23,35,47):a.r(17,y,31,2,'stone')
            else:
                a.r(17,14,30,39,'steel' if mode=='iron-door' else 'wood')
                for x in (22,30,38):a.r(x,14,1,39,'shade' if mode=='iron-door' else 'bark')
                for y in (22,44):a.r(17,y,30,3,'stone')
                a.r(39,32,3,5,'gold')
                if mode=='gate':a.r(30,14,3,39,'ink');a.r(26,31,2,7,'gold');a.r(35,31,2,7,'gold')
                if mode=='iron-door':
                    a.r(18,35,29,3,'stone');a.line(18,16,46,50,'stone',3)
                    for rx,ry in [(20,18),(42,18),(20,46),(43,46),(30,36)]:a.r(rx,ry,2,2,'light')
        if mode=='shutters':a.box(6,16,13,35,'wood');a.box(45,16,13,35,'wood');a.r(8,23,9,2,'tan');a.r(47,39,9,2,'tan')
    elif mode in ['stairs','ladder','bridge','rope-bridge','platform','trapdoor','well','fountain']:
        if mode=='ladder':a.r(17,7,5,49,'wood');a.r(42,7,5,49,'wood');a.r(18,8,1,45,'tan');a.r(43,8,1,45,'tan')
        elif mode in ['stairs','platform']:
            for i in range(5 if mode=='stairs' else 2):a.box(8+i*4,50-i*8,48-i*8,8,'stone');a.r(10+i*4,50-i*8,44-i*8,2,'steel')
        elif mode in ['bridge','rope-bridge']:
            for i in range(7):a.box(4+i*8,33+abs(3-i),9,16,'wood')
            a.r(5,17,3,36,'wood');a.r(56,17,3,36,'wood')
            if mode=='bridge':a.r(6,23,51,4,'tan');a.r(17,24,3,17,'wood');a.r(44,24,3,17,'wood')
            else:a.p([(7,18),(31,29),(57,18),(57,20),(31,32),(7,20)],'tan');a.line(18,24,20,35,'gold',1);a.line(46,23,44,35,'gold',1)
        elif mode=='trapdoor':a.p([(11,22),(53,22),(58,48),(6,48)],'ink');a.p([(14,25),(50,25),(54,45),(10,45)],'wood');a.r(13,32,39,2,'tan');a.r(13,40,39,2,'tan');a.r(39,29,7,3,'gold')
        elif mode=='well':
            a.box(13,37,38,19,'stone');a.r(18,37,28,5,'ink');a.r(10,16,4,40,'wood');a.r(50,16,4,40,'wood');a.p([(5,16),(31,5),(59,16),(59,20),(5,20)],'wood');a.r(14,17,36,2,'tan');a.r(31,22,2,25,'gold');a.r(25,43,13,8,'wood');a.r(27,44,9,2,'steel')
        else:
            a.p([(9,42),(21,36),(43,36),(56,43),(52,53),(13,53)],'stone');a.r(17,42,30,5,'water');a.r(28,18,8,26,'steel');a.r(20,20,24,4,'light');a.r(30,12,4,8,'gold');a.r(23,26,2,12,'blue');a.r(40,26,2,14,'blue')
        if mode=='ladder':
            for y in range(12,56,8):a.r(20,y,24,3,'tan')
    elif mode in ['column','broken-column','archway','obelisk','statue','gravestone','cross-marker','signpost']:
        if mode in ['column','broken-column']:a.box(17,49,30,8,'stone');a.box(22,15 if mode=='column' else 31,20,34 if mode=='column' else 18,'stone');a.r(25,18 if mode=='column' else 34,3,29 if mode=='column' else 13,'steel');a.r(35,18 if mode=='column' else 34,2,29 if mode=='column' else 13,'shade');a.box(18,9 if mode=='column' else 26,28,6,'steel')
        elif mode=='archway':a.p([(9,57),(9,24),(20,9),(44,9),(55,24),(55,57),(45,57),(45,26),(38,19),(26,19),(19,26),(19,57)],'stone');a.r(11,29,3,26,'steel');a.r(48,29,3,26,'shade');a.r(26,11,12,3,'light')
        elif mode=='obelisk':a.p([(24,50),(26,14),(32,5),(38,14),(40,50)],'stone');a.p([(27,16),(32,9),(32,48),(26,48)],'steel');a.box(17,50,30,7,'shade');a.r(33,24,2,13,'mint')
        elif mode=='statue':a.box(17,49,30,8,'stone');a.p([(24,48),(23,29),(18,34),(15,30),(25,20),(26,13),(38,13),(39,22),(46,31),(43,36),(37,29),(40,48)],'stone');a.r(29,9,8,11,'steel');a.r(26,24,5,17,'steel');a.r(30,16,3,2,'shade')
        elif mode=='gravestone':a.p([(18,56),(18,24),(24,16),(40,16),(46,24),(46,56)],'stone');a.r(21,26,22,3,'steel');a.r(24,34,16,2,'shade');a.r(26,40,12,2,'shade');a.r(16,55,33,3,'shade')
        elif mode=='cross-marker':a.r(28,12,7,45,'wood');a.r(14,24,35,7,'wood');a.r(29,13,2,41,'tan');a.r(15,25,32,2,'tan')
        else:a.r(29,9,5,48,'wood');a.p([(8,15),(46,15),(54,21),(46,27),(8,27)],'wood');a.r(12,17,29,2,'tan');a.p([(17,32),(47,32),(47,44),(17,44),(9,38)],'tan');a.r(25,37,16,2,'bark')
    elif mode in ['tent','awning','campfire','brazier','torch','street-lamp','hanging-lantern','candle-stand','bell','waterwheel','cart','wheelbarrow','boat','target','scarecrow','cage','chain','rope-coil','banner','notice-board']:
        if mode=='tent':a.p([(5,54),(30,12),(34,12),(59,54)],'ink');a.p([(10,51),(31,17),(54,51)],'tan');a.p([(22,51),(32,29),(43,51)],'dark');a.r(31,12,2,41,'wood');a.r(7,53,50,3,'wood')
        elif mode=='awning':a.r(9,21,4,36,'wood');a.r(51,21,4,36,'wood');a.p([(5,20),(14,11),(51,11),(59,20),(59,29),(5,29)],'purple');a.r(6,21,52,3,'violet');a.r(21,12,5,17,'gold');a.r(38,12,5,17,'gold')
        elif mode in ['campfire','brazier','torch']:
            if mode=='torch':a.r(28,26,7,31,'wood');a.r(26,24,11,5,'steel')
            elif mode=='brazier':a.p([(15,31),(49,31),(44,40),(20,40)],'steel');a.r(21,40,4,17,'stone');a.r(39,40,4,17,'stone')
            else:a.p([(12,53),(16,46),(50,49),(48,57)],'wood');a.p([(14,51),(47,44),(52,50),(17,57)],'tan')
            fy=24 if mode=='torch' else 30 if mode=='brazier' else 43
            a.p([(23,fy),(18,fy-10),(24,fy-17),(25,fy-24),(33,fy-17),(39,fy-28),(44,fy-10),(39,fy)],'red');a.p([(27,fy),(24,fy-10),(32,fy-19),(37,fy-9),(36,fy)],'fire');a.p([(30,fy),(30,fy-11),(35,fy-6),(33,fy)],'gold')
        elif mode in ['street-lamp','hanging-lantern','candle-stand']:
            if mode=='street-lamp':a.r(29,12,4,43,'steel');a.r(22,54,18,3,'stone');a.r(20,11,15,3,'steel');a.r(20,12,2,7,'steel')
            elif mode=='hanging-lantern':a.r(7,5,49,3,'wood');a.r(31,8,2,12,'steel')
            else:a.r(29,20,5,35,'gold');a.r(15,33,35,3,'gold');a.r(15,23,4,13,'gold');a.r(46,23,4,13,'gold');a.r(21,53,22,4,'gold')
            if mode=='candle-stand':
                for x,y in [(14,13),(28,9),(45,13)]:a.r(x,y+5,6,11,'light');a.r(x+2,y,2,5,'fire')
            else:
                x,y=(14,18) if mode=='street-lamp' else (23,20);a.box(x,y,18,22,'gold');a.r(x+4,y+4,10,14,'mint');a.r(x+7,y+5,3,11,'light');a.r(x+2,y+9,14,2,'stone')
        elif mode=='bell':a.r(12,9,40,5,'wood');a.r(11,10,4,47,'wood');a.r(49,10,4,47,'wood');a.r(30,13,3,9,'steel');a.p([(24,21),(39,21),(43,42),(49,46),(49,50),(14,50),(14,46),(20,42)],'gold');a.r(25,25,3,16,'light');a.r(29,50,5,5,'wood')
        elif mode=='waterwheel':
            a.p([(11,20),(20,11),(43,11),(53,21),(53,44),(43,54),(20,54),(11,44)],'wood');a.p([(16,23),(23,16),(40,16),(48,23),(48,41),(40,49),(23,49),(16,41)],'dark')
            for i in range(8):
                dx=round(math.cos(i*math.pi/4)*22);dy=round(math.sin(i*math.pi/4)*22);a.line(31,32,31+dx,32+dy,'tan',3)
            a.box(27,28,9,9,'steel');a.r(2,54,60,4,'water')
        elif mode in ['cart','wheelbarrow']:
            a.box(10,27,39 if mode=='cart' else 32,21,'wood');a.r(12,32,33,2,'tan');a.r(15,46,43,3,'wood')
            for x in ([16,41] if mode=='cart' else [19]):a.p([(x-5,48),(x,43),(x+7,46),(x+8,54),(x+2,58),(x-5,55)],'ink');a.r(x-2,48,7,7,'stone');a.r(x,50,3,3,'gold')
            if mode=='wheelbarrow':a.line(43,37,60,31,'tan',3);a.r(40,48,3,10,'wood')
        elif mode=='boat':a.p([(4,30),(59,30),(53,46),(42,54),(18,51),(9,43)],'bark');a.p([(8,29),(54,29),(47,40),(16,40)],'tan');a.r(19,31,26,7,'dark');a.r(29,28,5,13,'wood');a.line(20,47,51,17,'tan',3);a.p([(49,18),(55,12),(59,16),(55,22)],'wood')
        elif mode=='target':a.r(29,40,5,17,'wood');a.box(13,10,38,34,'wood');a.box(18,14,28,25,'light');a.box(23,19,18,15,'red');a.box(28,23,8,7,'gold');a.line(32,26,54,12,'steel',1);a.r(50,10,7,4,'leaf')
        elif mode=='scarecrow':a.r(30,14,4,44,'wood');a.r(10,27,45,4,'wood');a.p([(21,21),(43,21),(47,43),(39,49),(23,49),(17,41)],'tan');a.r(23,10,18,13,'light');a.r(18,9,28,4,'wood');a.r(25,5,13,5,'tan');a.r(26,15,3,2,'ink');a.r(35,15,3,2,'ink');a.r(29,21,7,2,'wood');a.r(21,36,22,3,'wood')
        elif mode=='cage':a.box(10,12,44,44,'steel');a.r(14,16,36,36,'dark');a.r(15,40,34,2,'stone');a.r(8,10,48,4,'stone')
        elif mode=='chain':
            for x,y in [(25,5),(29,14),(25,23),(29,32),(25,41)]:a.box(x,y,11,15,'steel');a.r(x+3,y+3,5,9,'dark');a.r(x+1,y+2,1,10,'light')
        elif mode=='rope-coil':
            for pts in [[(9,28),(17,18),(43,18),(54,27),(54,43),(45,53),(18,53),(8,43)],[(15,30),(21,24),(39,24),(47,30),(47,40),(40,47),(22,47),(15,41)],[(22,31),(27,29),(36,29),(41,33),(40,40),(36,42),(26,42),(21,38)]]:
                a.p(pts,'tan');a.p([(x+(3 if x<32 else -3),y+(3 if y<35 else -3)) for x,y in pts],'dark')
            a.line(32,44,53,57,'tan',3)
        elif mode=='banner':a.r(10,6,4,51,'wood');a.r(11,6,44,4,'gold');a.p([(17,10),(51,10),(51,45),(34,55),(17,45)],'purple');a.p([(34,18),(43,30),(34,42),(25,30)],'gold');a.r(33,20,2,19,'light')
        elif mode=='notice-board':a.box(8,14,48,29,'wood');a.r(12,43,4,15,'bark');a.r(48,43,4,15,'bark');a.r(15,19,15,17,'light');a.r(36,21,12,14,'gold');a.r(18,23,8,1,'stone');a.r(18,28,8,1,'stone');a.r(39,25,6,1,'wood')
        if mode=='cage':
            for x in range(17,49,7):a.r(x,15,2,38,'steel');a.r(x,16,1,34,'light')

STRUCTURES=[('brick-wall','Кирпичная стена','wall'),('stone-wall','Каменная кладка','wall'),('palisade','Частокол','wall'),('iron-fence','Кованая ограда','wall'),('broken-wall','Разрушенная стена','wall'),('wood-door','Дощатая дверь','door'),('iron-door','Окованная дверь','door'),('arched-door','Арочная дверь','door'),('portcullis','Подъёмная решётка','door'),('gate','Двустворчатые ворота','door'),('window','Окно','wall'),('shutters','Окно со ставнями','wall'),('stairs','Каменная лестница','platform'),('ladder','Приставная лестница','platform'),('bridge','Деревянный мост','platform'),('rope-bridge','Верёвочный мост','platform'),('platform','Подиум','platform'),('trapdoor','Люк в полу','door'),('well','Колодец','water'),('fountain','Фонтан','water'),('column','Колонна','wall'),('broken-column','Обломок колонны','rock'),('archway','Каменная арка','door'),('obelisk','Обелиск','rock'),('statue','Каменная статуя','rock'),('gravestone','Надгробие','rock'),('cross-marker','Дорожный памятный знак','rock'),('signpost','Указатель','wall'),('tent','Походная палатка','platform'),('awning','Торговый навес','platform'),('campfire','Костёр','lamp'),('brazier','Жаровня','lamp'),('torch','Факел на стойке','lamp'),('street-lamp','Уличный фонарь','lamp'),('hanging-lantern','Подвесной фонарь','lamp'),('candle-stand','Канделябр','lamp'),('bell','Колокол','wall'),('waterwheel','Водяное колесо','water'),('cart','Телега','crate'),('wheelbarrow','Тачка','crate'),('boat','Гребная лодка','platform'),('target','Мишень','wall'),('scarecrow','Пугало','tree'),('cage','Клетка','crate'),('chain','Свисающая цепь','wall'),('rope-coil','Бухта верёвки','crate'),('banner','Знамя на древке','wall'),('notice-board','Доска объявлений','wall')]
for mode,label,kind in STRUCTURES:
    a=Art();structure(a,mode);add('object-'+mode,label,'object',a,['окружение','постройка',mode],kind)

def weapon(a,mode):
    if mode in ['sword','rapier','sabre','dagger','greatsword','katar']:
        if mode=='sabre':
            a.p([(17,46),(20,31),(36,17),(52,5),(50,19),(39,34),(27,47)],'ink');a.p([(20,43),(23,32),(39,17),(49,10),(46,21),(36,35),(25,43)],'steel');a.line(24,36,43,17,'light',2)
        elif mode=='katar':a.p([(23,41),(26,19),(32,5),(38,19),(41,41)],'ink');a.p([(26,38),(29,20),(32,10),(35,20),(38,38)],'steel');a.r(31,15,2,22,'light');a.r(20,40,24,4,'gold');a.r(20,44,4,13,'wood');a.r(40,44,4,13,'wood');a.r(23,51,18,3,'gold');return
        else:
            blade=5 if mode=='rapier' else 14 if mode=='greatsword' else 9
            top=19 if mode=='dagger' else 5;cx=32
            a.p([(cx-blade//2,44),(cx-blade//2,top+9),(cx,top),(cx+blade//2+1,top+9),(cx+blade//2+1,44)],'ink');a.p([(cx-blade//2+2,42),(cx-blade//2+2,top+10),(cx,top+5),(cx+blade//2-1,top+10),(cx+blade//2-1,42)],'steel');a.r(cx-1,top+9,2,31-top,'light')
        a.p([(17,41),(22,38),(28,40),(37,40),(43,37),(48,40),(42,45),(21,45)],'gold');a.r(29,45,6,13,'wood');a.r(31,46,2,10,'tan');a.box(27,57,10,4,'gold')
        if mode=='rapier':a.box(22,42,18,12,'gold');a.r(25,44,12,7,'dark');a.r(30,43,3,13,'wood')
    elif mode in ['axe','battleaxe','hammer','mace','halberd','spear','trident','staff','wand']:
        a.r(29,13 if mode in ['wand','mace','hammer'] else 5,5,46 if mode!='wand' else 38,'bark');a.r(30,17,1,40 if mode!='wand' else 29,'tan');a.r(28,48,7,3,'gold')
        if mode in ['axe','battleaxe','halberd']:
            a.p([(32,13),(42,9),(52,13),(55,28),(47,35),(35,28),(32,29)],'ink');a.p([(35,16),(42,12),(49,16),(51,27),(46,31),(35,25)],'steel');a.r(48,18,2,9,'light')
            if mode=='battleaxe':a.p([(29,13),(20,9),(10,13),(7,28),(15,35),(27,28)],'steel');a.r(11,18,2,9,'light')
            if mode=='halberd':a.p([(29,15),(31,2),(35,12),(34,24)],'steel');a.p([(28,20),(18,25),(26,28)],'steel')
        elif mode=='hammer':a.box(13,12,38,16,'steel');a.r(16,15,29,4,'light');a.r(43,14,5,11,'stone')
        elif mode=='mace':a.p([(20,11),(25,9),(25,5),(39,5),(39,9),(44,11),(42,25),(36,29),(27,29),(21,25)],'steel');a.r(26,11,3,13,'light');a.r(34,9,3,15,'stone')
        elif mode in ['spear','trident']:
            a.p([(26,17),(31,2),(37,17),(34,25),(28,25)],'steel');a.r(31,7,2,12,'light')
            if mode=='trident':a.p([(17,3),(20,12),(20,24),(29,24),(29,28),(17,28)],'steel');a.p([(46,3),(43,12),(43,24),(34,24),(34,28),(46,28)],'steel')
        elif mode=='staff':a.p([(24,18),(17,9),(21,3),(42,3),(47,10),(40,20),(36,16),(41,10),(37,7),(25,7),(23,10),(29,16)],'gold');a.gem(26,8,12,'mint');a.r(28,27,7,4,'purple')
        else:a.gem(24,8,14,'violet');a.r(26,23,11,4,'gold');a.r(28,38,7,2,'purple')
    elif mode=='bow':
        a.p([(20,5),(29,10),(38,22),(40,34),(34,48),(23,57),(19,55),(29,46),(34,34),(32,23),(25,14),(17,8)],'wood');a.line(19,7,21,55,'light',1);a.r(31,28,7,8,'gold');a.r(13,31,35,2,'steel');a.p([(45,28),(54,32),(45,36)],'steel');a.p([(12,27),(19,31),(12,36)],'red')
    elif mode=='crossbow':
        a.p([(9,17),(18,10),(32,15),(46,10),(56,17),(54,23),(46,17),(32,20),(18,17),(11,24)],'wood');a.r(29,16,6,40,'wood');a.r(30,24,2,25,'tan');a.line(11,21,31,34,'light',1);a.line(31,34,54,21,'light',1);a.r(31,7,2,32,'steel');a.p([(28,8),(32,2),(36,8)],'steel');a.r(26,42,12,4,'gold')
    elif mode=='whip':
        a.box(14,42,8,17,'wood');a.p([(17,43),(14,35),(18,27),(31,26),(43,20),(46,12),(40,7),(30,9),(23,17),(19,15),(26,5),(43,3),(51,12),(46,23),(32,31),(21,31),(19,36),(21,43)],'tan');a.r(16,46,4,2,'gold')
    elif mode=='flail':
        a.box(11,29,7,30,'wood');a.line(14,30,27,18,'steel',2);a.line(27,18,40,23,'steel',2);a.line(39,23,43,35,'steel',2)
        a.p([(36,35),(32,30),(41,32),(44,27),(47,34),(54,31),(51,39),(57,44),(50,45),(48,52),(42,48),(34,52),(36,44),(30,40)],'stone');a.box(38,37,10,10,'steel');a.r(40,39,3,3,'light')
    elif mode=='sling':
        a.p([(15,10),(18,8),(30,39),(29,46),(25,43)],'tan');a.p([(47,8),(50,10),(39,43),(34,46),(34,39)],'tan');a.p([(23,39),(41,39),(45,47),(40,53),(24,53),(19,47)],'wood');a.p([(27,37),(37,37),(40,44),(35,49),(27,47)],'stone');a.r(29,39,6,3,'steel')

WEAPONS=[('sword','Прямой меч'),('rapier','Рапира'),('sabre','Сабля'),('dagger','Кинжал'),('greatsword','Двуручный меч'),('axe','Топор'),('battleaxe','Двусторонняя секира'),('hammer','Боевой молот'),('mace','Булава'),('spear','Копьё'),('halberd','Алебарда'),('bow','Лук со стрелой'),('crossbow','Арбалет'),('whip','Кнут'),('flail','Кистень'),('sling','Праща'),('trident','Трезубец'),('katar','Катар'),('staff','Кристальный посох'),('wand','Жезл')]
for mode,label in WEAPONS:
    a=Art();weapon(a,mode);add('item-'+mode,label,'item',a,['предмет','оружие',mode])

def armor(a,mode):
    if mode in ['plate','leather','robe','chainmail','cloak']:
        if mode=='cloak':a.p([(24,9),(40,9),(48,20),(57,54),(44,58),(32,51),(20,58),(7,54),(16,20)],'purple');a.p([(26,13),(38,13),(42,20),(40,30),(24,30),(22,20)],'dark');a.line(22,31,15,51,'violet',3);a.line(39,30,47,52,'violet',2);a.gem(28,26,8,'gold');return
        c='steel' if mode in ['plate','chainmail'] else 'wood' if mode=='leather' else 'purple'
        a.p([(22,9),(27,13),(37,13),(42,9),(54,21),(51,33),(43,28),(44,52),(20,52),(21,28),(13,33),(10,21)],'ink');a.p([(23,13),(28,17),(36,17),(41,13),(49,23),(48,28),(40,23),(41,49),(23,49),(24,23),(16,28),(15,23)],c)
        a.r(27,19,9,3,'light' if mode in ['plate','chainmail'] else 'tan');a.r(30,22,3,23,'stone' if mode in ['plate','chainmail'] else 'violet')
        if mode=='plate':a.p([(24,27),(32,32),(40,27),(38,38),(32,42),(26,38)],'stone');a.r(24,43,16,4,'gold');a.r(31,32,2,8,'light')
        elif mode=='chainmail':
            for y in range(25,49,4):
                for x in range(25,40,4):a.r(x,y,2,1,'light');a.r(x+1,y+1,1,2,'stone')
        elif mode=='leather':a.r(24,25,16,3,'tan');a.r(24,40,16,4,'bark');a.box(29,39,6,6,'gold');a.r(27,28,2,9,'gold');a.r(36,28,2,9,'gold')
        else:a.p([(20,50),(44,50),(50,59),(14,59)],'purple');a.r(21,44,22,3,'gold');a.r(25,51,2,6,'violet');a.r(37,51,2,6,'violet')
    elif mode=='helmet':a.p([(14,47),(14,22),(23,11),(40,11),(50,22),(50,47),(42,54),(39,34),(25,34),(22,54)],'ink');a.p([(18,45),(18,24),(26,15),(37,15),(46,24),(46,44),(43,45),(41,29),(23,29),(21,45)],'steel');a.r(30,15,4,31,'gold');a.r(19,28,26,5,'stone');a.r(19,32,10,3,'dark');a.r(35,32,10,3,'dark');a.r(20,23,8,2,'light')
    elif mode=='hood':a.p([(11,55),(15,21),(26,8),(39,10),(49,23),(54,55),(42,59),(22,59)],'purple');a.p([(21,24),(29,16),(37,19),(43,27),(41,45),(34,51),(24,44)],'ink');a.p([(21,24),(27,19),(25,40),(30,50),(23,44)],'violet');a.r(13,53,38,4,'gold')
    elif mode=='boots':
        for x,y in [(8,15),(35,10)]:a.box(x+5,y,15,34,'wood');a.p([(x+5,y+30),(x+20,y+30),(x+24,y+39),(x+23,y+45),(x,y+45),(x,y+37)],'bark');a.r(x+8,y+4,9,3,'tan');a.r(x+8,y+14,9,3,'gold');a.r(x+2,y+40,19,3,'wood')
    elif mode in ['gloves','bracers']:
        for x,y in [(8,21),(35,15)]:
            a.box(x+4,y+13,15,23,'steel' if mode=='bracers' else 'wood');a.r(x+7,y+16,3,17,'light' if mode=='bracers' else 'tan')
            if mode=='gloves':a.p([(x+3,y+15),(x+2,y+5),(x+6,y+2),(x+9,y+8),(x+9,y),(x+13,y),(x+15,y+8),(x+16,y+2),(x+20,y+4),(x+19,y+18)],'wood')
            else:a.r(x+5,y+20,13,3,'gold');a.r(x+5,y+30,13,3,'gold')
    elif mode=='belt':a.p([(8,18),(48,18),(56,24),(55,36),(48,42),(8,42),(8,36),(47,36),(49,31),(47,24),(8,24)],'wood');a.box(20,17,21,27,'gold');a.r(25,22,11,17,'dark');a.r(24,30,16,3,'steel');a.r(12,21,2,19,'tan');a.r(45,21,2,17,'tan')
    elif mode in ['buckler','kite-shield','tower-shield']:
        pts=[(17,13),(47,13),(54,21),(54,43),(46,52),(19,52),(10,43),(10,22)] if mode=='buckler' else [(13,8),(51,8),(49,38),(32,58),(15,38)] if mode=='kite-shield' else [(13,6),(51,6),(53,53),(32,59),(11,53)]
        a.p(pts,'gold');a.p([(x+(3 if x<32 else -3),y+(3 if y<32 else -3)) for x,y in pts],'steel');a.r(30,12,4,38,'stone');a.r(19,28,26,4,'stone');a.gem(25,25,14,'light')
        if mode=='tower-shield':a.r(18,13,3,37,'light');a.r(44,13,3,37,'shade')

ARMOR=[('plate','Латный нагрудник'),('leather','Кожаный доспех'),('robe','Мантия'),('chainmail','Кольчуга'),('helmet','Шлем с защитой лица'),('hood','Дорожный капюшон'),('boots','Высокие сапоги'),('gloves','Кожаные перчатки'),('belt','Ремень с пряжкой'),('cloak','Дорожный плащ'),('buckler','Круглый щит'),('kite-shield','Каплевидный щит'),('tower-shield','Башенный щит'),('bracers','Металлические наручи')]
for mode,label in ARMOR:
    a=Art();armor(a,mode);add('item-'+mode,label,'item',a,['предмет','снаряжение','броня',mode])

def tool(a,mode):
    if mode in ['pickaxe','shovel','tool-hammer','tongs','knife','saw']:
        if mode=='pickaxe':a.r(29,17,5,41,'wood');a.r(30,23,1,33,'tan');a.p([(8,19),(15,11),(33,8),(48,13),(57,25),(49,19),(34,15),(18,16)],'steel');a.r(25,11,15,2,'light')
        elif mode=='shovel':a.box(24,5,16,12,'wood');a.r(28,8,8,5,'dark');a.r(29,17,5,25,'wood');a.p([(20,38),(44,38),(44,48),(32,60),(20,48)],'steel');a.r(30,40,3,14,'light')
        elif mode=='tool-hammer':a.line(22,55,38,22,'wood',5);a.p([(19,12),(42,12),(51,19),(50,25),(40,22),(35,25),(18,22)],'steel');a.r(20,14,17,3,'light')
        elif mode=='tongs':a.p([(15,9),(19,7),(32,26),(44,7),(48,9),(37,32),(47,54),(44,57),(32,37),(20,57),(16,54),(27,32)],'steel');a.r(28,28,8,7,'gold');a.r(31,30,2,2,'ink')
        elif mode=='knife':a.p([(10,54),(8,49),(33,20),(53,6),(47,26),(23,46)],'steel');a.line(28,33,45,15,'light',2);a.p([(8,49),(21,42),(25,46),(13,58),(8,58)],'wood');a.r(12,48,2,2,'gold')
        else:a.p([(9,34),(17,15),(53,16),(54,29),(49,33),(46,29),(42,35),(38,31),(34,37),(30,33),(26,39),(21,36),(17,42)],'steel');a.box(7,32,16,23,'wood');a.r(11,37,8,13,'dark');a.r(21,20,27,2,'light')
    elif mode in ['compass','sextant','spyglass','lockpicks']:
        if mode=='compass':a.p([(17,11),(47,11),(56,22),(56,44),(47,54),(17,54),(8,44),(8,22)],'gold');a.p([(20,15),(44,15),(51,24),(51,41),(43,49),(21,49),(13,41),(13,24)],'dark');a.p([(32,18),(41,34),(32,45),(24,33)],'light');a.p([(32,18),(32,33),(41,34)],'red');a.r(30,30,4,5,'gold');a.r(30,9,4,7,'gold')
        elif mode=='sextant':a.p([(13,47),(20,14),(52,45),(47,53),(17,53)],'gold');a.p([(20,44),(23,23),(43,44)],'dark');a.line(19,48,43,26,'steel',3);a.box(39,18,11,12,'wood');a.r(22,44,21,2,'light')
        elif mode=='spyglass':a.p([(7,43),(13,52),(56,23),(49,13)],'gold');a.p([(7,43),(12,51),(22,44),(17,36)],'wood');a.p([(40,20),(47,31),(56,24),(50,13)],'steel');a.p([(47,15),(53,23),(56,21),(51,12)],'blue');a.line(19,38,43,23,'light',2)
        else:
            for i,(x,y) in enumerate([(12,8),(27,15),(44,7)]):a.r(x,y,2,33,'steel');a.r(x-3,y+29,8,19,'wood');a.r(x,y,8 if i!=1 else 5,2,'steel');a.r(x+6,y-4,2,5,'steel')
    elif mode in ['rope','grapple','lantern','waterskin','backpack','map']:
        if mode=='rope':
            a.p([(14,16),(48,16),(54,26),(51,49),(43,56),(20,56),(12,49),(10,26)],'tan');a.p([(19,22),(43,22),(47,28),(44,47),(39,50),(24,50),(18,45),(16,28)],'dark')
            for y in (18,25,32,39,46,52):a.r(11 if y<46 else 15,y,6,2,'gold');a.r(46 if y<46 else 42,y,6,2,'wood')
            a.r(26,14,10,44,'wood');a.r(29,16,3,39,'tan');a.line(32,55,48,59,'tan',3)
        elif mode=='grapple':a.r(30,13,4,31,'steel');a.p([(30,35),(17,29),(17,16),(13,20),(14,36),(29,45),(30,49),(35,49),(35,43),(49,34),(50,19),(46,16),(46,29),(34,35)],'steel');a.r(30,5,4,12,'tan');a.r(30,48,4,10,'tan');a.r(32,8,1,8,'gold')
        elif mode=='lantern':a.box(18,18,28,33,'gold');a.r(22,22,20,25,'mint');a.r(29,23,6,22,'light');a.r(18,30,28,3,'stone');a.r(17,17,30,4,'stone');a.r(21,9,22,3,'steel');a.r(19,11,3,9,'steel');a.r(42,11,3,9,'steel');a.r(16,51,32,4,'stone')
        elif mode=='waterskin':a.r(29,8,9,9,'wood');a.p([(25,16),(39,16),(44,25),(48,42),(43,55),(24,57),(14,45),(18,27)],'wood');a.r(23,25,3,20,'tan');a.r(26,18,16,3,'gold');a.p([(20,20),(15,12),(10,14),(10,28),(14,39),(19,33),(17,28),(14,18),(15,16)],'tan')
        elif mode=='backpack':a.box(14,16,36,40,'wood');a.box(18,10,28,16,'tan');a.r(19,17,26,3,'bark');a.box(21,37,22,15,'tan');a.r(24,42,16,2,'wood');a.r(18,19,4,19,'gold');a.r(42,19,4,19,'gold');a.r(27,23,9,3,'gold');a.r(10,26,4,25,'bark');a.r(50,26,4,25,'bark')
        else:a.p([(9,12),(24,8),(41,15),(55,10),(55,50),(41,56),(23,49),(9,54)],'light');a.r(23,11,2,36,'tan');a.r(40,17,2,35,'tan');a.p([(11,34),(19,25),(27,31),(32,21),(45,31),(52,25),(52,31),(45,37),(32,28),(28,37),(18,32),(11,41)],'water');a.r(31,38,9,2,'red');a.r(34,35,2,8,'red');a.r(15,16,4,3,'leaf')

TOOLS=[('pickaxe','Кирка'),('shovel','Лопата'),('tool-hammer','Молоток мастера'),('tongs','Кузнечные клещи'),('knife','Разделочный нож'),('saw','Ручная пила'),('compass','Компас'),('sextant','Секстант'),('spyglass','Подзорная труба'),('lockpicks','Набор отмычек'),('rope','Верёвка'),('grapple','Кошка для подъёма'),('lantern','Походный фонарь'),('waterskin','Бурдюк'),('backpack','Рюкзак'),('map','Складная карта')]
for mode,label in TOOLS:
    a=Art();tool(a,mode);add('item-'+mode,label,'item',a,['предмет','инструмент',mode])

def artifact(a,mode):
    if mode=='amulet':
        a.p([(13,7),(17,5),(22,21),(32,26),(42,21),(47,5),(51,7),(46,24),(32,31),(18,24)],'gold');a.gem(22,29,21,'mint');a.r(30,25,4,7,'gold')
    elif mode=='ring':
        a.p([(17,23),(25,15),(42,15),(50,23),(50,43),(41,52),(24,52),(16,43)],'gold');a.p([(23,27),(28,22),(37,22),(43,27),(43,39),(36,45),(28,45),(23,39)],'dark');a.gem(23,10,18,'purple');a.r(19,32,2,9,'light')
    elif mode=='crown':a.p([(10,21),(18,32),(20,10),(31,27),(42,10),(45,32),(55,20),(51,51),(14,51)],'gold');a.r(16,42,33,5,'wood');a.gem(27,35,10,'red');a.r(18,45,5,2,'light');a.r(41,45,5,2,'light')
    elif mode=='orb':a.p([(18,10),(43,10),(53,20),(53,41),(42,51),(19,51),(9,41),(9,20)],'ink');a.p([(20,13),(41,13),(49,22),(49,39),(40,47),(21,47),(13,39),(13,22)],'purple');a.r(19,21,10,4,'violet');a.r(17,26,5,8,'light');a.p([(30,19),(42,29),(36,41),(29,37),(34,29)],'mint');a.box(20,48,24,9,'gold')
    elif mode=='runestone':
        a.p([(15,20),(23,9),(41,11),(51,23),(49,45),(39,56),(23,53),(13,39)],'stone');a.p([(19,22),(26,15),(39,17),(45,25),(43,43),(36,48),(26,46),(19,36)],'shade');a.r(29,23,3,19,'mint');a.line(31,24,39,31,'mint',2);a.line(22,32,31,40,'mint',2);a.r(35,37,5,2,'mint');a.r(21,16,8,2,'steel')
    elif mode=='tome':a.box(14,10,37,47,'bark');a.r(18,12,29,41,'purple');a.r(13,15,5,35,'gold');a.r(48,14,4,39,'light');a.gem(26,24,13,'mint');a.r(21,18,19,2,'gold');a.r(21,46,19,2,'gold');a.r(29,7,4,9,'red')
    elif mode=='hand-mirror':a.p([(21,6),(43,6),(51,15),(51,33),(42,43),(22,43),(13,33),(13,15)],'gold');a.p([(23,11),(40,11),(46,18),(46,30),(40,37),(24,37),(18,30),(18,18)],'blue');a.p([(23,15),(35,15),(23,30)],'light');a.r(28,42,8,15,'wood');a.r(30,44,2,11,'gold')
    elif mode=='hourglass':a.box(17,5,30,6,'gold');a.box(17,53,30,6,'gold');a.r(19,11,3,42,'wood');a.r(43,11,3,42,'wood');a.p([(23,12),(41,12),(39,23),(33,32),(39,42),(41,51),(23,51),(25,42),(31,32),(25,23)],'blue');a.p([(25,17),(39,17),(35,25),(32,29),(29,25)],'gold');a.p([(31,37),(33,37),(37,45),(39,49),(25,49),(28,43)],'gold');a.r(31,29,2,12,'tan')
    elif mode=='seal':a.box(16,40,32,14,'gold');a.r(20,44,24,6,'wood');a.r(28,23,9,18,'wood');a.p([(22,10),(31,5),(42,10),(43,21),(36,26),(25,24),(20,18)],'gold');a.r(27,12,10,3,'light')
    elif mode=='soul-vessel':a.r(24,7,16,5,'gold');a.box(19,16,27,37,'stone');a.r(23,20,19,29,'dark');a.p([(31,23),(36,20),(40,27),(36,33),(37,40),(33,45),(26,43),(25,34),(29,30)],'mint');a.r(30,26,3,4,'light');a.r(25,12,14,5,'steel');a.r(16,52,33,4,'gold')

ARTIFACTS=[('amulet','Кристальный амулет'),('ring','Перстень'),('crown','Корона'),('orb','Сфера в оправе'),('runestone','Малый рунический камень'),('tome','Том в окладе'),('hand-mirror','Ручное зеркало'),('hourglass','Песочные часы'),('seal','Печать'),('soul-vessel','Сосуд с магическим свечением')]
for mode,label in ARTIFACTS:
    a=Art();artifact(a,mode);add('item-'+mode,label,'item',a,['предмет','артефакт','магия',mode])

def supply(a,mode):
    if mode in ['potion','flask','bomb']:
        if mode=='bomb':a.p([(18,24),(30,17),(43,22),(50,34),(47,47),(36,55),(23,52),(13,41),(13,31)],'stone');a.r(20,27,8,4,'steel');a.r(29,12,8,10,'gold');a.p([(32,13),(33,6),(42,5),(45,11),(41,12),(39,8),(36,9),(36,14)],'tan');a.r(46,7,4,3,'fire');a.r(49,3,2,2,'gold')
        else:
            a.r(26,7,13,6,'wood');a.r(27,13,11,11,'steel')
            pts=[(27,22),(17,32),(16,47),(23,55),(42,55),(50,47),(49,32),(38,22)] if mode=='potion' else [(27,22),(21,30),(18,50),(23,55),(43,55),(48,50),(45,30),(38,22)]
            a.p(pts,'light');a.p([(23,34),(43,34),(46,47),(40,51),(25,51),(20,46)],'red' if mode=='potion' else 'blue');a.r(23,28,3,12,'white');a.r(29,42,8,3,'light')
    elif mode=='herbs':
        for x,y in [(22,9),(31,5),(41,10)]:a.line(x,y,x+4,51,'green',2);a.p([(x,y+12),(x-8,y+4),(x-10,y+10),(x-2,y+17)],'leaf');a.p([(x+2,y+23),(x+11,y+14),(x+12,y+22),(x+4,y+28)],'mint')
        a.r(25,42,22,4,'tan');a.r(29,47,4,11,'wood')
    elif mode=='bandage':a.p([(12,22),(20,14),(44,14),(52,22),(52,43),(44,51),(20,51),(12,43)],'tan');a.p([(17,24),(23,19),(41,19),(47,24),(47,41),(41,46),(23,46),(17,41)],'light');a.box(23,26,18,14,'wood');a.r(27,29,10,8,'dark');a.r(44,42,13,11,'light');a.r(48,44,1,8,'tan');a.r(16,26,3,14,'white')
    elif mode=='ration':a.p([(13,17),(25,12),(39,16),(50,12),(53,49),(42,55),(27,50),(14,54)],'tan');a.r(14,28,37,4,'wood');a.r(31,15,3,36,'wood');a.gem(25,28,12,'gold');a.r(20,19,6,3,'light')
    elif mode=='bread':a.p([(8,34),(14,23),(27,17),(43,18),(54,28),(57,39),(49,49),(16,50),(8,43)],'wood');a.p([(12,33),(18,26),(28,21),(41,22),(49,29),(52,37),(46,43),(18,44),(12,39)],'tan');a.line(23,24,18,36,'gold',3);a.line(34,23,29,36,'gold',3);a.line(45,27,40,39,'gold',3)
    elif mode=='cheese':a.p([(10,43),(26,20),(52,27),(53,50),(10,50)],'gold');a.p([(10,43),(26,20),(52,27),(34,43)],'light');a.r(35,30,5,4,'tan');a.r(22,40,4,3,'tan');a.r(41,44,5,4,'tan');a.r(10,49,43,3,'wood')
    elif mode=='fruit':
        a.p([(15,22),(25,19),(32,24),(42,19),(51,26),(52,42),(42,54),(23,54),(12,42),(11,29)],'red');a.r(18,26,7,4,'fire');a.r(29,11,4,13,'wood');a.p([(33,16),(38,8),(49,9),(43,17)],'leaf');a.r(44,30,3,11,'skinshade')
    elif mode=='mushrooms':
        for x,y,s in [(9,29,22),(30,16,26)]:a.r(x+s//2-3,y+12,6,22,'light');a.p([(x,y+10),(x+5,y+2),(x+s-6,y),(x+s,y+10),(x+s,y+14),(x,y+14)],'red');a.r(x+7,y+4,4,3,'light');a.r(x+16,y+7,3,2,'light')
    elif mode=='quiver':
        for x,y in [(22,4),(32,7),(41,2)]:a.r(x,y+8,2,35,'tan');a.p([(x-3,y),(x+2,y+3),(x+5,y),(x+4,y+12),(x-3,y+9)],'light')
        a.p([(14,27),(44,27),(47,50),(38,58),(20,56)],'wood');a.r(17,30,27,4,'gold');a.r(23,35,3,16,'tan');a.line(16,30,50,11,'tan',2)
    elif mode=='coin-pouch':
        a.p([(19,13),(30,17),(43,12),(40,25),(51,39),(49,53),(34,59),(18,54),(12,42),(24,24)],'wood');a.r(21,24,22,3,'tan');a.gem(25,35,14,'gold');a.r(28,39,8,3,'light');a.line(23,25,16,18,'gold',2)

SUPPLIES=[('potion','Зелье в круглой колбе'),('flask','Колба с жидкостью'),('bomb','Метательный сосуд с фитилём'),('herbs','Связка лечебных трав'),('bandage','Рулон бинта'),('ration','Дорожный паёк'),('bread','Каравай'),('cheese','Кусок сыра'),('fruit','Яблоко'),('mushrooms','Съедобные грибы'),('quiver','Колчан со стрелами'),('coin-pouch','Кошель')]
for mode,label in SUPPLIES:
    a=Art();supply(a,mode);add('item-'+mode,label,'item',a,['предмет','припасы','расходник',mode])

def human(mode,style,hair,skin='skin',cloth='purple'):
    a=Art();a.frame('gold' if mode in ['noble','judge','merchant'] else 'mint')
    # A repeated frame is UI chrome; identities have authored clothing, face,
    # hairstyle, headgear, body proportions and occupation-specific equipment.
    a.p([(7,56),(13,45),(24,40),(39,40),(51,46),(57,56),(57,59),(7,59)],'ink')
    a.p([(10,57),(16,47),(25,44),(39,44),(48,49),(54,57),(54,59),(10,59)],cloth)
    a.r(27,37,11,10,'skinshade');a.r(29,39,7,7,skin)
    # Shoulder seams and a collar catch a common light source.
    a.p([(24,44),(30,48),(25,52),(18,46)],'light' if mode in ['healer','priest'] else 'violet')
    a.p([(39,44),(34,48),(39,52),(46,47)],'light' if mode in ['healer','priest'] else 'violet')
    a.r(31,48,2,11,'dark');a.r(33,52,2,2,'gold')
    hc={'black':'#292731','brown':'wood','red':'#8b4a42','blond':'gold','white':'light','blue':'#416a80'}[hair]
    # Hair behind the face, with distinct outside contours.
    if style in ['long','braid','bun']:
        a.p([(18,17),(22,10),(41,10),(47,18),(46,47),(39,50),(21,47),(17,36)],hc)
        a.r(20,22,2,19,'tan' if hair=='brown' else 'stone')
    elif style=='curly':
        for x,y,w in [(17,13,12),(24,8,12),(35,9,12),(43,16,9),(15,23,9),(44,29,9),(18,34,8)]:a.box(x,y,w,10,hc)
    elif style!='bald':a.p([(18,22),(19,13),(27,9),(40,10),(46,17),(46,29),(20,29)],hc)
    # Some heads have larger cheek / jaw silhouettes, independent of colour.
    stout=mode in ['blacksmith','miner','dwarf-jeweler','frostguide']
    face=[(21 if stout else 23,20),(41,20),(44 if stout else 42,28),(42,37),(36,43),(28,43),(21,37),(20 if stout else 22,27)]
    a.p(face,'skinshade');a.p([(24,21),(39,21),(41,28),(39,36),(35,40),(28,40),(24,36),(23,27)],skin)
    a.r(22,27,2,7,skin);a.r(41,27,2,7,'skinshade')
    a.r(25,27,6,2,'ink');a.r(35,27,6,2,'ink');a.r(27,28,2,2,'mint');a.r(36,28,2,2,'mint')
    a.r(25,25,6,1,hc);a.r(35,25,6,1,hc);a.r(32,29,2,6,'skinshade');a.r(30,34,4,1,'skinshade')
    a.r(29,37,8,2,'#774e51');a.r(31,37,3,1,'#d5a294')
    a.r(24,31,3,2,'#d7a08a' if skin=='skin' else 'skinshade')
    if style=='short':a.p([(20,18),(25,12),(40,12),(44,20),(35,18),(29,22),(26,18),(22,25)],hc)
    elif style=='spiky':a.p([(18,22),(17,10),(24,14),(27,6),(32,12),(41,6),(40,12),(49,11),(44,23),(35,18),(27,24)],hc)
    elif style=='long':a.p([(20,25),(21,14),(39,12),(44,21),(41,28),(36,19),(28,23),(25,28)],hc);a.r(42,27,3,20,hc)
    elif style=='braid':a.p([(20,24),(23,13),(40,13),(44,20),(33,18),(24,24)],hc)
    elif style=='bun':a.p([(20,25),(20,16),(30,11),(42,15),(44,24),(37,20),(27,21)],hc);a.box(41,10,12,12,hc)
    elif style=='swept':a.p([(18,25),(19,17),(31,9),(45,13),(44,20),(33,17),(25,21),(23,28)],hc);a.line(26,16,39,13,'light',1)
    if style=='braid':
        for i in range(6):a.p([(43,30+i*4),(47,31+i*4),(45,35+i*4),(41,34+i*4)],hc)
        a.r(41,51,5,2,'gold')
    if mode in ['hunter','elf-diplomat']:
        a.p([(22,28),(13,22),(18,33),(23,33)],skin);a.p([(41,28),(51,22),(47,33),(42,33)],skin);a.r(18,27,3,2,'skinshade')
    if mode in ['blacksmith','miner','dwarf-jeweler','frostguide','fisher','druid']:
        a.p([(22,33),(28,36),(33,33),(39,35),(43,32),(42,44),(34,51),(23,44)],hc);a.r(29,36,7,2,'ink');a.r(28,41,2,5,'tan' if hair!='white' else 'steel');a.r(36,41,2,5,'tan' if hair!='white' else 'steel')
    # Occupation-specific top silhouettes and equipment.
    if mode=='traveler':a.r(17,19,29,5,'wood');a.box(19,18,10,8,'gold');a.box(34,18,10,8,'gold');a.r(22,21,4,3,'blue');a.r(37,21,4,3,'blue');a.p([(22,43),(41,43),(45,48),(28,52),(23,58),(20,54),(27,47)],'red');a.line(17,46,42,58,'tan',3)
    elif mode=='guard':a.p([(16,24),(19,11),(29,6),(40,10),(47,22),(45,28),(18,28)],'steel');a.r(18,24,27,4,'stone');a.r(30,8,3,20,'gold');a.r(17,28,5,10,'stone');a.r(42,28,5,10,'stone');a.box(12,48,12,10,'steel');a.box(42,48,12,10,'steel')
    elif mode in ['archivist','alchemist','judge','dwarf-jeweler']:
        a.box(23,26,10,6,'gold');a.box(34,26,10,6,'gold');a.r(25,28,6,2,'blue');a.r(36,28,6,2,'blue');a.r(32,28,2,1,'gold')
        if mode=='archivist':a.box(9,45,15,15,'wood');a.r(12,47,9,10,'light');a.r(17,47,1,10,'tan')
        elif mode=='alchemist':a.r(47,42,4,6,'gold');a.box(43,47,12,12,'steel');a.r(46,51,6,5,'mint');a.r(17,50,5,6,'gold')
        elif mode=='judge':a.p([(18,15),(19,9),(44,9),(47,15)],'ink');a.r(21,10,23,4,'gold');a.r(17,17,5,24,'light');a.r(43,17,5,24,'light');a.r(23,47,17,8,'white')
        else:a.gem(12,46,10,'blue');a.r(47,48,3,10,'gold');a.r(44,50,9,2,'gold')
    elif mode=='blacksmith':a.r(15,47,34,12,'wood');a.r(18,42,4,17,'tan');a.r(42,42,4,17,'tan');a.r(26,28,2,2,'stone');a.r(37,33,2,2,'stone');a.box(46,44,12,7,'steel');a.r(48,51,3,8,'wood')
    elif mode=='healer':a.p([(16,36),(16,20),(24,8),(40,8),(49,20),(49,40),(44,42),(43,19),(37,14),(26,14),(22,21),(21,41)],'light');a.r(25,49,15,3,'mint');a.r(30,44,5,16,'mint');a.p([(10,49),(15,42),(17,48),(13,55)],'leaf')
    elif mode=='sailor':a.p([(18,23),(19,14),(44,14),(47,24)],'red');a.r(20,21,24,3,'fire');a.r(44,21,6,6,'red');a.p([(45,25),(53,32),(48,34),(44,29)],'red');a.r(24,46,18,3,'light');a.r(18,53,29,2,'light')
    elif mode=='merchant':a.p([(17,23),(16,16),(24,9),(40,9),(48,16),(47,23)],'purple');a.r(20,15,24,3,'violet');a.r(28,9,5,14,'gold');a.gem(27,14,9,'mint');a.p([(22,45),(28,52),(38,52),(44,45),(43,50),(38,56),(28,56),(23,50)],'gold')
    elif mode=='hunter':a.p([(16,34),(17,17),(27,9),(41,12),(47,22),(46,40),(42,40),(42,22),(37,17),(28,17),(22,23),(21,39)],'leaf');a.line(14,48,39,58,'tan',3);a.r(48,40,2,19,'wood');a.p([(46,40),(49,35),(52,40)],'steel')
    elif mode=='farmer':a.p([(20,18),(23,8),(40,8),(44,18)],'tan');a.r(10,19,45,5,'gold');a.r(21,15,22,3,'wood');a.r(22,47,3,12,'tan');a.r(41,47,3,12,'tan');a.r(14,52,6,4,'leaf')
    elif mode=='innkeeper':a.p([(20,49),(44,49),(47,59),(17,59)],'light');a.r(22,44,3,15,'light');a.r(39,44,3,15,'light');a.r(45,47,8,10,'gold');a.r(52,49,4,6,'gold');a.r(49,50,1,4,'light')
    elif mode=='miner':a.p([(16,24),(19,13),(27,9),(40,10),(46,18),(48,25)],'steel');a.r(14,24,35,3,'stone');a.box(27,13,12,10,'gold');a.r(30,15,6,5,'mint');a.line(9,43,19,58,'wood',3);a.p([(7,42),(18,40),(25,45),(16,43),(9,47)],'steel')
    elif mode=='bard':a.p([(18,21),(21,13),(41,13),(49,20)],'purple');a.r(14,21,38,3,'violet');a.p([(40,15),(45,5),(52,9),(46,18)],'light');a.box(42,49,14,11,'wood');a.r(47,41,3,14,'tan');a.r(47,53,3,3,'ink')
    elif mode=='priest':a.p([(22,19),(25,8),(31,13),(37,8),(43,20)],'light');a.r(19,20,27,3,'gold');a.r(30,9,3,13,'gold');a.r(25,48,15,3,'gold');a.r(31,44,3,13,'gold')
    elif mode=='runescholar':a.r(24,31,2,6,'mint');a.r(23,33,5,1,'mint');a.r(37,22,2,4,'mint');a.r(37,23,4,1,'mint');a.r(15,49,4,8,'mint');a.r(44,49,4,8,'mint');a.r(31,51,3,7,'gold')
    elif mode=='messenger':a.p([(20,20),(22,12),(42,12),(44,21)],'leaf');a.r(19,21,31,3,'green');a.line(17,45,42,59,'tan',4);a.box(37,52,18,8,'wood');a.r(40,54,13,2,'gold')
    elif mode=='noble':a.p([(20,19),(19,8),(26,13),(32,6),(39,13),(46,8),(44,20)],'gold');a.gem(29,14,7,'purple');a.r(21,33,2,6,'gold');a.r(44,33,2,6,'gold');a.p([(21,45),(30,52),(37,52),(45,45),(44,49),(37,57),(30,57),(23,51)],'light');a.gem(28,50,9,'purple')
    elif mode=='captain':a.p([(9,22),(14,13),(25,17),(31,8),(42,17),(51,12),(57,22),(45,25),(18,25)],'ink');a.line(14,15,26,20,'gold',2);a.line(40,20,52,15,'gold',2);a.r(29,13,7,5,'gold');a.box(12,48,12,8,'gold');a.r(15,54,2,5,'light');a.r(20,54,2,5,'light')
    elif mode=='druid':a.p([(22,17),(14,13),(12,5),(15,5),(18,11),(22,9),(21,4),(24,4),(26,15)],'tan');a.p([(41,17),(49,13),(51,5),(48,5),(45,11),(41,9),(42,4),(39,4),(37,15)],'tan');a.p([(21,45),(26,51),(32,46),(37,52),(44,44),(47,53),(38,57),(24,57),(16,53)],'leaf');a.r(27,20,4,2,'mint')
    elif mode=='desertscout':a.p([(17,30),(18,17),(24,8),(43,10),(48,22),(47,41),(41,44),(39,21),(25,19),(23,32)],'tan');a.p([(21,31),(42,31),(44,41),(38,47),(25,44),(20,38)],'wood');a.r(22,34,20,2,'gold');a.r(18,47,28,5,'tan')
    elif mode=='engineer':a.box(18,15,12,9,'gold');a.box(34,15,12,9,'gold');a.r(21,17,6,4,'blue');a.r(37,17,6,4,'blue');a.r(29,18,6,3,'wood');a.line(19,48,45,57,'tan',3);a.box(44,43,7,16,'steel');a.r(42,42,11,4,'steel');a.r(46,40,3,5,'ink')
    elif mode=='frostguide':a.p([(16,42),(13,30),(17,15),(25,7),(39,7),(49,18),(50,34),(45,43),(41,38),(45,28),(40,15),(27,13),(20,23),(21,38)],'light');a.r(15,47,34,6,'steel');a.r(21,53,22,6,'light')
    elif mode=='weaver':a.r(21,15,25,4,'red');a.r(24,16,3,2,'gold');a.r(34,16,3,2,'gold');a.r(11,49,8,10,'light');a.r(13,47,4,14,'wood');a.r(46,47,4,12,'tan');a.r(43,48,10,3,'violet')
    elif mode=='fisher':a.p([(17,23),(22,11),(41,12),(47,23)],'tan');a.r(14,23,36,4,'wood');a.r(48,35,2,23,'tan');a.line(48,36,55,42,'light',1);a.r(55,42,1,9,'light');a.p([(53,49),(57,49),(58,55),(53,57),(51,54)],'steel')
    elif mode=='herbalist':a.p([(21,45),(15,44),(14,37),(20,39),(22,45)],'leaf');a.p([(40,48),(47,40),(51,42),(47,49)],'green');a.r(31,45,2,13,'green');a.r(28,51,8,3,'tan')
    elif mode=='necromancer':a.p([(16,41),(18,18),(25,8),(39,8),(47,18),(48,42),(42,45),(41,21),(37,15),(27,15),(22,22),(22,43)],'ink');a.r(25,26,6,2,'violet');a.r(35,26,6,2,'violet');a.p([(24,48),(26,44),(35,44),(39,48),(36,54),(27,54)],'light');a.r(28,47,3,3,'ink');a.r(33,47,3,3,'ink');a.r(29,52,6,2,'ink')
    elif mode in ['firemage','watermage','earthmage','windmage','lightmage','bloodmage','shadowmage']:
        if mode=='firemage':a.p([(21,20),(22,10),(28,15),(32,5),(39,13),(44,9),(45,22)],'red');a.r(26,19,15,2,'gold');a.p([(45,56),(44,47),(49,41),(51,47),(55,43),(56,54)],'fire');a.r(48,49,3,8,'gold')
        elif mode=='watermage':a.p([(19,22),(23,15),(24,8),(31,14),(39,6),(42,16),(47,22)],'blue');a.r(23,19,18,2,'light');a.p([(47,44),(52,53),(50,58),(44,58),(42,53)],'blue');a.r(45,52,2,3,'light')
        elif mode=='earthmage':a.p([(19,22),(22,11),(29,9),(39,12),(45,22)],'stone');a.r(21,19,22,3,'gold');a.p([(44,50),(49,43),(56,47),(57,56),(47,58)],'stone');a.r(47,47,6,2,'light')
        elif mode=='windmage':a.r(19,20,27,3,'light');a.p([(42,20),(47,10),(55,12),(49,22)],'light');a.p([(12,49),(24,46),(26,49),(19,52),(10,53)],'blue');a.r(9,56,13,2,'light')
        elif mode=='lightmage':a.r(22,14,22,2,'gold');a.r(18,17,3,8,'gold');a.r(47,17,3,8,'gold');a.r(13,25,4,2,'light');a.r(51,25,4,2,'light');a.gem(28,47,11,'light');a.r(31,43,3,4,'gold')
        elif mode=='bloodmage':a.r(24,33,2,6,'red');a.r(37,33,2,6,'red');a.p([(46,43),(52,53),(50,58),(44,58),(42,53)],'red');a.r(45,52,2,3,'skin');a.gem(28,47,10,'red')
        else:a.p([(16,42),(16,19),(25,8),(41,9),(48,23),(48,41),(43,44),(41,22),(36,15),(26,17),(22,26),(22,44)],'ink');a.r(25,28,4,1,'violet');a.r(36,28,4,1,'violet');a.p([(45,46),(53,43),(57,50),(54,57),(47,56)],'purple');a.r(49,49,5,4,'dark')
    elif mode=='elf-diplomat':a.r(23,17,19,2,'gold');a.gem(29,16,7,'mint');a.r(20,46,4,13,'gold');a.r(43,46,4,13,'gold');a.r(26,51,14,2,'light')
    elif mode in ['foxfolk','catfolk']:
        c='tan' if mode=='foxfolk' else 'stone';a.p([(17,23),(15,7),(27,16)],c);a.p([(38,16),(49,7),(47,24)],c);a.p([(19,18),(18,11),(24,16)],'skin');a.p([(41,17),(47,11),(46,19)],'skin');a.p([(26,31),(38,31),(36,38),(28,38)],'light');a.r(31,32,3,2,'ink');a.line(21,35,15,33,'light',1);a.line(41,35,49,33,'light',1)
        if mode=='foxfolk':a.r(22,47,20,3,'leaf');a.line(17,48,41,58,'tan',3)
        else:a.p([(23,28),(31,26),(32,31),(23,33)],'ink');a.r(42,36,3,5,'gold');a.r(22,49,21,3,'red')
    elif mode=='horned':a.p([(20,20),(15,12),(16,5),(20,11),(26,15)],'tan');a.p([(40,19),(48,12),(47,5),(44,11),(37,15)],'tan');a.line(24,32,28,36,'red',1);a.box(11,48,13,9,'stone');a.box(42,48,13,9,'stone');a.r(14,46,2,5,'steel');a.r(50,46,2,5,'steel')
    elif mode=='construct':
        a.p([(21,16),(40,16),(45,25),(43,38),(36,44),(25,41),(20,30)],'steel');a.r(24,23,17,2,'stone');a.r(25,28,5,2,'mint');a.r(35,28,5,2,'mint');a.r(31,31,3,6,'stone');a.r(28,39,9,2,'gold');a.r(21,47,4,12,'gold');a.r(42,47,4,12,'gold');a.gem(27,49,11,'mint')
    return a

HUMANS=[
 ('traveler','Путешественница','braid','brown','skin','leaf'),('guard','Городской страж','short','black','skin','stone'),('archivist','Архивистка','bun','brown','skin','purple'),('blacksmith','Кузнец','short','black','#b98b75','shade'),
 ('healer','Целительница','long','blond','skin','leaf'),('sailor','Моряк','short','brown','#b98b75','water'),('merchant','Купчиха','curly','black','#ad7c66','purple'),('hunter','Следопыт','short','brown','skin','leaf'),
 ('farmer','Земледелец','short','blond','#b98b75','wood'),('innkeeper','Хозяйка трактира','bun','red','skin','red'),('alchemist','Алхимик','swept','white','skin','purple'),('miner','Шахтёр','short','red','#b98b75','stone'),
 ('bard','Бард','long','brown','skin','red'),('priest','Служительница святилища','long','black','skin','light'),('runescholar','Исследователь рун','bald','black','#a87865','water'),('messenger','Посыльная','short','red','skin','leaf'),
 ('noble','Знатная госпожа','long','white','skin','purple'),('captain','Капитан','braid','black','#b98b75','water'),('druid','Друид','curly','white','#b98b75','leaf'),('desertscout','Проводница пустыни','short','black','#a87865','tan'),
 ('engineer','Мастер механизмов','bun','brown','skin','wood'),('frostguide','Проводник снежных троп','short','white','skin','stone'),('judge','Судья','swept','white','skin','ink'),('weaver','Ткачиха','braid','red','skin','purple'),
 ('fisher','Рыбак','short','brown','#ad7c66','water'),('herbalist','Травница','long','brown','skin','leaf'),('necromancer','Некромант','short','white','#abb6a6','ink'),('firemage','Маг огня','spiky','red','#b98b75','red'),
 ('watermage','Маг воды','long','blue','skin','water'),('earthmage','Маг земли','short','brown','#ad7c66','stone'),('windmage','Маг ветра','swept','white','skin','water'),('lightmage','Маг света','long','blond','skin','light'),
 ('bloodmage','Маг крови','short','black','skin','red'),('shadowmage','Маг тени','long','black','#a8a8af','purple'),('elf-diplomat','Остроухий дипломат','long','blond','skin','leaf'),('dwarf-jeweler','Бородатый ювелир','bald','brown','skin','wood'),
 ('foxfolk','Лисья следопытка','short','red','tan','leaf'),('catfolk','Кошачий ловкач','short','black','stone','ink'),('horned','Рогатый наёмник','short','black','#ad7c66','stone'),('construct','Металлический хранитель','bald','black','steel','shade')]
for mode,label,style,hair,skin,cloth in HUMANS:add('portrait-'+mode,label,'portrait',human(mode,style,hair,skin,cloth),['портрет','персонаж','образ',mode])

def creature(mode):
    a=Art();a.frame('violet')
    if mode in ['wolf','fox','bear','boar','deer','horse']:
        if mode=='horse':
            a.p([(20,58),(19,41),(26,26),(23,14),(27,6),(35,14),(43,12),(45,23),(54,35),(53,44),(40,44),(36,58)],'wood');a.p([(28,28),(34,20),(42,24),(49,35),(48,39),(38,37),(31,53),(25,54)],'tan');a.r(37,27,4,3,'ink');a.r(45,36,5,2,'ink');a.p([(24,14),(19,19),(18,32),(24,39),(29,24)],'bark');a.r(28,9,2,8,'tan')
        else:
            c='tan' if mode in ['fox','deer'] else 'wood' if mode in ['bear','boar'] else 'stone'
            if mode=='bear':ears=[[(13,20),(13,12),(20,9),(26,15)],[(39,15),(45,9),(52,12),(52,20)]]
            elif mode=='boar':ears=[[(14,27),(10,11),(25,20)],[(39,20),(54,11),(49,27)]]
            else:ears=[[(14,26),(12,8),(27,20)],[(38,20),(52,8),(49,26)]]
            for pts in ears:a.p(pts,'ink');a.p([(x+(2 if x<32 else -2),y+2) for x,y in pts],c)
            a.p([(14,25),(23,17),(42,17),(50,25),(53,42),(43,55),(22,55),(11,43)],'ink');a.p([(18,26),(25,21),(40,21),(46,27),(48,41),(40,51),(24,51),(16,41)],c)
            if mode=='fox':a.p([(17,34),(29,40),(32,47),(35,40),(47,34),(43,48),(33,54),(21,47)],'light')
            elif mode=='wolf':a.p([(17,32),(28,37),(32,48),(36,37),(48,32),(42,48),(33,54),(23,48)],'steel')
            else:a.p([(23,38),(39,38),(44,43),(40,50),(25,50),(20,43)],'tan' if mode!='deer' else 'light')
            a.r(21,30,6,3,'ink');a.r(37,30,6,3,'ink');a.r(24,30,2,1,'gold');a.r(38,30,2,1,'gold');a.p([(28,41),(36,41),(34,46),(30,46)],'ink');a.r(31,47,2,3,'bark')
            if mode=='boar':a.r(26,39,12,8,'skin');a.r(28,42,2,2,'ink');a.r(34,42,2,2,'ink');a.p([(20,42),(22,34),(24,46)],'light');a.p([(42,42),(43,34),(40,46)],'light')
            if mode=='deer':
                for mirror in [False,True]:
                    pts=[(24,20),(19,13),(18,6),(15,6),(16,13),(11,11),(8,6),(6,7),(10,15),(18,17),(20,23)]
                    a.p([(64-x,y) if mirror else (x,y) for x,y in pts],'tan')
    elif mode in ['owl','raven','eagle','griffin']:
        if mode=='owl':a.p([(14,18),(13,8),(25,15),(39,15),(51,8),(50,18),(54,33),(47,51),(33,57),(17,51),(10,33)],'wood');a.box(14,23,18,18,'tan');a.box(34,23,17,18,'tan');a.box(19,27,10,10,'gold');a.box(37,27,10,10,'gold');a.r(23,29,4,6,'ink');a.r(39,29,4,6,'ink');a.p([(29,36),(36,36),(32,43)],'gold');a.r(24,49,4,5,'tan');a.r(37,49,4,5,'tan')
        elif mode=='raven':a.p([(16,57),(22,40),(22,24),(29,14),(43,14),(49,23),(56,29),(52,33),(42,31),(42,40),(50,57)],'ink');a.p([(24,27),(30,18),(42,18),(46,24),(40,25),(38,42),(29,50),(23,49)],'shade');a.r(39,23,4,3,'red');a.p([(45,27),(56,29),(48,32)],'stone');a.r(27,44,3,10,'stone')
        elif mode=='eagle':a.p([(15,57),(23,36),(19,27),(26,14),(41,14),(48,25),(54,28),(54,39),(47,38),(44,33),(43,46),(49,57)],'wood');a.p([(23,24),(29,17),(39,17),(45,24),(43,33),(37,42),(27,39)],'light');a.r(34,25,7,3,'ink');a.p([(42,28),(52,29),(53,36),(48,35),(47,31),(41,32)],'gold')
        else:
            a.p([(14,55),(10,32),(6,22),(23,32),(23,16),(34,9),(45,15),(48,26),(56,30),(53,37),(44,35),(40,47),(51,54)],'tan');a.p([(20,25),(28,13),(39,13),(43,24),(41,34),(30,42),(24,35)],'light');a.r(33,23,6,3,'ink');a.p([(41,28),(54,29),(50,34),(42,34)],'gold');a.p([(11,30),(22,37),(23,50),(16,45)],'wood');a.r(26,51,5,6,'gold');a.r(38,51,5,6,'gold')
    elif mode in ['bat','moth']:
        if mode=='bat':
            a.p([(27,28),(15,18),(6,27),(6,46),(13,40),(17,48),(24,43),(29,47),(35,47),(40,43),(47,48),(51,40),(58,46),(58,27),(49,18),(37,28)],'purple');a.p([(9,28),(15,23),(27,32),(23,39),(17,40),(13,34),(9,37)],'violet');a.p([(55,28),(49,23),(37,32),(41,39),(47,40),(51,34),(55,37)],'violet');a.p([(26,34),(25,17),(30,23),(34,23),(39,17),(38,34),(35,48),(29,48)],'shade');a.r(27,29,3,2,'red');a.r(34,29,3,2,'red');a.r(30,35,4,2,'light')
        else:
            for mirror in [False,True]:
                pts=[(31,24),(23,13),(8,9),(6,28),(16,35),(9,44),(12,54),(26,50),(32,37)];a.p([(64-x,y) if mirror else (x,y) for x,y in pts],'purple')
                a.gem(42 if mirror else 11,18,12,'gold');a.r(43 if mirror else 16,43,6,4,'violet')
            a.r(29,21,6,30,'wood');a.r(30,17,4,6,'gold');a.line(30,18,25,10,'gold',1);a.line(33,18,39,10,'gold',1)
    elif mode in ['spider','scorpion','beetle']:
        if mode=='spider':
            for x1,y1,x2,y2,x3,y3 in [(27,31,16,16,10,25),(25,36,12,28,7,39),(25,41,13,43,9,54),(28,45,23,53,21,58)]:
                for mirror in [False,True]:
                    conv=lambda x:64-x if mirror else x;a.line(conv(x1),y1,conv(x2),y2,'wood',3);a.line(conv(x2),y2,conv(x3),y3,'wood',3)
            a.p([(25,13),(39,13),(44,23),(41,34),(35,39),(26,35),(21,25)],'shade');a.box(25,33,14,15,'wood');a.r(27,35,3,3,'red');a.r(34,35,3,3,'red');a.r(28,18,7,5,'purple')
        elif mode=='scorpion':
            a.p([(27,43),(26,32),(30,25),(34,25),(40,16),(36,9),(27,10),(24,16),(27,20),(23,23),(19,18),(21,8),(34,5),(43,12),(43,20),(38,27),(37,43)],'tan');a.box(24,35,15,16,'wood')
            for x1,x2 in [(26,16),(36,48)]:a.line(x1,43,x2,31,'tan',3);a.p([(x2-6,31),(x2-8,21),(x2-2,18),(x2,25),(x2+4,18),(x2+6,24),(x2+3,33)],'wood')
            for y in (42,48,54):a.line(25,y,16,y+3,'tan',2);a.line(38,y,49,y+3,'tan',2)
        else:
            for y in (24,34,44):a.line(20,y,11,y-5,'wood',3);a.line(44,y,52,y-5,'wood',3)
            a.p([(23,21),(19,33),(20,46),(29,54),(36,54),(45,46),(46,33),(41,21)],'leaf');a.r(31,25,2,26,'ink');a.r(24,28,3,15,'mint');a.r(39,28,3,15,'green');a.box(25,13,15,10,'wood');a.line(29,14,24,6,'tan',2);a.line(35,14,42,6,'tan',2)
    elif mode in ['snake','lizard','frog','turtle','dragon']:
        if mode=='snake':a.p([(16,57),(13,50),(14,39),(22,33),(36,33),(42,29),(42,20),(37,16),(30,17),(27,23),(35,27),(32,31),(22,28),(22,17),(29,10),(42,10),(49,16),(49,31),(43,40),(27,40),(22,44),(22,50),(29,52),(42,48),(49,49),(42,55),(28,59)],'leaf');a.r(29,18,4,3,'gold');a.r(35,17,5,2,'ink');a.r(39,27,7,3,'mint');a.r(17,44,3,8,'mint');a.p([(28,28),(24,35),(21,31)],'red')
        elif mode=='lizard':a.p([(13,57),(18,41),(24,36),(25,24),(32,17),(45,18),(54,29),(48,37),(37,37),(32,48),(40,53),(36,58),(27,52),(26,47),(20,50),(18,58)],'leaf');a.r(31,21,10,4,'green');a.r(40,25,4,3,'gold');a.r(48,31,4,2,'ink');a.line(24,39,11,32,'green',3);a.line(37,39,49,45,'green',3);a.r(19,45,4,7,'mint')
        elif mode=='frog':a.p([(13,49),(10,36),(16,22),(24,19),(32,23),(41,19),(50,24),(54,37),(49,49),(40,55),(22,55)],'leaf');a.box(16,19,11,13,'green');a.box(38,19,11,13,'green');a.r(19,21,6,7,'gold');a.r(40,21,6,7,'gold');a.r(21,22,2,5,'ink');a.r(41,22,2,5,'ink');a.r(19,39,29,2,'ink');a.p([(22,44),(41,44),(38,51),(26,51)],'mint');a.p([(14,41),(7,50),(15,56),(23,53)],'green');a.p([(50,41),(57,50),(49,56),(41,53)],'green')
        elif mode=='turtle':a.p([(16,18),(28,13),(44,19),(49,34),(44,49),(25,51),(14,41),(12,29)],'wood');a.p([(19,20),(28,17),(41,22),(45,34),(40,45),(26,47),(18,39),(16,29)],'leaf');a.p([(25,23),(36,24),(40,33),(35,42),(25,41),(21,32)],'green');a.line(25,23,25,41,'gold',1);a.line(22,32,39,32,'gold',1);a.p([(44,29),(53,24),(58,29),(58,37),(52,41),(45,37)],'mint');a.r(52,28,3,2,'ink');a.r(18,46,7,9,'mint');a.r(33,46,7,9,'mint');a.p([(13,30),(6,35),(14,38)],'leaf')
        else:a.p([(8,57),(14,39),(13,23),(21,27),(24,15),(32,13),(40,16),(45,23),(57,29),(57,37),(48,42),(38,41),(42,57)],'leaf');a.p([(16,25),(21,28),(25,18),(32,17),(39,21),(37,28),(26,29),(26,43),(20,47)],'green');a.p([(24,18),(20,5),(27,12),(29,17)],'tan');a.p([(36,18),(44,5),(43,17)],'tan');a.r(33,25,7,3,'gold');a.r(36,25,2,3,'ink');a.p([(44,30),(55,31),(55,36),(48,36)],'wood');a.r(48,32,3,2,'ink');a.p([(46,39),(51,38),(51,42)],'light');a.r(26,48,7,3,'mint')
    elif mode in ['fish','shark','octopus','crab']:
        if mode=='fish':a.p([(11,28),(20,20),(36,18),(49,26),(55,15),(55,49),(48,39),(36,45),(20,43),(10,35)],'blue');a.p([(24,20),(30,10),(39,20)],'mint');a.p([(26,44),(34,54),(39,44)],'mint');a.r(18,28,6,6,'light');a.r(19,30,3,3,'ink');a.r(29,23,2,16,'steel');a.r(33,29,8,2,'mint');a.r(42,29,6,2,'mint')
        elif mode=='shark':a.p([(8,34),(19,25),(32,22),(38,9),(43,23),(49,27),(58,15),(56,47),(48,38),(36,43),(28,51),(27,42),(17,41)],'steel');a.p([(11,35),(28,32),(43,35),(48,38),(35,42),(21,40)],'light');a.r(18,28,4,3,'ink');a.r(17,36,14,2,'ink');a.p([(22,36),(25,36),(24,40)],'white');a.r(34,27,1,7,'stone');a.r(37,27,1,7,'stone')
        elif mode=='octopus':
            for pts in [[(23,35),(15,39),(11,52),(6,48),(6,55),(13,58),(18,47),(25,45)],[(29,40),(22,47),(23,55),(28,58),(32,52),(33,44)],[(38,38),(40,48),(46,54),(52,52),(55,44),(58,47),(56,56),(47,59),(38,54),(34,45)]]:a.p(pts,'purple')
            a.p([(20,30),(20,20),(27,11),(39,11),(47,22),(45,35),(39,43),(27,43)],'purple');a.r(26,29,6,6,'light');a.r(37,29,6,6,'light');a.r(28,30,3,4,'ink');a.r(38,30,3,4,'ink');a.r(25,18,8,3,'violet');a.r(14,46,2,4,'violet');a.r(45,52,4,2,'violet')
        else:
            for x1,x2 in [(23,10),(41,54)]:a.line(x1,36,x2,27,'red',4);a.p([(x2-5,28),(x2-5,15),(x2,11),(x2+2,19),(x2+7,14),(x2+7,23),(x2+3,30)],'fire')
            a.p([(20,28),(43,28),(49,36),(44,46),(19,46),(14,36)],'red');a.r(23,30,14,3,'fire');a.r(24,20,3,11,'red');a.r(37,20,3,11,'red');a.r(23,18,5,5,'ink');a.r(36,18,5,5,'ink');a.r(24,19,2,2,'light');a.r(37,19,2,2,'light')
            for y in (37,44,50):a.line(19,y,10,y+4,'red',2);a.line(44,y,53,y+4,'red',2)
    elif mode in ['golem','treant','wisp','skeleton']:
        if mode=='golem':a.p([(8,57),(12,41),(20,35),(19,16),(26,9),(41,12),(47,23),(44,36),(53,42),(58,57)],'stone');a.p([(22,20),(28,14),(39,17),(43,25),(40,36),(27,34)],'steel');a.r(25,26,6,3,'mint');a.r(36,27,6,3,'mint');a.r(30,34,9,2,'shade');a.gem(26,44,14,'mint');a.r(14,44,4,11,'steel');a.r(47,46,3,9,'shade')
        elif mode=='treant':a.p([(11,57),(15,43),(19,39),(16,20),(22,11),(39,10),(49,20),(45,38),(52,45),(57,57)],'bark');a.p([(23,17),(36,15),(43,22),(39,41),(29,47),(22,37)],'wood');a.r(25,26,6,3,'mint');a.r(36,25,6,3,'mint');a.p([(28,38),(39,35),(38,40),(30,42)],'ink');a.p([(19,23),(10,16),(9,8),(13,11),(21,15)],'wood');a.p([(40,15),(45,7),(48,10),(46,18)],'wood');a.p([(12,12),(14,6),(25,7),(28,13)],'leaf');a.p([(35,10),(40,5),(52,9),(53,16),(45,18)],'green');a.line(27,18,27,36,'tan',2)
        elif mode=='wisp':a.p([(15,54),(15,40),(21,36),(19,23),(27,29),(31,10),(37,21),(44,15),(44,31),(50,38),(48,52),(39,59),(25,59)],'purple');a.p([(21,52),(23,39),(29,35),(31,21),(36,30),(39,27),(40,39),(44,45),(40,53),(30,56)],'mint');a.r(27,40,4,4,'ink');a.r(37,39,4,4,'ink');a.r(31,50,5,2,'light');a.r(13,20,2,3,'violet');a.r(48,11,2,2,'mint')
        else:a.p([(10,57),(17,47),(28,43),(36,43),(48,48),(55,57)],'shade');a.r(29,41,6,18,'light');a.r(17,49,31,4,'light');a.p([(18,21),(25,12),(40,12),(47,21),(45,36),(39,44),(25,43),(19,36)],'light');a.box(22,24,9,10,'ink');a.box(34,24,9,10,'ink');a.p([(30,33),(35,33),(36,37),(29,37)],'ink');a.r(26,39,14,2,'wood');a.r(28,38,2,6,'ink');a.r(34,38,2,6,'ink');a.r(38,38,2,5,'ink');a.r(29,54,8,2,'shade')
    return a

CREATURES=[('wolf','Волк'),('fox','Лиса'),('bear','Медведь'),('boar','Кабан'),('deer','Олень'),('owl','Сова'),('raven','Ворон'),('eagle','Орёл'),('bat','Летучая мышь'),('spider','Паук'),('scorpion','Скорпион'),('snake','Змея'),('lizard','Ящерица'),('frog','Лягушка'),('turtle','Черепаха'),('fish','Рыба'),('shark','Акула'),('octopus','Осьминог'),('crab','Краб'),('moth','Мотылёк'),('beetle','Жук'),('horse','Лошадь'),('dragon','Дракон'),('griffin','Грифон'),('golem','Каменный голем'),('treant','Древесное существо'),('wisp','Светящийся дух'),('skeleton','Скелет')]
for mode,label in CREATURES:add('creature-'+mode,label,'creature',creature(mode),['портрет','существо','образ',mode])

def finish():
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    header="// Generated by scripts/generate-expanded-assets.py. Original editable art, CC0.\n"
    header+="export interface ExpandedAsset { id: string; label: string; category: 'portrait' | 'creature' | 'item' | 'object' | 'background' | 'effect'; tags: string[]; file: string; objectKind?: 'wall' | 'door' | 'tree' | 'rock' | 'crate' | 'platform' | 'lamp' | 'water' }\n"
    module=header+'export const expandedAssets: ExpandedAsset[] = '+json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
    module+='export const expandedArtwork: Record<string, string> = {\n'
    module+='\n'.join(f'  {json.dumps(e["id"])}: new URL(\'./assets/expanded/{e["file"]}\', import.meta.url).href,' for e in manifest)+'\n}\n'
    (ROOT/'src/expandedArtwork.ts').write_text(module,encoding='utf-8')
    (OUT/'LICENSE.txt').write_text('World 6 expanded native pixel-art library\n\nAll SVG files and their original generator in this directory were authored for this project. No third-party images, fonts, trademarks or downloaded artwork are included.\n\nTo the extent possible under law, the author dedicates these original SVG files and the generator to the public domain under CC0 1.0 Universal. This dedication applies only to this expanded set, not to other assets or code in this repository.\n\nCC0 1.0 legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode\n',encoding='utf-8')
    if Image:
        regular=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        font=ImageFont.truetype(str(regular),13) if regular.exists() else ImageFont.load_default()
        titlefont=ImageFont.truetype(str(regular),23) if regular.exists() else font
        categorynames={'background':'Поверхности и фоны — 48','object':'Окружение — 129','item':'Предметы — 72','portrait':'Портреты персонажей — 40','creature':'Портреты существ — 28'}
        def sheet(entries,filename,title,cols=8,cellw=156,cellh=153):
            rows=math.ceil(len(entries)/cols)
            board=Image.new('RGB',(cols*cellw+24,rows*cellh+76),P['ink']);d=ImageDraw.Draw(board)
            d.text((16,13),title,font=titlefont,fill=P['light'])
            d.text((16,43),'Оригинальные SVG · 64 px · CC0 · Грани Бытия',font=font,fill=P['steel'])
            for i,(label,cat,img) in enumerate(entries):
                x=12+(i%cols)*cellw;y=72+(i//cols)*cellh
                # Checkers intentionally show that props/items have transparency.
                for yy in range(0,112,8):
                    for xx in range(0,cellw-8,8):d.rectangle((x+xx,y+yy,x+xx+7,y+yy+7),fill='#1b2a35' if (xx+yy)%16 else '#22343e')
                scale=1 if img.width>64 else 2
                pic=img.resize((img.width*scale,img.height*scale),Image.Resampling.NEAREST)
                if pic.height>112:pic=img.resize((112,112),Image.Resampling.NEAREST)
                board.paste(pic,(x+(cellw-8-pic.width)//2,y+(112-pic.height)//2),pic)
                words=label.split();lines=['']
                for word in words:
                    trial=(lines[-1]+' '+word).strip()
                    if d.textbbox((0,0),trial,font=font)[2]>cellw-10 and lines[-1]:lines.append(word)
                    else:lines[-1]=trial
                for j,line in enumerate(lines[:2]):d.text((x+2,y+117+j*15),line,font=font,fill=P['light'])
            board.save(PREVIEW/filename)
        for cat in categorynames:sheet([e for e in images if e[1]==cat],f'expanded-{cat}-preview.png',categorynames[cat])
        # The opening contact sheet is a curated cross-section, not a count sheet.
        selected=[]
        samples={'background':[0,2,10,13,20,24,27,30,36,40,43,45], 'object':[0,1,3,5,9,16,20,26,33,38,44,48,52,56,60,64,67,70,78,84,92,101,107,114], 'item':[0,2,6,9,11,15,20,23,27,31,35,40,44,48,52,56,60,61], 'portrait':[0,1,2,3,5,6,11,16,18,19,20,22,27,31,34,36,37,39], 'creature':[0,2,4,5,8,9,11,14,16,17,22,23,24,25,26,27]}
        for cat,indexes in samples.items():
            group=[e for e in images if e[1]==cat]
            selected.extend(group[i] for i in indexes)
        sheet(selected,'expanded-assets-preview.png','Грани Бытия · 317 новых изображений')
    print(json.dumps(dict(total=len(manifest),categories=dict(Counter(e['category'] for e in manifest))),ensure_ascii=False))

finish()

