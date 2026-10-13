"""203 distinct native pixel-art recipes completing the environment library.

Original editable SVG art, CC0. Called by generate-expanded-assets.py.
"""
from math import sin, cos, pi


def generate(Art, add, noise, palette):
    def ring(a, x, y, w, h, c='stone', inner='dark'):
        a.p([(x+4,y),(x+w-4,y),(x+w,y+4),(x+w,y+h-4),(x+w-4,y+h),(x+4,y+h),(x,y+h-4),(x,y+4)],c)
        a.p([(x+6,y+3),(x+w-6,y+3),(x+w-3,y+6),(x+w-3,y+h-6),(x+w-6,y+h-3),(x+6,y+h-3),(x+3,y+h-6),(x+3,y+6)],inner)

    def masonry(a, x, y, w, h, material='stone', brickw=16, brickh=9):
        a.r(x,y,w,h,'ink')
        for row, yy in enumerate(range(y,y+h,brickh)):
            for xx in range(x-brickw//2 if row%2 else x,x+w,brickw):
                left=max(x,xx+1);right=min(x+w,xx+brickw-1)
                a.r(left,yy+1,right-left,min(brickh-2,y+h-yy-1),material)
                a.r(left,yy+1,right-left,1,'tan' if material=='wood' else 'steel')

    def leaves(a,x,y,w,h,c='leaf'):
        a.p([(x,y+h//3),(x+w//4,y),(x+3*w//4,y),(x+w,y+h//3),(x+w-2,y+3*h//4),(x+3*w//4,y+h),(x+w//4,y+h),(x,y+3*h//4)],'ink')
        a.p([(x+2,y+h//3),(x+w//4,y+2),(x+3*w//4,y+2),(x+w-2,y+h//3),(x+w-4,y+3*h//4),(x+3*w//4,y+h-2),(x+w//4,y+h-2),(x+2,y+3*h//4)],c)
        a.r(x+w//4,y+4,w//3,2,'green' if c=='leaf' else 'light')

    # Forty complete repeatable floor/wall/roof surfaces. Patterns intentionally
    # divide the 96x64 canvas so the boundary remains continuous when tiled.
    tiles=[
        ('red-brick','Красная кирпичная кладка','brick'),
        ('herringbone-brick','Кирпич ёлочкой','herringbrick'),
        ('rubble-wall','Бутовая кладка','rubble'),
        ('adobe','Глинобитная стена','adobe'),
        ('timber-wall','Бревенчатая стена','logs'),
        ('half-timber','Стена с фахверком','timber'),
        ('wattle','Плетёная стенка','wattle'),
        ('bamboo-mat','Бамбуковая циновка','bamboomat'),
        ('shingles','Деревянная кровельная дранка','shingles'),
        ('fishscale-roof','Чешуйчатая черепица','scales'),
        ('pantile-roof','Желобчатая черепица','pantiles'),
        ('thatch-roof','Соломенная кровля','thatch'),
        ('slate-roof','Сланцевая кровля','slateroof'),
        ('copper-roof','Медные листы кровли','copper'),
        ('riveted-floor','Клёпаные металлические листы','rivets'),
        ('diamond-floor','Рифлёный металлический настил','diamond'),
        ('octagon-floor','Восьмиугольная плитка','octagon'),
        ('hexagon-floor','Шестигранная плитка','hexagon'),
        ('basket-parquet','Паркет корзинкой','basketparquet'),
        ('endgrain-floor','Торцевые деревянные шашки','endgrain'),
        ('rope-mat','Верёвочный коврик','ropemat'),
        ('reed-mat','Камышовая циновка','reedmat'),
        ('woven-checker','Ткань с клетчатым переплетением','woven'),
        ('chainmail-mat','Кольчужное полотно','chainmat'),
        ('honeycomb-grate','Сотовая решётка','honeygrate'),
        ('vent-floor','Настил с вентиляционными щелями','vents'),
        ('pumice-ground','Пористая пемза','pumice'),
        ('shell-ground','Песок с ракушками','shellsand'),
        ('flint-ground','Острые кремневые сколы','flint'),
        ('clay-cracks','Высохшая растрескавшаяся глина','clay'),
        ('heather-ground','Цветущий вересковый покров','heather'),
        ('clover-ground','Листья клевера','clover'),
        ('lichen-ground','Корочки лишайника','lichen'),
        ('pine-needles','Сосновая хвоя','needles'),
        ('seaweed-ground','Затопленные водоросли','seaweed'),
        ('ripple-sand','Песок с мелкой рябью','ripples'),
        ('snow-crust','Наст с ветровыми гребнями','snowcrust'),
        ('frost-window','Инеевые ветви','frost'),
        ('black-ice','Лёд с пузырьками воздуха','bubbles'),
        ('steam-grate','Решётчатый настил с люками','hatches'),
    ]

    def tile(mode):
        a=Art(96,64);a.r(0,0,96,64,'dark')
        if mode in ('brick','rubble','adobe'):
            masonry(a,0,0,96,64,{'brick':'wood','rubble':'stone','adobe':'tan'}[mode],24 if mode!='rubble' else 16,16 if mode!='rubble' else 8)
            if mode=='adobe':
                for x,y in [(5,5),(40,23),(71,48)]:a.r(x,y,7,1,'wood');a.r(x+7,y+1,3,4,'wood')
            elif mode=='rubble':
                for x,y in [(3,2),(35,18),(67,34),(19,50)]:a.p([(x,y),(x+7,y),(x+12,y+5),(x+4,y+5)],'light')
        elif mode=='herringbrick':
            for y in range(-16,64,16):
                for x in range(-16,96,16):
                    a.p([(x,y+4),(x+4,y),(x+16,y+12),(x+12,y+16)],'red');a.p([(x+16,y+12),(x+20,y+16),(x+8,y+28),(x+4,y+24)],'wood');a.line(x+3,y+4,x+12,y+13,'skinshade',1)
        elif mode=='logs':
            for y in range(0,64,16):
                a.r(0,y,96,14,'wood');a.r(0,y+2,96,2,'tan');a.r(0,y+11,96,2,'bark')
                for x in range(8,96,24):ring(a,x,y+5,12,6,'bark','wood')
        elif mode=='timber':
            a.r(0,0,96,64,'tan')
            for x in range(0,96,32):a.r(x,0,4,64,'bark')
            for y in range(0,64,32):a.r(0,y,96,4,'bark')
            for x in range(0,96,32):a.line(x+4,4,x+30,30,'wood',4);a.line(x+4,36,x+30,62,'wood',4)
        elif mode in ('wattle','bamboomat','reedmat','ropemat','woven'):
            a.r(0,0,96,64,'wood')
            if mode=='wattle':
                for x in range(0,96,12):a.r(x,0,3,64,'tan')
                for y in range(0,64,8):
                    for x in range(0,96,12):a.r(x,y+(2 if x%24 else 0),12,2,'gold');a.r(x+2,y+4,10,2,'bark')
            elif mode=='bamboomat':
                for x in range(0,96,8):a.r(x,0,6,64,'green');a.r(x+1,0,1,64,'mint')
                for y in range(0,64,16):a.r(0,y,96,2,'tan')
            elif mode=='reedmat':
                for x in range(0,96,4):a.r(x,0,2,64,'gold')
                for y in range(0,64,8):a.r(0,y,96,2,'bark')
            elif mode=='ropemat':
                for y in range(0,64,8):
                    for x in range(0,96,8):a.p([(x,y+3),(x+5,y),(x+8,y+3),(x+3,y+6)],'tan');a.r(x+2,y+2,3,1,'gold')
            else:
                for y in range(0,64,8):
                    for x in range(0,96,8):a.r(x,y,7,7,'purple' if (x+y)%16 else 'gold');a.r(x+1,y+1,5,1,'light');a.r(x+1,y+3,5,1,'bark')
        elif mode in ('shingles','scales','pantiles','thatch','slateroof','copper'):
            if mode=='copper':
                a.r(0,0,96,64,'leaf')
                for y in range(0,64,32):
                    for x in range(0,96,32):a.r(x,y,2,32,'tan');a.r(x,y,32,2,'tan');a.r(x+3,y+4,8,2,'mint');a.r(x+24,y+21,3,6,'green')
            elif mode=='thatch':
                a.r(0,0,96,64,'bark')
                for y in range(0,64,16):
                    for x in range(0,96,4):a.line(x,y,x+3,y+13,'gold' if x%12 else 'tan',2)
                    a.r(0,y+13,96,2,'wood')
            elif mode=='pantiles':
                a.r(0,0,96,64,'wood')
                for x in range(0,96,12):a.r(x,0,2,64,'fire');a.r(x+3,0,4,64,'red');a.r(x+9,0,2,64,'bark')
                for y in range(0,64,16):a.r(0,y,96,2,'ink')
            else:
                for row,y in enumerate(range(-16,64,16)):
                    for x in range(-16,96,16):
                        xx=x+(8 if row%2 else 0)
                        if mode=='scales':a.p([(xx,y),(xx+16,y),(xx+16,y+8),(xx+12,y+14),(xx+4,y+14),(xx,y+8)],'red');a.r(xx+3,y+2,10,2,'fire')
                        elif mode=='shingles':a.r(xx+1,y+1,14,14,'wood');a.r(xx+3,y+3,1,10,'tan');a.r(xx+9,y+2,1,9,'tan');a.r(xx+2,y+12,12,1,'bark')
                        else:a.p([(xx+1,y+1),(xx+15,y+1),(xx+14,y+14),(xx+3,y+14)],'stone');a.r(xx+3,y+2,9,1,'steel');a.line(xx+9,y+4,xx+5,y+11,'shade',1)
        elif mode in ('rivets','diamond','vents','hatches'):
            a.r(0,0,96,64,'shade')
            for y in range(0,64,32):
                for x in range(0,96,32):
                    a.r(x+1,y+1,30,30,'stone');a.r(x+2,y+2,28,1,'steel')
                    if mode=='rivets':
                        for dx,dy in [(3,3),(26,3),(3,26),(26,26)]:a.r(x+dx,y+dy,3,3,'ink');a.r(x+dx,y+dy,2,1,'light')
                    elif mode=='diamond':
                        for dy in (6,18):
                            for dx in (5,17):a.p([(x+dx,y+dy+3),(x+dx+4,y+dy),(x+dx+7,y+dy+3),(x+dx+3,y+dy+6)],'steel')
                    elif mode=='vents':
                        for dy in range(5,29,5):a.r(x+5,y+dy,22,2,'ink');a.r(x+5,y+dy+2,22,1,'steel')
                    else:ring(a,x+5,y+4,22,24,'steel','dark');a.r(x+12,y+14,8,3,'gold');a.r(x+9,y+6,2,19,'stone')
        elif mode in ('octagon','hexagon','honeygrate','chainmat','basketparquet','endgrain'):
            if mode=='basketparquet':
                for y in range(0,64,16):
                    for x in range(0,96,16):
                        a.r(x+1,y+1,14,14,'tan' if (x+y)%32 else 'wood')
                        for k in (4,8,12):a.r(x+k,y+1,1,14,'bark') if (x+y)%32 else a.r(x+1,y+k,14,1,'bark')
            elif mode=='endgrain':
                for y in range(0,64,16):
                    for x in range(0,96,16):ring(a,x+1,y+1,14,14,'tan','wood');ring(a,x+4,y+4,8,8,'gold','wood');a.r(x+7,y+7,2,2,'bark')
            elif mode=='chainmat':
                for y in range(-4,64,8):
                    for x in range(-4,96,8):ring(a,x,y,8,10,'steel','dark');a.r(x+2,y+1,3,1,'light')
            else:
                size=16
                for row,y in enumerate(range(-16,64,size)):
                    for x in range(-16,96,size):
                        xx=x+(8 if row%2 and mode!='octagon' else 0)
                        pts=[(xx+4,y+1),(xx+12,y+1),(xx+15,y+5),(xx+15,y+11),(xx+12,y+15),(xx+4,y+15),(xx+1,y+11),(xx+1,y+5)] if mode=='octagon' else [(xx+4,y),(xx+12,y),(xx+16,y+8),(xx+12,y+16),(xx+4,y+16),(xx,y+8)]
                        a.p(pts,'light' if mode=='octagon' else 'steel');a.p([(px+(2 if px<xx+8 else -2),py+(2 if py<y+8 else -2)) for px,py in pts],'dark' if mode=='honeygrate' else 'shade');a.r(xx+6,y+5,4,1,'gold' if mode=='octagon' else 'stone')
                        if mode=='hexagon':
                            a.p([(xx+8,y+3),(xx+12,y+6),(xx+8,y+9),(xx+4,y+6)],'light')
                            a.p([(xx+4,y+6),(xx+8,y+9),(xx+8,y+13),(xx+4,y+10)],'stone')
                            a.p([(xx+8,y+9),(xx+12,y+6),(xx+12,y+10),(xx+8,y+13)],'steel')
        else:
            bases={'pumice':'stone','shellsand':'tan','flint':'shade','clay':'wood','heather':'leaf','clover':'leaf','lichen':'stone','needles':'bark','seaweed':'water','ripples':'tan','snowcrust':'steel','frost':'blue','bubbles':'water'}
            a.r(0,0,96,64,bases[mode])
            if mode=='ripples':
                for y in range(-8,64,16):a.p([(0,y+5),(24,y+1),(48,y+6),(72,y+2),(96,y+5),(96,y+7),(72,y+4),(48,y+8),(24,y+3),(0,y+7)],'gold');a.r(7,y+10,19,1,'wood')
            elif mode=='snowcrust':
                for y in range(-16,64,16):
                    a.p([(0,y+5),(12,y+5),(20,y),(39,y+2),(49,y+7),(65,y+7),(75,y+2),(89,y+3),(96,y+5),(96,y+10),(75,y+7),(65,y+12),(48,y+12),(37,y+7),(22,y+6),(12,y+9),(0,y+9)],'light')
                    a.r(19,y+1,17,2,'white');a.r(66,y+13,20,1,'shade')
            elif mode=='clay':
                for y in range(-16,64,16):
                    for x in range(-16,96,24):a.p([(x,y),(x+20,y-3),(x+25,y+8),(x+15,y+16),(x-2,y+13)],'bark');a.p([(x+2,y+2),(x+18,y),(x+22,y+8),(x+14,y+13),(x+1,y+11)],'tan')
            elif mode=='frost':
                for y in range(0,64,32):
                    for x in range(0,96,32):
                        a.line(x+4,y+29,x+28,y+3,'light',2)
                        for k in (8,16,24):a.line(x+k,y+30-k,x+k-7,y+23-k,'white',1);a.line(x+k,y+30-k,x+k+7,y+30-k,'white',1)
            else:
                for y in range(0,64,16):
                    for x in range(0,96,16):
                        if mode=='pumice':ring(a,x+3,y+3,8,6,'steel','shade');a.r(x+12,y+12,2,2,'dark')
                        elif mode=='shellsand':a.p([(x+2,y+10),(x+4,y+4),(x+10,y+2),(x+14,y+6),(x+12,y+12)],'light');a.line(x+5,y+9,x+10,y+3,'stone',1);a.line(x+7,y+11,x+12,y+5,'stone',1)
                        elif mode=='flint':a.p([(x+2,y+11),(x+5,y+2),(x+13,y+5),(x+11,y+13)],'ink');a.p([(x+5,y+3),(x+11,y+5),(x+7,y+10)],'steel')
                        elif mode=='heather':a.r(x+7,y+2,2,13,'green');a.r(x+3,y+4,4,3,'purple');a.r(x+9,y+7,4,3,'violet');a.r(x+5,y+1,4,3,'violet')
                        elif mode=='clover':a.r(x+7,y+9,1,7,'green');leaves(a,x+2,y+5,6,6);leaves(a,x+8,y+5,6,6);leaves(a,x+5,y,6,6)
                        elif mode=='lichen':a.p([(x+1,y+4),(x+6,y+2),(x+10,y+5),(x+14,y+4),(x+13,y+11),(x+8,y+13),(x+3,y+10)],'gold');a.r(x+6,y+6,3,3,'green')
                        elif mode=='needles':a.line(x+1,y+4,x+13,y+10,'tan',1);a.line(x+3,y+13,x+10,y+1,'leaf',1);a.r(x+11,y+3,2,2,'wood')
                        elif mode=='seaweed':a.p([(x+5,y+16),(x+2,y+8),(x+7,y),(x+10,y+2),(x+6,y+8),(x+9,y+16)],'green');a.p([(x+11,y+16),(x+10,y+5),(x+14,y+3),(x+13,y+16)],'leaf')
                        elif mode=='bubbles':ring(a,x+2,y+2,7,7,'blue','water');ring(a,x+9,y+10,4,4,'light','water');a.r(x+11,y+3,2,1,'mint')
        return a

    for slug,label,mode in tiles:add('surface-'+slug,label,'background',tile(mode),['поверхность','тайл','строительство' if mode in ('brick','rubble','adobe','logs','timber','wattle','shingles','scales','pantiles','thatch','slateroof','copper') else 'покрытие',mode])

    buildings=[
        ('corner-stone','Угол каменного коридора','corner'),('junction-stone','Развилка каменного коридора','junction'),
        ('cross-stone','Перекрёсток каменных проходов','cross'),('alcove-stone','Ниша в каменной стене','alcove'),
        ('doorway-round','Круглый дверной проём','rounddoor'),('doorway-pointed','Стрельчатый проём','pointdoor'),
        ('doorway-lintel','Проём с массивной перемычкой','lintel'),('double-arch','Двойной арочный проход','doublearch'),
        ('stair-turn','Лестница с поворотом','stairturn'),('stair-spiral','Винтовая лестница сверху','spiral'),
        ('stair-descend','Спуск в подвал','descend'),('stair-balustrade','Парадная лестница с перилами','balustair'),
        ('roof-ridge','Конёк черепичной крыши','ridge'),('roof-gable','Треугольный фронтон','gable'),
        ('roof-dormer','Слуховое окно на крыше','dormer'),('roof-chimney','Дымоход на крыше','chimney'),
        ('roof-hip','Четырёхскатная крыша сверху','hiproof'),('roof-broken','Пролом в крыше','roofbroken'),
        ('rampart-straight','Крепостная стена с зубцами','rampart'),('rampart-corner','Угол крепостной стены','rampartcorner'),
        ('tower-round','Круглая башня сверху','roundtower'),('tower-square','Квадратная башня сверху','squaretower'),
        ('gatehouse','Надвратная башня','gatehouse'),('drawbridge-entry','Въезд с разводным мостом','drawbridge'),
        ('house-courtyard','Двор с колодцем сверху','courtyard'),('cloister','Галерея вокруг сада','cloister'),
        ('cellar-vault','Сводчатый подвал','vault'),('mine-entry','Креплёный вход в шахту','mine'),
        ('cave-entry','Скалистый вход в пещеру','cave'),('sewer-entry','Выход канализации','sewer'),
        ('wood-balcony','Деревянный балкон','balcony'),('stone-terrace','Терраса с балюстрадой','terrace'),
        ('water-dock','Причал с лестницей','dock'),('canal-lock','Шлюз канала сверху','lock'),
        ('market-row','Ряд торговых лавок','market'),('stable-yard','Конюшня с загоном','stable'),
        ('watch-post','Сторожевой пост','watch'),('mill-building','Мельничное здание','mill'),
        ('greenhouse','Стеклянная оранжерея','greenhouse'),('workshop-front','Фасад ремесленной мастерской','workshop'),
    ]

    def building(mode):
        a=Art(96,64);a.r(0,0,96,64,'dark')
        if mode in ('corner','junction','cross','alcove'):
            masonry(a,0,0,96,64,'stone',16,8)
            if mode=='corner':a.r(15,0,27,48,'shade');a.r(15,30,81,24,'shade');a.r(15,0,2,48,'light');a.r(15,52,81,2,'steel')
            elif mode=='junction':a.r(34,0,28,64,'shade');a.r(0,23,96,24,'shade');a.r(0,23,34,2,'light');a.r(62,23,34,2,'light')
            elif mode=='cross':a.r(35,0,26,64,'shade');a.r(0,24,96,20,'shade');a.r(35,0,2,24,'light');a.r(59,44,2,20,'steel')
            else:a.r(14,15,68,49,'shade');a.r(27,7,42,19,'dark');a.r(27,7,42,3,'steel');a.r(17,18,62,1,'light')
            for y in range(8,64,12):a.r(40,y,8,1,'stone')
        elif mode in ('rounddoor','pointdoor','lintel','doublearch'):
            masonry(a,0,0,96,64,'stone',16,8)
            if mode=='rounddoor':a.p([(25,64),(25,27),(30,14),(39,8),(57,8),(67,16),(72,27),(72,64)],'steel');a.p([(31,64),(31,28),(36,19),(43,15),(54,15),(62,20),(66,29),(66,64)],'ink')
            elif mode=='pointdoor':a.p([(26,64),(26,29),(37,14),(48,5),(59,14),(70,29),(70,64)],'steel');a.p([(33,64),(33,30),(48,14),(63,30),(63,64)],'ink');a.r(46,18,3,41,'shade')
            elif mode=='lintel':a.r(21,9,54,14,'light');a.r(22,23,9,41,'steel');a.r(65,23,9,41,'steel');a.r(32,24,32,40,'ink');a.r(28,62,40,2,'stone')
            else:
                for x in (9,52):a.p([(x,64),(x,27),(x+9,14),(x+25,14),(x+34,27),(x+34,64)],'steel');a.p([(x+5,64),(x+5,29),(x+12,21),(x+22,21),(x+29,29),(x+29,64)],'ink')
        elif mode in ('stairturn','spiral','descend','balustair'):
            masonry(a,0,0,96,64,'shade',24,16)
            if mode=='spiral':
                ring(a,21,5,54,54,'stone','dark');a.r(45,26,7,12,'light')
                for i in range(12):
                    th=i*pi/6;x=round(48+cos(th)*23);y=round(32+sin(th)*23);a.line(48,32,x,y,'steel',2)
            elif mode=='stairturn':
                for i in range(6):a.r(6+i*8,8,7,27,'stone');a.r(6+i*8,8,1,27,'light')
                a.r(54,8,31,27,'stone')
                for i in range(4):a.r(58,36+i*7,27,6,'stone');a.r(58,36+i*7,27,1,'light')
            elif mode=='descend':
                a.r(17,5,62,59,'ink')
                for i in range(7):a.r(20+i*2,7+i*7,56-i*4,5,'steel' if i<2 else 'stone' if i<5 else 'shade');a.r(20+i*2,7+i*7,56-i*4,1,'light' if i<3 else 'stone')
            else:
                for i in range(7):a.r(11+i*3,55-i*7,74-i*6,6,'stone');a.r(11+i*3,55-i*7,74-i*6,1,'light')
                for x in (7,85):a.r(x,8,4,48,'steel');a.r(x-3,7,10,3,'light')
                for y in (19,33,47):a.r(7,y,7,4,'steel');a.r(82,y,7,4,'steel')
        elif mode in ('ridge','gable','dormer','chimney','hiproof','roofbroken'):
            if mode=='hiproof':
                a.p([(4,7),(92,7),(92,56),(4,56)],'ink');a.p([(7,10),(89,10),(69,32),(27,32)],'red');a.p([(7,53),(89,53),(69,32),(27,32)],'wood');a.p([(7,10),(27,32),(7,53)],'fire');a.p([(89,10),(69,32),(89,53)],'bark');a.r(27,30,42,3,'gold')
            elif mode=='gable':
                a.p([(4,58),(48,6),(92,58)],'wood');a.p([(12,58),(48,15),(84,58)],'tan');a.r(45,16,6,42,'bark');a.r(22,46,52,5,'bark');a.p([(32,57),(32,40),(39,32),(57,32),(64,40),(64,57)],'ink');a.r(45,35,4,23,'wood')
            else:
                for y in range(0,64,8):
                    for x in range(-8,96,16):a.r(x+(8 if y%16 else 0)+1,y+1,14,7,'red');a.r(x+(8 if y%16 else 0)+2,y+1,12,1,'fire')
                if mode=='ridge':a.r(0,28,96,7,'gold');a.r(0,35,96,5,'bark');a.r(0,28,96,2,'light')
                elif mode=='dormer':a.p([(21,47),(21,25),(48,8),(75,25),(75,47)],'wood');a.p([(17,25),(48,4),(79,25)],'shade');a.r(33,24,30,21,'dark');a.r(35,26,26,17,'blue');a.r(46,26,3,17,'wood');a.r(35,33,26,3,'wood')
                elif mode=='chimney':masonry(a,35,8,25,39,'stone',12,8);a.r(31,5,33,8,'steel');a.r(37,7,21,3,'ink');a.r(31,47,33,3,'bark')
                else:a.p([(23,15),(51,10),(70,21),(75,43),(53,55),(26,49),(17,31)],'ink');a.p([(27,23),(50,17),(65,24),(68,41),(53,46),(30,43)],'dark');a.line(29,20,64,44,'wood',4);a.line(31,44,60,22,'tan',3)
        elif mode in ('rampart','rampartcorner','roundtower','squaretower','gatehouse','drawbridge'):
            a.r(0,0,96,64,'leaf')
            if mode in ('roundtower','squaretower'):
                if mode=='roundtower':ring(a,21,4,54,55,'stone','shade');ring(a,27,10,42,43,'steel','dark');a.r(42,29,13,11,'wood')
                else:masonry(a,21,4,54,55,'stone',14,9);a.r(28,12,40,40,'dark');a.r(33,17,30,30,'shade');a.r(40,53,16,6,'wood')
                for x,y in [(20,8),(69,8),(20,50),(69,50),(43,1),(43,57)]:a.r(x,y,10,7,'light');a.r(x+2,y+2,6,3,'stone')
            elif mode in ('rampart','rampartcorner'):
                masonry(a,0,25,96,33,'stone',16,8);a.r(0,29,96,4,'light')
                for x in range(0,96,16):a.r(x,15,9,14,'steel')
                if mode=='rampartcorner':masonry(a,66,0,30,64,'stone',14,8);a.r(66,0,4,64,'light');a.r(80,0,16,64,'shade')
            elif mode=='gatehouse':
                for x in (7,63):masonry(a,x,11,26,46,'stone',13,8);a.r(x-2,7,30,7,'steel')
                masonry(a,31,16,34,22,'stone',17,8);a.p([(33,60),(33,43),(39,35),(57,35),(63,43),(63,60)],'ink');a.r(40,44,3,16,'steel');a.r(51,44,3,16,'steel')
            else:
                a.r(0,0,96,64,'water');masonry(a,0,0,96,27,'stone',16,8);a.r(30,6,36,21,'ink');a.p([(27,25),(69,25),(82,62),(14,62)],'bark')
                for y in range(27,63,5):a.r(20 if y>45 else 26,y,56 if y>45 else 44,2,'tan')
                a.line(22,3,15,56,'steel',2);a.line(72,3,79,56,'steel',2)
        elif mode in ('courtyard','cloister','stable','lock'):
            a.r(0,0,96,64,'stone')
            if mode=='lock':
                a.r(27,0,42,64,'water');a.r(22,0,5,64,'steel');a.r(69,0,5,64,'steel');a.r(28,12,40,5,'wood');a.r(28,47,40,5,'wood');a.line(28,15,47,29,'tan',2);a.line(48,29,67,15,'tan',2);a.r(31,35,27,1,'blue')
            elif mode=='stable':
                a.r(3,3,46,58,'wood');a.r(7,7,38,22,'bark');a.r(7,34,38,23,'bark');a.r(10,10,17,15,'gold');a.r(30,38,11,14,'tan');a.r(55,9,37,47,'tan')
                for x in range(55,93,8):a.r(x,6,3,52,'wood')
                a.r(55,7,37,3,'bark');a.r(55,54,37,3,'bark')
            else:
                a.r(12,12,72,40,'leaf' if mode=='cloister' else 'tan')
                for x in (0,84):a.r(x,0,12,64,'shade')
                for y in (0,52):a.r(0,y,96,12,'shade')
                if mode=='courtyard':ring(a,36,22,25,22,'stone','dark');a.r(43,26,10,9,'water');a.r(19,18,6,29,'wood')
                else:
                    for x in range(8,88,16):a.r(x,6,4,7,'light');a.r(x,51,4,7,'light')
                    a.r(44,14,8,36,'stone');a.r(14,28,68,8,'stone');leaves(a,19,17,15,12);leaves(a,63,37,15,12)
        elif mode in ('vault','mine','cave','sewer'):
            a.r(0,0,96,64,'shade');a.r(0,45,96,19,'stone')
            if mode=='cave':
                a.p([(0,54),(11,26),(28,10),(61,7),(85,27),(96,58)],'stone');a.p([(21,57),(26,33),(42,22),(60,24),(77,40),(80,57)],'ink');a.p([(8,47),(15,28),(30,15),(38,17),(22,36)],'steel');a.r(22,56,58,3,'shade')
            elif mode=='mine':
                a.r(22,14,52,44,'ink');a.r(16,9,9,50,'wood');a.r(71,9,9,50,'wood');a.r(12,9,72,9,'tan');a.line(20,17,30,28,'wood',4);a.line(64,28,76,17,'wood',4);a.line(29,64,40,40,'steel',3);a.line(58,40,71,64,'steel',3)
            elif mode=='vault':
                for x in (0,24,48,72):a.p([(x,56),(x,20),(x+8,7),(x+22,7),(x+30,20),(x+30,56),(x+25,56),(x+25,22),(x+19,13),(x+11,13),(x+5,22),(x+5,56)],'steel')
                a.r(0,57,96,7,'stone');a.r(40,36,16,21,'wood')
            else:masonry(a,0,0,96,56,'stone',16,8);ring(a,26,13,44,42,'steel','ink');a.r(36,28,2,24,'stone');a.r(47,24,2,30,'stone');a.r(58,28,2,24,'stone');a.p([(32,52),(64,52),(88,64),(8,64)],'water');a.r(34,58,29,1,'blue')
        elif mode in ('balcony','terrace','dock'):
            a.r(0,0,96,64,'water' if mode=='dock' else 'shade')
            a.p([(7,19),(89,19),(92,53),(4,53)],'wood' if mode!='terrace' else 'stone')
            for y in range(23,54,7):a.r(7,y,82,1,'tan' if mode!='terrace' else 'steel')
            if mode=='dock':
                for x in (13,77):a.r(x,8,7,52,'wood');a.r(x+1,8,5,3,'tan')
                a.r(35,47,4,17,'steel');a.r(56,47,4,17,'steel');a.r(37,56,19,3,'light');a.r(3,58,19,1,'blue')
            else:
                a.r(4,12,88,5,'tan' if mode=='balcony' else 'light')
                for x in range(7,91,12):a.r(x,17,4,15,'wood' if mode=='balcony' else 'steel');a.r(x-1,27,6,5,'wood' if mode=='balcony' else 'steel')
                if mode=='balcony':a.p([(8,52),(24,52),(9,63)],'bark');a.p([(72,52),(88,52),(86,63)],'bark')
                else:a.r(3,50,90,5,'shade');a.r(10,55,76,5,'steel')
        else:
            a.r(0,0,96,64,'dark');a.r(0,48,96,16,'stone')
            if mode=='market':
                for x,c in [(3,'purple'),(35,'red'),(67,'leaf')]:a.r(x+3,19,3,33,'wood');a.r(x+22,19,3,33,'wood');a.p([(x,21),(x+6,9),(x+23,9),(x+29,21)],c);a.r(x,22,29,7,'tan');a.r(x+2,39,25,11,'wood');a.r(x+5,35,6,4,'gold');a.r(x+17,32,5,7,'light')
            elif mode=='watch':
                a.r(29,21,7,39,'wood');a.r(63,21,7,39,'wood');a.r(20,27,58,8,'tan');a.r(22,13,4,17,'wood');a.r(73,13,4,17,'wood');a.p([(15,14),(49,3),(82,14)],'bark');a.r(31,19,42,4,'wood');a.r(44,34,3,28,'tan');a.r(58,34,3,28,'tan')
                for y in range(38,61,6):a.r(47,y,11,2,'wood')
            elif mode=='mill':
                masonry(a,11,21,54,36,'stone',18,9);a.p([(5,21),(38,5),(72,21)],'wood');a.r(28,37,16,21,'dark');ring(a,59,25,31,32,'wood','dark')
                for i in range(8):a.line(75,41,round(75+cos(i*pi/4)*14),round(41+sin(i*pi/4)*14),'tan',2)
                a.r(56,57,40,7,'water')
            elif mode=='greenhouse':
                a.p([(10,56),(10,22),(47,5),(86,22),(86,56)],'steel');a.p([(14,53),(14,24),(47,10),(82,24),(82,53)],'blue')
                for x in (24,39,55,70):a.r(x,24,2,29,'light')
                a.r(14,36,68,2,'light');a.r(46,10,3,44,'steel');a.line(14,25,80,25,'light',2);leaves(a,18,40,19,13);leaves(a,59,40,17,13)
            else:
                masonry(a,9,21,78,36,'wood',26,9);a.p([(3,21),(20,9),(78,9),(93,21)],'shade');a.r(16,27,24,31,'ink');a.r(52,27,27,20,'dark');a.r(54,29,23,15,'gold');a.r(63,29,2,15,'wood');a.r(51,48,30,4,'tan');a.r(13,16,8,7,'steel');a.r(19,15,10,4,'steel')
        return a

    for slug,label,mode in buildings:add('building-'+slug,label,'background',building(mode),['фон','строительство','архитектура','локация',mode])

    landscapes=[
        ('orchard','Сад с рядами плодовых деревьев','orchard'),('vineyard','Виноградник на склоне','vineyard'),
        ('rice-terraces','Затопленные террасы','terraces'),('flower-valley','Долина полевых цветов','flowers'),
        ('heather-hills','Вересковые холмы','heatherhills'),('bamboo-grove','Бамбуковая роща','bamboogrove'),
        ('mangrove','Мангровый берег','mangrove'),('tropical-shore','Берег с пальмами','palms'),
        ('redwood-ravine','Ущелье с высокими деревьями','redwoods'),('fungus-cave','Пещера с грибами','funguscave'),
        ('underground-lake','Подземное озеро','undergroundlake'),('crystal-cavern','Пещера кристаллов','crystalcave'),
        ('waterfall','Ступенчатый водопад','waterfall'),('river-delta','Речная дельта сверху','delta'),
        ('tidal-pools','Приливные скальные ванны','tidepools'),('coral-lagoon','Лагуна с коралловыми островками','lagoon'),
        ('sea-cliffs','Обрывистый морской берег','seacliffs'),('shipwreck-shore','Берег с обломками судна','wreck'),
        ('salt-canyon','Соляной каньон','saltcanyon'),('arch-desert','Пустыня с каменной аркой','desertarch'),
        ('mesa','Столовая гора','mesa'),('oasis','Оазис среди дюн','oasis'),
        ('geyser','Каменные чаши с гейзером','geyser'),('hot-springs','Террасы горячих источников','hotsprings'),
        ('glacier','Ледниковая долина','glacier'),('ice-cave','Ледяная пещера','icecave'),
        ('tundra','Тундра с карликовыми кустами','tundra'),('snow-pass','Заснеженный горный перевал','snowpass'),
        ('burned-forest','Обгоревший лес','burned'),('fallen-bridge','Руины моста над рекой','fallenbridge'),
        ('sunken-ruins','Затопленные руины','sunken'),('stone-circle','Каменный круг на холме','stonecircle'),
    ]

    def landscape(mode):
        a=Art(96,64);a.r(0,0,96,64,'dark');a.r(0,0,96,30,'#263444');a.r(72,6,9,9,'light')
        if mode in ('orchard','vineyard','terraces','flowers','heatherhills','bamboogrove','mangrove','palms','redwoods'):
            a.p([(0,36),(22,25),(42,31),(67,23),(96,35),(96,64),(0,64)],'leaf')
            if mode=='orchard':
                for x,y in [(5,27),(31,23),(59,31),(14,45),(48,43),(76,46)]:a.r(x+8,y+10,3,15,'wood');leaves(a,x,y,22,15);a.r(x+5,y+5,3,3,'red');a.r(x+15,y+8,3,3,'gold')
            elif mode=='vineyard':
                for y in (31,43,55):a.line(0,y,95,y-7,'tan',2)
                for x in range(9,96,15):a.r(x,28,2,32,'wood');leaves(a,x-6,32-x//20,13,7);leaves(a,x-6,44-x//20,13,7);a.r(x-2,41-x//20,4,4,'purple')
            elif mode=='terraces':
                for y,w in [(27,45),(35,65),(44,84),(55,96)]:a.p([(0,y),(w-8,y-4),(w,y),(w-4,y+5),(0,y+7)],'tan');a.p([(0,y+1),(w-9,y-2),(w-4,y),(w-7,y+3),(0,y+5)],'water');a.r(9,y+2,w-23,1,'blue')
            elif mode=='flowers':
                a.p([(0,48),(24,34),(57,41),(96,33),(96,64),(0,64)],'green')
                for i in range(35):x=(i*23)%96;y=35+(i*17)%28;a.r(x,y+2,1,3,'leaf');a.r(x-1,y,3,2,['gold','white','red'][i%3]);a.r(x,y-2,1,2,'light')
            elif mode=='heatherhills':
                a.p([(0,42),(12,36),(24,35),(38,41),(51,46),(70,38),(83,38),(96,44),(96,64),(0,64)],'purple')
                a.p([(0,60),(13,51),(29,47),(44,49),(61,57),(78,53),(96,56),(96,64),(0,64)],'leaf')
                for i in range(18):
                    x=3+(i*17)%89;y=39+(i*11)%22
                    a.p([(x-3,y+5),(x-2,y),(x,y+2),(x+2,y-3),(x+4,y+2),(x+7,y),(x+6,y+6)],'violet')
                    a.r(x+2,y,1,4,'mint');a.r(x+3,y-2,2,2,'light')
            elif mode=='bamboogrove':
                for x,y in [(4,9),(18,3),(32,12),(64,4),(80,14),(90,2)]:a.r(x,y,5,59-y,'green');a.r(x+1,y,1,59-y,'mint');a.p([(x,y+11),(x+15,y+6),(x+10,y+16)],'leaf');a.p([(x,y+25),(x-10,y+17),(x-13,y+23)],'green')
                for y in (19,34,49):a.r(2,y,92,1,'leaf')
            elif mode=='mangrove':
                a.r(0,39,96,25,'water')
                for x,y in [(3,13),(32,6),(68,15)]:a.r(x+10,y+18,5,22,'wood');leaves(a,x,y,29,23);a.line(x+12,y+35,x,y+47,'tan',3);a.line(x+12,y+35,x+27,y+47,'wood',3);a.r(x+2,y+48,18,1,'blue')
            elif mode=='palms':
                a.r(0,31,96,33,'water');a.p([(0,46),(24,34),(42,40),(54,64),(0,64)],'gold')
                for x,y in [(8,8),(31,13)]:a.p([(x+10,52),(x+14,25),(x+11,y+7),(x+15,y+5),(x+19,25),(x+16,52)],'wood');a.p([(x+13,y+9),(x-4,y+3),(x-10,y+13),(x-4,y+8)],'leaf');a.p([(x+13,y+9),(x+26,y),(x+38,y+12),(x+29,y+6)],'green');a.p([(x+13,y+9),(x+4,y-1),(x+1,y+3)],'mint');a.r(x+12,y+8,5,5,'tan')
            else:
                for x,y,w in [(1,0,13),(22,0,16),(65,0,12),(84,0,11)]:a.r(x,y,w,63,'bark');a.r(x+3,y,3,62,'tan');a.p([(x-6,62),(x+4,45),(x+w+9,62)],'wood');leaves(a,x-8,0,w+22,19)
                a.p([(40,64),(44,36),(56,34),(63,64)],'stone')
        elif mode in ('funguscave','undergroundlake','crystalcave','icecave'):
            a.r(0,0,96,64,'ink');a.p([(0,0),(96,0),(96,58),(83,52),(77,23),(63,13),(32,12),(15,25),(10,54),(0,64)],'stone' if mode!='icecave' else 'blue');a.r(13,51,72,13,'shade' if mode!='icecave' else 'steel')
            if mode=='funguscave':
                for x,y,s in [(16,30,20),(40,24,23),(63,39,16)]:a.r(x+s//2-2,y+8,4,56-y-8,'tan');a.p([(x,y+10),(x+3,y+3),(x+s//2,y),(x+s-3,y+3),(x+s,y+10)],'mint');a.r(x+4,y+6,3,2,'light')
            elif mode=='undergroundlake':a.p([(13,47),(44,37),(70,41),(85,51),(73,64),(20,64)],'water');a.r(27,48,39,1,'blue');a.r(40,58,32,1,'mint');a.p([(41,0),(43,19),(48,4)],'stone')
            elif mode=='crystalcave':
                for x,y,s in [(17,35,18),(37,29,25),(68,39,15)]:a.gem(x,y,s,'purple');a.r(x+4,y+3,2,6,'violet')
                a.p([(24,0),(29,19),(35,0)],'violet')
            else:
                for x,y,w in [(5,0,12),(18,0,17),(65,0,12),(80,0,15)]:a.p([(x,y),(x+w,y),(x+w//2,y+23)],'light')
                a.p([(24,61),(37,37),(46,55),(56,28),(74,63)],'blue');a.line(55,33,56,59,'light',2)
        elif mode in ('waterfall','delta','tidepools','lagoon','seacliffs','wreck','oasis','hotsprings','geyser'):
            if mode=='waterfall':
                masonry(a,0,10,96,54,'stone',24,16);a.p([(32,6),(62,6),(62,22),(72,22),(72,39),(67,39),(67,64),(27,64),(27,39),(21,39),(21,23),(32,23)],'water');a.r(37,6,8,20,'light');a.r(48,10,5,17,'blue');a.r(25,27,40,3,'mint');a.r(33,42,25,5,'light');a.r(45,46,8,18,'blue')
            elif mode=='delta':a.r(0,0,96,64,'leaf');a.p([(35,0),(52,0),(52,24),(65,34),(89,39),(96,53),(59,44),(48,35),(35,49),(31,64),(17,64),(23,42),(40,25)],'water');a.p([(45,31),(48,40),(55,64),(43,64),(39,40)],'blue');a.r(45,5,2,14,'mint')
            elif mode=='tidepools':
                a.r(0,0,96,64,'stone')
                for x,y,w,h in [(3,5,30,22),(41,2,47,27),(8,34,44,25),(58,37,33,21)]:ring(a,x,y,w,h,'steel','water');a.r(x+8,y+8,w-18,1,'blue');a.r(x+7,y+h-8,3,3,'red')
            elif mode=='lagoon':
                a.r(0,0,96,64,'water');a.p([(0,0),(31,0),(20,12),(9,18),(0,36)],'gold');a.p([(96,64),(51,64),(63,54),(80,49),(96,35)],'tan')
                for x,y in [(19,26),(44,7),(69,25),(34,47)]:ring(a,x,y,17,12,'mint','water');a.r(x+3,y+4,4,3,'red');a.r(x+10,y+6,3,2,'gold')
            elif mode=='seacliffs':a.r(0,26,96,38,'water');a.p([(0,15),(23,21),(47,13),(64,26),(58,42),(27,47),(0,40)],'stone');a.p([(0,11),(23,17),(47,9),(63,22),(54,30),(27,34),(0,28)],'green');a.r(23,35,4,11,'shade');a.r(39,28,3,17,'steel');a.r(55,52,30,1,'blue')
            elif mode=='wreck':a.r(0,27,96,37,'water');a.p([(0,43),(32,34),(68,51),(79,64),(0,64)],'tan');a.p([(15,41),(25,24),(38,33),(47,31),(62,50),(51,56),(25,52)],'bark');a.line(28,30,47,50,'tan',3);a.r(43,16,3,37,'wood');a.p([(46,17),(66,32),(47,37)],'light');a.r(7,54,18,3,'wood')
            elif mode=='oasis':
                a.r(0,28,96,36,'tan');a.p([(0,43),(19,33),(42,36),(69,26),(96,41),(96,46),(68,35),(42,42),(18,39),(0,49)],'gold');ring(a,28,36,47,23,'leaf','water');a.r(41,43,22,1,'blue');a.r(22,24,4,25,'wood');a.p([(24,23),(9,18),(5,25),(21,22),(27,14),(36,19),(44,25),(27,23)],'green')
            elif mode=='hotsprings':
                a.r(0,26,96,38,'stone')
                for x,y,w,h in [(8,26,42,16),(34,38,56,18),(4,53,55,13)]:ring(a,x,y,w,h,'light','water');a.r(x+7,y+6,w-16,1,'mint')
                for x,y in [(19,11),(45,18),(71,22)]:a.r(x,y,2,11,'steel');a.r(x+3,y-4,3,10,'light')
            else:a.r(0,34,96,30,'stone');ring(a,20,40,57,20,'light','water');a.p([(40,45),(38,29),(45,14),(48,3),(53,15),(58,29),(56,45)],'blue');a.p([(45,44),(44,29),(49,8),(52,26),(51,44)],'light');a.r(28,35,3,5,'mint');a.r(66,31,3,6,'blue')
        elif mode in ('saltcanyon','desertarch','mesa','glacier','snowpass','tundra'):
            cold=mode in ('glacier','snowpass','tundra');base='steel' if cold else 'tan';a.r(0,30,96,34,base)
            if mode=='saltcanyon':
                for x,w in [(0,30),(66,30)]:a.p([(x,0),(x+w,0),(x+w-4,17),(x+w+2,38),(x+w-7,64),(x,64)],'steel');a.r(x,16,w-4,4,'white');a.r(x,37,w-2,3,'light')
                a.p([(35,64),(40,39),(48,27),(57,64)],'white')
            elif mode=='desertarch':a.p([(12,57),(19,26),(34,14),(59,14),(79,27),(86,57),(72,57),(67,33),(57,25),(37,25),(28,34),(25,57)],'wood');a.r(34,17,25,3,'gold');a.line(19,43,24,29,'tan',3);a.p([(0,61),(25,51),(56,61),(84,53),(96,61),(96,64),(0,64)],'gold')
            elif mode=='mesa':a.p([(12,50),(23,12),(65,12),(78,50)],'wood');a.r(25,12,39,4,'gold');a.p([(13,42),(73,42),(76,48),(11,48)],'red');a.p([(0,64),(0,49),(29,46),(53,55),(96,49),(96,64)],'tan')
            elif mode=='glacier':a.p([(0,28),(19,3),(35,28),(49,11),(68,29),(89,5),(96,28),(96,64),(0,64)],'shade');a.p([(19,5),(30,24),(13,22)],'light');a.p([(39,31),(61,28),(73,64),(20,64)],'blue');a.p([(48,33),(53,34),(57,64),(40,64)],'light');a.line(30,56,45,42,'steel',2)
            elif mode=='snowpass':a.p([(0,9),(24,24),(35,49),(18,64),(0,64)],'stone');a.p([(96,0),(68,19),(58,38),(75,64),(96,64)],'shade');a.p([(0,7),(16,16),(24,24),(16,21),(8,24),(0,21)],'white');a.p([(68,19),(85,4),(96,0),(96,11),(79,24)],'light');a.p([(24,64),(46,34),(57,31),(50,64)],'white')
            else:
                a.r(0,29,96,35,'steel');a.p([(0,49),(25,37),(51,49),(96,36),(96,64),(0,64)],'stone')
                for x,y in [(5,36),(22,51),(47,36),(69,51),(82,32)]:leaves(a,x,y,13,7,'tan');a.r(x+5,y+5,1,8,'bark')
                a.r(40,57,32,1,'light')
        else:
            a.r(0,30,96,34,'leaf')
            if mode=='burned':
                a.r(0,35,96,29,'shade')
                for x,h in [(6,40),(28,48),(53,34),(77,47)]:a.r(x,60-h,4,h,'bark');a.line(x,37,x-6,28,'ink',2);a.line(x,29,x+10,21,'ink',2);a.r(x-1,54,7,2,'red')
            elif mode=='fallenbridge':
                a.r(0,35,96,29,'water');a.r(4,25,27,9,'stone');a.r(65,25,27,9,'stone');a.r(14,34,10,23,'shade');a.r(74,34,10,23,'shade');a.p([(27,35),(38,43),(42,57),(33,60),(24,51)],'stone');a.p([(64,35),(55,44),(58,53),(69,48)],'steel');a.r(39,60,27,1,'blue')
            elif mode=='sunken':
                a.r(0,33,96,31,'water');masonry(a,8,27,24,20,'stone',12,8);masonry(a,63,39,28,18,'stone',14,8);a.r(43,20,9,34,'steel');a.r(39,17,17,5,'light');a.r(35,51,25,2,'blue');a.r(11,41,15,1,'mint');a.p([(68,38),(74,19),(82,23),(85,41)],'shade')
            else:
                a.p([(0,64),(17,37),(45,26),(79,37),(96,64)],'green')
                for x,y,h in [(19,40,14),(33,31,18),(51,31,16),(68,39,18),(54,48,12),(31,49,12)]:a.p([(x,y+h),(x-1,y+3),(x+3,y),(x+9,y+2),(x+10,y+h)],'stone');a.r(x+2,y+4,2,h-5,'steel')
        return a

    for slug,label,mode in landscapes:add('landscape-'+slug,label,'background',landscape(mode),['фон','ландшафт','локация',mode])

    objects=[
        ('cedar','Кедр с ярусными ветвями','cedar','tree'),('cypress','Узкий кипарис','cypress','tree'),
        ('palm','Пальма с кокосами','palm','tree'),('acacia','Зонтичная акация','acacia','tree'),
        ('maple','Клён с зубчатой кроной','maple','tree'),('hazel','Лещина с несколькими стволами','hazel','tree'),
        ('juniper','Стелющийся можжевельник','juniper','tree'),('elder','Бузина с кистями цветов','elder','tree'),
        ('rose-bush','Розовый куст','rose','tree'),('agave','Розетка агавы','agave','rock'),
        ('aloe','Алоэ с цветоносом','aloe','rock'),('banana','Банановые листья','banana','tree'),
        ('coffee','Кофейный куст','coffee','tree'),('pumpkin-patch','Тыквенная плеть','pumpkin','rock'),
        ('cabbages','Грядка кочанов капусты','cabbages','rock'),('cotton','Куст хлопчатника','cotton','tree'),
        ('hops','Хмель на шпалере','hops','tree'),('coral-fan','Веерный коралл','coralfan','rock'),
        ('basalt-column','Базальтовая колонна','basaltcolumn','rock'),('sandstone-stack','Слоистый каменный столб','sandstack','rock'),
        ('balancing-rock','Камень на узкой опоре','balance','rock'),('stone-arch-natural','Природная каменная арка','naturalarch','rock'),
        ('coral-rock','Пористый коралловый камень','coralrock','rock'),('pumice-boulder','Валун пемзы','pumice','rock'),
        ('sulfur-rock','Камень с серными наростами','sulfur','rock'),('quartz-vein','Плита с кварцевой жилой','quartz','rock'),
        ('amber-root','Янтарные включения в корне','amber','rock'),('magnetite','Гранёный магнитный минерал','magnetite','rock'),
        ('driftwood','Выбеленная коряга','driftwood','rock'),('frozen-root','Обледенелый корень','frozenroot','rock'),
        ('shell-mound','Насыпь крупных раковин','shellmound','rock'),('sand-burrow','Нора в песчаной насыпи','burrow','rock'),
        ('termite-mound','Высокий термитник','termites','rock'),
        ('potters-wheel','Гончарный круг','potter','platform'),('kiln','Керамическая печь','kiln','platform'),
        ('grindstone','Точильный круг','grindstone','platform'),('sawhorse','Козлы с досками','sawhorse','platform'),
        ('carpenter-clamp','Столярный стол с тисками','clampbench','platform'),('tanning-frame','Рама для выделки кожи','tanning','platform'),
        ('dye-vat','Чан красильщика','dyevat','water'),('cheese-press','Пресс для сыра','cheesepress','platform'),
        ('oil-press','Давильный пресс','oilpress','platform'),('grain-mill','Ручная жерновая мельница','grainmill','platform'),
        ('brewing-vat','Варочный котёл на подставке','brewvat','water'),('still','Перегонный куб','still','platform'),
        ('fish-rack','Стойка для сушки рыбы','fishrack','platform'),('herb-rack','Сушилка лекарственных трав','herbrack','platform'),
        ('smokehouse','Небольшая коптильня','smokehouse','platform'),('bread-oven','Хлебная печь','breadoven','platform'),
        ('beehive','Плетёный улей','beehive','crate'),('chicken-coop','Курятник на ножках','coop','crate'),
        ('feed-trough','Кормушка с сеном','trough','crate'),('hay-bale','Тюк сена в перевязи','haybale','crate'),
        ('wine-rack','Стойка винных бутылей','winerack','crate'),('bolt-rack','Стеллаж с рулонами ткани','boltrack','crate'),
        ('coal-bin','Ящик с углём','coalbin','crate'),('sandbags','Укрытие из мешков песка','sandbags','wall'),
        ('public-pump','Уличная водяная помпа','pump','water'),('drinking-basin','Питьевая чаша на стене','basin','water'),
        ('wash-line','Бельё на верёвке','washline','wall'),('market-scale','Торговые весы на стойке','scale','platform'),
        ('fruit-stall','Прилавок с фруктами','fruitstall','crate'),('fish-stall','Рыбный прилавок','fishstall','crate'),
        ('flower-planter','Деревянная кадка с цветами','planter','crate'),('hitching-post','Столб для привязи','hitch','wall'),
        ('mile-marker','Каменный верстовой столб','mile','rock'),('road-barrier','Откидной дорожный шлагбаум','barrier','door'),
        ('bollard','Причальная тумба','bollard','rock'),('anchor','Большой корабельный якорь','anchor','rock'),
        ('lifebuoy','Спасательный круг на стойке','lifebuoy','wall'),('fishing-net','Рыболовная сеть на раме','net','wall'),
        ('street-clock','Уличные часы','clock','wall'),('sundial','Каменные солнечные часы','sundial','rock'),
        ('gargoyle','Водосток с каменной головой','gargoyle','wall'),('birdhouse','Скворечник на шесте','birdhouse','tree'),
        ('nest','Гнездо с яйцами','nest','rock'),('carriage','Крытая повозка','carriage','crate'),
        ('windmill-frame','Ветряное колесо на раме','windwheel','platform'),('crane','Поворотный подъёмный кран','crane','platform'),
        ('pulley-rig','Полиспаст с грузом','pulley','platform'),('winch','Барабанная лебёдка','winch','platform'),
        ('gear-pair','Пара сцепленных шестерён','gears','platform'),('water-screw','Наклонный водоподъёмный винт','screw','water'),
        ('sluice-gate','Затвор с подъёмным винтом','sluice','door'),('bellows','Кузнечные мехи на раме','bellows','platform'),
        ('mine-cart','Вагонетка с рудой','minecart','crate'),('rail-switch','Стрелка рельсового пути','rails','platform'),
        ('drawbridge-machine','Механизм подъёмного моста','drawmachine','platform'),('trap-grate','Решётка над ямой','pitgrate','platform'),
        ('rotating-platform','Круглая поворотная платформа','turntable','platform'),('signal-lantern','Сигнальный фонарь с заслонками','signal','lamp'),
    ]

    def obj(mode):
        a=Art();a.shadow()
        if mode in ('cedar','cypress','palm','acacia','maple','hazel','juniper','elder','rose','agave','aloe','banana','coffee','pumpkin','cabbages','cotton','hops','coralfan'):
            if mode=='cedar':
                a.r(29,9,5,48,'bark');a.r(30,15,2,40,'tan')
                for y,w in [(7,21),(20,39),(34,52)]:a.p([(32,y),(32+w//2,y+8),(32+w//2-2,y+13),(32-w//2,y+13),(32-w//2,y+8)],'leaf');a.r(32-w//2+4,y+8,w-9,2,'green')
            elif mode=='cypress':a.r(29,41,6,16,'wood');a.p([(32,3),(39,17),(41,31),(46,44),(40,52),(23,52),(19,44),(23,29),(25,16)],'ink');a.p([(32,7),(35,20),(36,35),(40,47),(31,49),(24,45),(27,30)],'leaf');a.r(29,21,2,22,'green')
            elif mode=='palm':a.p([(25,58),(28,31),(33,16),(38,17),(33,35),(33,58)],'wood');a.line(30,36,31,56,'tan',2);a.p([(35,18),(12,7),(5,16),(18,12),(32,21)],'leaf');a.p([(35,18),(46,5),(60,13),(49,10),(38,23)],'green');a.p([(34,17),(24,3),(19,10),(31,20)],'mint');a.p([(36,20),(57,25),(59,37),(52,30),(38,25)],'leaf');a.r(30,19,5,5,'tan');a.r(36,22,4,5,'bark')
            elif mode=='acacia':a.p([(27,56),(29,33),(18,19),(21,17),(33,28),(44,17),(48,19),(36,34),(35,56)],'wood');leaves(a,3,11,58,15);a.r(9,15,45,2,'green')
            elif mode=='maple':a.r(28,32,7,25,'bark');a.p([(5,25),(13,22),(9,13),(20,17),(24,5),(32,12),(40,3),(45,16),(57,13),(53,25),(60,30),(48,35),(40,45),(29,40),(17,44),(13,34),(4,34)],'ink');a.p([(9,27),(17,24),(14,19),(24,21),(27,11),(33,17),(39,10),(42,22),(51,18),(48,28),(54,31),(44,32),(37,40),(29,35),(20,39),(17,30)],'red');a.r(24,22,13,3,'fire');a.r(34,31,9,2,'gold')
            elif mode=='hazel':
                for x,t in [(24,18),(31,10),(38,23)]:a.line(31,56,x,t,'wood',3)
                leaves(a,4,18,27,22);leaves(a,20,5,29,25);leaves(a,35,24,25,20);a.r(24,22,3,4,'tan');a.r(40,35,3,4,'tan')
            elif mode=='juniper':a.p([(6,52),(15,42),(13,32),(24,35),(32,28),(38,40),(51,35),(59,49),(50,56),(13,56)],'ink');a.p([(10,51),(18,45),(18,37),(25,40),(31,34),(37,46),(49,41),(54,50),(48,52),(15,53)],'leaf');a.r(21,44,11,2,'mint');a.r(41,48,3,3,'blue');a.r(16,48,3,3,'purple')
            elif mode in ('elder','rose','coffee','cotton'):
                a.r(29,29,4,27,'wood');leaves(a,9,18,43,31)
                if mode=='elder':
                    for x,y in [(15,27),(32,23),(37,38)]:a.r(x,y,9,3,'light');a.r(x+2,y-2,5,2,'white')
                elif mode=='rose':
                    for x,y in [(15,24),(34,29),(24,39)]:ring(a,x,y,9,8,'red','skin');a.r(x+4,y+3,2,2,'bark')
                    a.p([(29,50),(23,47),(29,47)],'tan')
                elif mode=='coffee':
                    for x,y in [(16,28),(34,25),(37,38),(24,40)]:a.r(x,y,3,4,'red');a.r(x+3,y+2,3,4,'fire')
                else:
                    for x,y in [(14,24),(33,24),(22,39),(39,39)]:a.p([(x,y+2),(x+3,y),(x+8,y+1),(x+9,y+6),(x+6,y+9),(x+1,y+7)],'white');a.r(x+2,y+6,4,2,'tan')
            elif mode in ('agave','aloe'):
                for pts in [[(31,54),(6,22),(19,29)],[(31,54),(22,9),(29,24)],[(32,54),(39,7),(38,26)],[(32,54),(58,24),(47,40)],[(31,54),(11,43),(22,44)]]:a.p(pts,'leaf');a.line(pts[0][0],pts[0][1],pts[1][0],pts[1][1],'mint',1)
                if mode=='aloe':a.r(31,12,2,38,'wood');a.r(28,7,8,5,'fire');a.r(31,1,4,5,'red')
            elif mode=='banana':a.r(29,15,6,42,'green');a.p([(31,25),(8,9),(4,14),(18,29),(30,29)],'leaf');a.p([(34,16),(47,4),(60,9),(42,24)],'green');a.p([(35,32),(58,24),(61,35),(42,40)],'leaf');a.p([(30,38),(6,33),(9,44),(29,46)],'green');a.r(34,24,4,12,'gold');a.r(38,29,4,10,'gold');a.r(36,26,1,7,'light')
            elif mode=='pumpkin':a.p([(5,47),(14,42),(23,46),(34,37),(45,40),(57,49),(54,52),(44,44),(34,42),(23,50),(14,47),(7,51)],'green');ring(a,12,34,22,20,'fire','red');a.r(20,32,4,5,'wood');a.r(22,38,3,13,'gold');ring(a,39,42,17,15,'gold','fire');a.r(46,39,3,5,'green');leaves(a,33,28,15,10)
            elif mode=='cabbages':
                a.r(6,49,52,7,'wood')
                for x,y in [(6,30),(27,24),(40,39)]:ring(a,x,y,19,17,'leaf','mint');a.p([(x+3,y+6),(x+11,y+3),(x+15,y+8),(x+9,y+13)],'green');a.r(x+6,y+5,2,7,'light')
            elif mode=='hops':a.r(9,7,4,50,'wood');a.r(50,7,4,50,'wood');a.r(9,9,45,3,'tan');a.r(18,12,1,42,'tan');a.r(43,12,1,42,'tan');a.p([(16,54),(22,37),(15,25),(21,12),(24,12),(19,25),(26,37),(21,54)],'green');leaves(a,19,17,16,11);leaves(a,30,35,17,12);a.gem(27,27,8,'gold');a.gem(37,48,7,'leaf')
            else:
                for i in range(7):x=8+i*7;yt=12+abs(i-3)*5;a.line(31,56,x,yt,'red',3);a.line(x,yt+12,x-4,yt+3,'skin',2);a.line(x,yt+12,x+4,yt,'skin',2)
                a.r(22,54,19,4,'stone')
        elif mode in ('basaltcolumn','sandstack','balance','naturalarch','coralrock','pumice','sulfur','quartz','amber','magnetite','driftwood','frozenroot','shellmound','burrow','termites'):
            if mode=='basaltcolumn':
                for x,y,w in [(8,25,15),(23,9,18),(41,28,14)]:a.p([(x,y+4),(x+w//2,y),(x+w,y+4),(x+w,54),(x+w//2,59),(x,54)],'shade');a.p([(x,y+4),(x+w//2,y),(x+w,y+4),(x+w//2,y+8)],'steel');a.r(x+3,y+8,3,45-y,'stone')
            elif mode=='sandstack':
                for y,x,w in [(11,23,22),(22,18,32),(34,21,28),(46,13,42)]:a.p([(x,y),(x+w,y),(x+w-4,y+11),(x+3,y+11)],'wood');a.r(x+2,y+2,w-5,3,'tan');a.r(x+5,y+8,w-10,2,'gold')
            elif mode=='balance':a.p([(23,56),(26,32),(37,30),(40,56)],'stone');a.p([(8,24),(20,11),(42,9),(57,24),(46,36),(22,36)],'ink');a.p([(12,24),(23,15),(41,13),(52,24),(44,31),(24,32)],'steel');a.r(28,37,3,17,'light')
            elif mode=='naturalarch':a.p([(5,56),(7,24),(17,10),(37,6),(53,17),(60,56),(45,56),(43,30),(36,21),(24,22),(19,31),(18,56)],'stone');a.p([(10,25),(19,14),(34,10),(44,15),(35,17),(22,18),(15,27)],'steel');a.r(7,45,9,3,'shade');a.r(47,39,9,3,'shade')
            elif mode=='pumice':
                a.p([(8,48),(12,26),(26,10),(43,17),(53,35),(50,52),(34,59),(14,55)],'ink')
                a.p([(12,46),(16,28),(27,15),(40,21),(48,36),(46,49),(34,54),(18,51)],'stone')
                a.p([(16,28),(27,15),(39,20),(32,31),(14,37)],'steel')
                for x,y,w,h in [(18,29,6,5),(29,23,5,7),(37,35,8,6),(23,42,5,4),(32,47,6,4)]:
                    ring(a,x,y,w,h,'shade','ink')
                a.r(20,22,3,2,'light');a.r(41,43,2,3,'steel')
            elif mode in ('coralrock','sulfur','quartz'):
                a.p([(8,53),(5,34),(16,19),(38,14),(54,29),(58,47),(46,58),(20,57)],'ink');a.p([(11,50),(9,35),(19,22),(37,18),(50,31),(54,46),(45,54),(21,53)],'stone');a.p([(19,22),(37,18),(34,33),(10,35)],'steel')
                if mode=='coralrock':
                    for x,y,w in [(14,30,8),(29,25,10),(39,37,9),(24,45,7)]:ring(a,x,y,w,w,'light','shade');a.r(x+2,y+1,3,1,'tan')
                elif mode=='sulfur':
                    for x,y,w in [(15,29,12),(31,22,13),(39,39,10)]:a.p([(x,y+4),(x+4,y),(x+w,y+2),(x+w-1,y+9),(x+3,y+10)],'gold');a.r(x+4,y+2,5,2,'white')
                else:a.p([(16,24),(24,25),(31,34),(42,36),(47,47),(42,50),(37,41),(26,40),(20,32),(13,29)],'light');a.line(22,27,28,36,'white',2);a.gem(29,35,11,'white')
            elif mode=='amber':a.p([(8,53),(16,37),(11,19),(17,13),(25,33),(38,31),(47,17),(53,21),(45,42),(57,53)],'bark');a.line(20,37,25,51,'tan',3);a.gem(22,30,12,'gold');a.gem(38,42,11,'fire')
            elif mode=='magnetite':a.p([(11,45),(14,24),(32,8),(51,24),(55,44),(33,57)],'ink');a.p([(32,11),(48,26),(32,36),(17,26)],'steel');a.p([(17,28),(31,38),(31,52),(14,43)],'shade');a.p([(34,38),(49,28),(52,43),(34,52)],'stone');a.r(30,14,2,18,'light')
            elif mode in ('driftwood','frozenroot'):
                a.p([(5,53),(18,39),(21,12),(28,9),(27,33),(39,27),(51,11),(55,16),(43,35),(42,43),(59,47),(58,54),(39,50),(25,44),(13,57)],'tan' if mode=='driftwood' else 'wood');a.line(25,16,23,37,'light',2);a.line(25,39,47,29,'steel' if mode=='frozenroot' else 'wood',2)
                if mode=='frozenroot':a.p([(21,17),(30,14),(28,26),(20,29)],'blue');a.p([(41,29),(49,24),(50,37),(42,40)],'blue');a.r(45,39,2,10,'light')
            elif mode=='shellmound':
                for x,y,s in [(6,40,18),(20,27,23),(39,36,18)]:a.p([(x,y+s),(x,y+8),(x+8,y),(x+s-3,y+3),(x+s,y+11),(x+s-5,y+s)],'light');a.line(x+3,y+13,x+9,y+4,'tan',1);a.line(x+6,y+17,x+s-5,y+5,'stone',1)
            elif mode=='burrow':a.p([(6,55),(10,35),(22,24),(40,24),(54,37),(60,55)],'tan');a.p([(20,55),(20,39),(26,32),(38,32),(45,40),(45,55)],'ink');a.r(14,35,7,2,'gold');a.r(42,30,5,2,'wood');a.r(23,56,19,2,'bark')
            else:a.p([(8,57),(12,37),(18,32),(22,12),(29,5),(37,10),(42,28),(49,36),(57,57)],'wood');a.p([(16,52),(24,17),(29,10),(30,45),(38,52)],'tan');a.r(27,20,4,8,'bark');a.r(42,40,5,10,'bark');a.r(19,45,3,6,'bark')
        elif mode in ('potter','kiln','grindstone','sawhorse','clampbench','tanning','dyevat','cheesepress','oilpress','grainmill','brewvat','still','fishrack','herbrack','smokehouse','breadoven','beehive','coop','trough','haybale','winerack','boltrack','coalbin','sandbags'):
            if mode=='potter':a.r(28,29,6,26,'wood');a.r(20,52,24,4,'wood');ring(a,10,25,44,12,'tan','wood');a.p([(23,26),(25,14),(29,10),(35,10),(39,15),(40,26)],'tan');a.r(27,12,9,3,'bark');a.r(28,18,2,7,'gold')
            elif mode in ('kiln','breadoven','smokehouse'):
                a.p([(10,55),(10,24),(20,12),(43,12),(54,24),(54,55)],'stone' if mode!='smokehouse' else 'wood');a.r(23,7,18,6,'shade');a.r(28,3,9,6,'stone')
                if mode=='kiln':a.r(20,23,24,22,'ink');a.r(20,26,24,3,'steel');a.r(24,32,6,7,'tan');a.r(34,32,6,7,'red');a.r(19,48,26,5,'red')
                elif mode=='breadoven':a.p([(17,48),(17,32),(23,25),(41,25),(47,32),(47,48)],'ink');a.r(19,44,25,4,'fire');a.r(25,37,15,6,'gold');a.r(12,49,40,4,'steel')
                else:a.r(18,20,27,32,'bark');a.r(21,24,21,3,'tan');a.r(21,43,21,3,'tan');a.r(36,33,3,7,'gold');a.r(15,55,5,4,'wood');a.r(45,55,5,4,'wood')
            elif mode=='grindstone':ring(a,14,13,36,34,'stone','steel');ring(a,25,24,14,12,'shade','dark');a.r(29,27,7,6,'gold');a.r(10,30,48,4,'wood');a.r(16,36,4,20,'wood');a.r(44,36,4,20,'wood');a.r(6,23,7,7,'tan');a.r(4,20,3,12,'wood')
            elif mode=='sawhorse':
                for x in (13,42):a.line(x,27,x-6,56,'wood',4);a.line(x,27,x+8,56,'tan',4)
                a.r(8,27,49,5,'wood');a.p([(4,19),(50,12),(59,18),(13,25)],'tan');a.line(13,20,54,15,'gold',1)
            elif mode=='clampbench':a.box(7,31,50,10,'wood');a.r(12,41,5,16,'wood');a.r(48,41,5,16,'wood');a.box(5,20,16,15,'steel');a.r(8,16,3,18,'stone');a.r(18,16,3,18,'stone');a.r(3,26,24,3,'gold');a.r(4,22,2,10,'wood');a.r(32,27,20,4,'tan')
            elif mode=='tanning':a.r(8,7,4,50,'wood');a.r(51,7,4,50,'wood');a.r(8,9,47,4,'wood');a.r(8,53,47,4,'wood');a.p([(20,16),(28,13),(37,16),(44,16),(40,24),(45,37),(38,48),(26,44),(18,49),(20,35),(16,26)],'tan');a.r(25,22,3,16,'gold')
            elif mode in ('dyevat','brewvat'):
                a.p([(10,26),(54,26),(50,51),(43,57),(20,57),(14,51)],'steel' if mode=='brewvat' else 'wood');ring(a,10,18,44,17,'light' if mode=='brewvat' else 'tan','purple' if mode=='dyevat' else 'gold');a.r(13,40,38,4,'stone');a.r(20,53,4,5,'wood');a.r(42,53,4,5,'wood');a.line(33,29,48,6,'tan',3)
                if mode=='dyevat':a.p([(23,24),(33,24),(36,39),(31,47),(24,42)],'violet');a.r(27,27,2,11,'light')
                else:a.r(15,9,2,7,'steel');a.r(23,3,2,10,'light');a.r(54,31,5,5,'gold')
            elif mode in ('cheesepress','oilpress'):
                a.r(10,7,5,50,'wood');a.r(49,7,5,50,'wood');a.r(10,8,44,5,'tan');a.r(29,3,5,30,'steel');a.r(21,5,21,3,'wood');a.r(18,32,28,6,'tan');a.r(12,53,40,4,'tan')
                if mode=='cheesepress':a.box(17,39,30,14,'wood');a.r(22,40,20,10,'gold');a.r(24,41,16,2,'light');a.r(27,46,2,2,'wood')
                else:
                    a.p([(18,38),(45,38),(43,51),(38,56),(25,56),(20,51)],'bark')
                    for x in (23,29,35,41):a.r(x,39,2,13,'tan')
                    a.r(19,41,26,2,'steel');a.r(22,50,21,2,'steel');a.r(41,50,11,3,'gold')
                    ring(a,45,54,15,6,'steel','gold');a.r(53,51,2,4,'gold')
            elif mode=='grainmill':a.box(17,37,30,20,'wood');ring(a,10,26,44,17,'stone','steel');ring(a,15,15,34,17,'steel','stone');a.r(29,17,6,14,'wood');a.r(32,17,18,3,'tan');a.r(47,11,3,10,'wood');a.r(23,40,18,9,'bark');a.r(33,48,8,6,'gold')
            elif mode=='still':a.p([(8,50),(8,26),(16,18),(30,18),(38,26),(38,50)],'gold');a.r(12,28,3,17,'light');a.r(18,11,12,7,'fire');a.r(23,4,4,9,'gold');a.r(27,5,24,4,'gold');a.r(48,8,4,17,'gold');a.box(41,25,16,30,'wood');a.r(45,29,9,19,'water');a.r(38,44,8,4,'gold');a.r(14,51,4,7,'stone');a.r(31,51,4,7,'stone')
            elif mode in ('fishrack','herbrack'):
                a.r(9,7,4,50,'wood');a.r(51,7,4,50,'wood');a.r(8,11,48,4,'tan');a.r(8,36,48,3,'wood')
                for x,y in [(17,17),(30,17),(43,17),(23,41),(38,41)]:
                    a.r(x,y-2,1,5,'tan')
                    if mode=='fishrack':a.p([(x-4,y+4),(x,y),(x+5,y+4),(x+2,y+15),(x-2,y+15)],'steel');a.r(x,y+3,1,9,'light');a.p([(x-3,y+14),(x+3,y+14),(x,y+19)],'stone')
                    else:
                        a.r(x,y+1,1,16,'mint')
                        for dy in (4,9,14):
                            a.p([(x,y+dy),(x-5,y+dy-2),(x-4,y+dy+3),(x,y+dy+2)],'leaf')
                            a.p([(x+1,y+dy+1),(x+6,y+dy-1),(x+5,y+dy+4),(x+1,y+dy+3)],'green')
                        a.r(x-2,y+1,5,2,'tan')
            elif mode=='beehive':a.r(13,49,38,6,'wood');a.p([(15,47),(17,29),(24,18),(39,18),(46,29),(49,47)],'tan')
            elif mode=='coop':a.box(11,25,42,24,'wood');a.p([(6,25),(30,9),(35,9),(59,25)],'tan');a.r(17,31,13,15,'ink');a.r(39,31,8,10,'light');a.r(15,49,4,8,'wood');a.r(45,49,4,8,'wood');a.line(21,46,39,57,'tan',4)
            elif mode=='trough':a.p([(7,30),(56,30),(52,49),(11,49)],'wood');a.r(10,30,43,4,'tan');a.p([(10,29),(13,22),(21,26),(27,19),(34,24),(43,18),(52,27),(54,30)],'gold');a.r(15,49,4,8,'wood');a.r(44,49,4,8,'wood')
            elif mode=='haybale':a.box(9,22,46,32,'gold');a.r(11,26,41,1,'tan');a.r(13,33,39,1,'tan');a.r(11,41,41,1,'tan');a.r(14,49,38,1,'tan');a.r(18,22,4,32,'bark');a.r(42,22,4,32,'bark');a.r(29,22,2,32,'light')
            elif mode in ('winerack','boltrack'):
                a.box(8,12,48,44,'wood');a.r(12,16,40,36,'dark')
                for y in (28,40,52):
                    a.r(10,y,44,3,'tan')
                    for x in (16,30,43):
                        if mode=='winerack':ring(a,x,y-10,9,9,'leaf','green');a.r(x+3,y-8,3,4,'gold')
                        else:a.r(x-2,y-10,12,9,['purple','red','gold'][x//14%3]);a.r(x-1,y-9,10,2,'light');a.r(x+7,y-7,2,4,'bark')
            elif mode=='coalbin':a.box(8,29,48,27,'wood');a.r(12,34,39,16,'dark')
            else:
                for x,y in [(7,43),(28,43),(43,43),(15,30),(35,30),(26,18)]:a.p([(x,y+3),(x+5,y),(x+17,y),(x+21,y+4),(x+18,y+12),(x+3,y+12)],'tan');a.r(x+4,y+3,13,2,'gold');a.r(x+4,y+10,12,1,'bark')
            if mode=='beehive':
                for y,w in [(23,20),(30,28),(37,31),(44,34)]:a.r(32-w//2,y,w,2,'wood')
                a.r(28,40,8,5,'ink');a.r(12,55,4,4,'wood');a.r(48,55,4,4,'wood')
            elif mode=='tanning':
                for x,y in [(12,19),(12,35),(12,48),(45,20),(42,40),(42,49)]:a.line(x,y,x+6,y+1,'light',1)
            elif mode=='coalbin':
                for x,y in [(12,37),(24,31),(37,34),(20,44),(39,44)]:a.p([(x,y+6),(x+2,y),(x+9,y-1),(x+11,y+5),(x+6,y+10)],'ink');a.r(x+3,y+1,5,2,'shade')
        elif mode in ('pump','basin','washline','scale','fruitstall','fishstall','planter','hitch','mile','barrier','bollard','anchor','lifebuoy','net','clock','sundial','gargoyle','birdhouse','nest','carriage'):
            if mode=='pump':a.r(24,18,10,33,'leaf');a.r(26,20,3,26,'mint');a.r(19,51,20,6,'stone');a.r(24,14,17,6,'steel');a.line(38,10,52,23,'wood',3);a.r(32,27,15,5,'stone');a.r(42,31,5,8,'steel');a.r(43,40,2,9,'blue')
            elif mode=='basin':a.box(18,7,28,41,'stone');a.gem(24,13,14,'steel');a.r(29,26,6,5,'gold');a.r(30,31,3,9,'blue');ring(a,8,36,48,17,'light','water');a.r(21,53,22,4,'stone')
            elif mode=='washline':a.r(7,9,4,48,'wood');a.r(53,9,4,48,'wood');a.p([(9,12),(32,18),(55,12),(55,14),(32,20),(9,14)],'tan');a.p([(14,16),(27,19),(28,40),(14,38)],'light');a.p([(34,19),(48,16),(48,33),(42,35),(40,44),(33,43)],'purple');a.r(15,16,2,5,'wood');a.r(44,17,2,5,'wood')
            elif mode=='scale':a.r(29,13,5,38,'gold');a.r(19,51,25,6,'wood');a.r(10,16,44,3,'gold');a.gem(27,6,10,'gold');a.line(13,20,7,36,'tan',1);a.line(13,20,20,36,'tan',1);a.line(50,20,43,36,'tan',1);a.line(50,20,57,36,'tan',1);a.p([(5,36),(22,36),(18,42),(9,42)],'steel');a.p([(41,36),(59,36),(55,42),(45,42)],'steel')
            elif mode in ('fruitstall','fishstall'):a.box(7,35,50,12,'wood');a.r(11,47,5,10,'wood');a.r(48,47,5,10,'wood');a.r(10,28,44,7,'tan')
            elif mode=='planter':a.box(11,37,42,19,'wood');a.r(15,41,34,2,'tan');a.r(16,47,32,2,'bark')
            elif mode=='hitch':a.r(14,8,7,49,'wood');a.r(12,7,11,6,'tan');ring(a,11,23,14,14,'steel','dark');a.p([(24,29),(31,36),(49,34),(52,42),(48,51),(37,53),(29,46),(30,38),(23,33)],'tan');a.r(46,51,9,2,'tan')
            elif mode=='mile':a.p([(20,57),(20,13),(28,6),(40,8),(45,15),(45,57)],'stone');a.r(24,16,16,26,'shade');a.r(26,20,11,2,'light');a.r(26,26,6,2,'light');a.r(31,31,7,2,'light');a.r(18,53,29,5,'steel')
            elif mode=='barrier':a.box(9,31,11,27,'stone');a.r(14,24,4,17,'steel');a.p([(9,26),(56,12),(59,19),(12,33)],'light')
            elif mode=='bollard':a.p([(16,54),(18,23),(25,18),(40,18),(46,23),(48,54)],'stone');a.r(12,23,40,7,'steel');a.r(14,23,35,2,'light');a.r(22,34,4,16,'steel');a.r(9,54,45,4,'shade')
            elif mode=='anchor':a.r(29,17,6,34,'steel');ring(a,22,5,20,17,'steel','dark');a.r(15,23,34,5,'steel');a.p([(5,34),(12,38),(13,46),(23,50),(29,47),(29,55),(20,57),(7,48)],'stone');a.p([(59,34),(52,38),(51,46),(41,50),(35,47),(35,55),(44,57),(57,48)],'steel');a.r(30,20,2,27,'light')
            elif mode=='lifebuoy':a.r(29,6,5,51,'wood');ring(a,11,15,43,38,'light','dark');a.r(26,15,13,6,'red');a.r(26,47,13,6,'red');a.r(11,28,6,13,'red');a.r(48,28,6,13,'red');a.r(21,55,22,3,'wood')
            elif mode=='net':a.r(8,6,4,51,'wood');a.r(53,6,4,51,'wood');a.r(8,9,49,4,'tan')
            elif mode=='clock':a.r(29,36,6,21,'steel');a.r(20,54,25,4,'stone');ring(a,12,7,40,36,'gold','light');a.r(31,13,2,15,'ink');a.r(31,26,11,2,'ink');a.r(29,25,5,5,'stone')
            elif mode=='sundial':a.box(19,41,27,16,'stone');ring(a,6,23,53,22,'steel','stone');a.p([(27,36),(34,10),(37,34)],'light');a.line(33,36,49,40,'shade',2)
            elif mode=='gargoyle':a.box(10,43,44,14,'stone');a.p([(11,33),(19,17),(36,12),(50,19),(53,37),(43,43),(23,39)],'stone');a.p([(12,31),(4,22),(4,40),(15,43)],'shade');a.p([(46,21),(59,13),(57,34),(49,41)],'shade');a.r(24,24,6,3,'ink');a.r(40,24,5,3,'ink');a.p([(27,31),(41,31),(47,41),(22,41)],'steel');a.r(29,37,9,4,'ink');a.r(32,43,3,12,'blue')
            elif mode=='birdhouse':a.r(29,28,5,29,'wood');a.box(17,16,29,27,'wood');a.p([(11,17),(31,4),(51,17)],'tan');ring(a,24,22,15,13,'bark','ink');a.r(25,38,12,3,'tan')
            elif mode=='nest':ring(a,9,27,46,28,'wood','bark')
            else:a.box(8,24,47,23,'wood');a.p([(10,24),(13,12),(22,7),(43,7),(53,17),(55,24)],'tan');a.r(16,14,11,17,'dark');a.r(37,14,11,17,'dark');a.r(9,41,46,3,'tan');ring(a,10,44,15,15,'ink','stone');ring(a,40,44,15,15,'ink','stone');a.r(29,8,3,32,'bark')
            if mode in ('fruitstall','fishstall'):
                for x,y in [(13,24),(26,24),(39,24)]:
                    if mode=='fruitstall':a.r(x,y,9,8,['red','gold','green'][x//13%3]);a.r(x+2,y+1,2,2,'light')
                    else:a.p([(x,y+3),(x+7,y),(x+13,y+4),(x+6,y+8)],'steel');a.r(x+7,y+2,2,2,'ink');a.p([(x,y+3),(x-3,y),(x-3,y+7)],'stone')
            elif mode=='planter':
                for x,y,c in [(17,20,'red'),(29,13,'gold'),(43,22,'violet')]:a.r(x,y+6,2,16,'green');a.p([(x,y+14),(x-6,y+10),(x-7,y+15)],'leaf');a.r(x-3,y,8,7,c);a.r(x,y+2,2,2,'light')
            elif mode=='barrier':
                for x,y in [(20,26),(32,22),(44,18)]:a.p([(x,y),(x+5,y-2),(x+6,y+5),(x+2,y+6)],'red')
            elif mode=='net':
                for i in range(-2,8):a.line(max(12,12+i*7),16,max(12,12+i*7)+20,51,'tan',1);a.line(12+i*7,51,32+i*7,16,'tan',1)
                a.r(12,50,41,3,'wood')
            elif mode=='clock':
                for x,y in [(31,11),(45,24),(31,37),(16,24)]:a.r(x,y,2,3,'wood')
            elif mode=='sundial':
                for x,y in [(13,30),(20,25),(43,25),(50,31),(41,39),(20,39)]:a.r(x,y,2,2,'light')
            elif mode=='nest':
                for x,y in [(18,31),(28,29),(37,33)]:a.p([(x,y+9),(x-1,y+4),(x+2,y),(x+6,y),(x+9,y+5),(x+7,y+11)],'light');a.r(x+2,y+2,2,3,'white')
                for x,y in [(11,38),(14,47),(38,48),(47,39)]:a.r(x,y,8,1,'tan')
        else:
            if mode=='windwheel':
                a.r(28,30,7,27,'wood');a.r(17,54,30,4,'wood');a.r(29,5,5,37,'steel');a.r(12,22,40,4,'steel')
                for pts in [[(34,22),(41,5),(52,8),(43,22)],[(34,27),(51,33),(48,44),(34,37)],[(29,27),(23,44),(12,42),(20,27)],[(29,22),(13,16),(16,6),(29,12)]]:a.p(pts,'tan');a.r(30,22,5,5,'gold')
            elif mode=='crane':a.r(16,14,7,43,'wood');a.r(8,54,33,4,'stone');a.p([(17,15),(49,6),(56,10),(23,23)],'wood');a.line(23,45,47,13,'tan',3);a.r(50,11,2,27,'gold');ring(a,47,34,9,11,'steel','dark');a.r(8,30,12,17,'shade')
            elif mode=='pulley':a.r(7,7,49,5,'wood');a.r(8,8,4,49,'wood');a.r(52,8,4,49,'wood');ring(a,25,13,14,14,'steel','dark');a.r(28,11,2,23,'tan');a.r(37,13,2,21,'tan');ring(a,25,32,16,16,'gold','dark');a.r(31,48,2,6,'steel');a.box(21,50,23,10,'stone')
            elif mode=='winch':a.r(10,28,5,29,'wood');a.r(49,28,5,29,'wood');a.r(14,29,36,18,'tan');a.r(19,29,3,18,'bark');a.r(28,29,3,18,'bark');a.r(37,29,3,18,'bark');a.r(9,35,47,4,'steel');a.r(52,20,4,19,'steel');a.r(51,19,11,3,'wood');a.line(31,44,44,57,'tan',3)
            elif mode=='gears':
                for x,y,s in [(5,15,29),(30,31,26)]:
                    ring(a,x,y,s,s,'steel','shade');ring(a,x+9,y+9,s-18,s-18,'gold','dark')
                    for i in range(8):xx=round(x+s/2+cos(i*pi/4)*(s/2));yy=round(y+s/2+sin(i*pi/4)*(s/2));a.r(xx-3,yy-3,6,6,'stone')
            elif mode=='screw':a.p([(7,50),(46,10),(57,20),(18,60)],'wood');a.line(12,52,50,15,'steel',4)
            elif mode=='sluice':a.r(9,10,6,47,'stone');a.r(49,10,6,47,'stone');a.r(12,9,40,6,'steel');a.r(29,4,5,31,'gold');a.r(21,5,22,3,'wood');a.box(17,31,30,23,'wood');a.r(19,37,26,3,'steel');a.r(19,46,26,3,'steel');a.r(4,56,57,3,'water')
            elif mode=='bellows':a.r(12,42,4,15,'wood');a.r(42,42,4,15,'wood');a.p([(8,29),(41,17),(48,23),(48,38),(41,44),(8,32)],'tan');a.p([(11,30),(39,23),(43,27),(43,34),(39,38),(11,32)],'bark');a.r(47,27,14,8,'steel');a.r(55,28,6,3,'light');a.line(18,30,35,46,'wood',3)
            elif mode=='minecart':a.p([(8,26),(57,26),(51,49),(14,49)],'steel');a.r(11,28,42,3,'light');a.r(19,33,25,10,'stone');ring(a,12,46,13,13,'ink','steel');ring(a,40,46,13,13,'ink','steel')
            elif mode=='rails':a.r(13,8,4,49,'steel');a.r(45,8,4,49,'steel');a.line(45,32,59,8,'steel',4);a.r(13,8,1,49,'light');a.r(46,8,1,25,'light');a.r(8,42,6,8,'gold');a.r(5,31,2,17,'steel')
            elif mode=='drawmachine':a.r(10,8,5,49,'wood');a.r(50,8,5,49,'wood');a.r(9,9,47,5,'tan');ring(a,18,16,29,29,'stone','shade');a.r(30,19,3,20,'steel');a.r(21,30,22,3,'steel');a.r(44,32,3,19,'tan');a.box(35,48,22,10,'stone');a.r(16,46,17,7,'wood')
            elif mode=='pitgrate':a.p([(5,24),(54,17),(60,50),(11,58)],'stone');a.p([(10,28),(50,22),(54,46),(14,53)],'ink')
            elif mode=='turntable':ring(a,5,23,54,32,'stone','steel');a.r(14,30,37,4,'dark');a.r(14,43,37,4,'dark');a.r(14,30,37,1,'light');a.r(14,43,37,1,'light');a.r(26,33,12,10,'wood')
            else:a.r(29,40,5,17,'steel');a.r(21,55,23,3,'stone');a.box(17,16,30,28,'gold');a.r(22,21,20,18,'mint');a.r(22,24,20,3,'stone');a.r(22,32,20,3,'stone');a.p([(17,20),(7,16),(7,42),(17,37)],'shade');a.p([(47,20),(57,16),(57,42),(47,37)],'stone');a.r(27,9,10,6,'steel')
            if mode=='screw':
                for x,y in [(13,48),(21,40),(29,32),(37,24),(45,16)]:a.p([(x-3,y-3),(x+5,y-5),(x+9,y+4),(x+3,y+8)],'gold');a.line(x-2,y-1,x+5,y+6,'light',1)
                a.r(2,56,24,3,'water');a.r(49,12,12,3,'water')
            elif mode=='minecart':
                for x,y in [(12,22),(23,17),(37,19),(45,25)]:a.p([(x,y+6),(x+3,y),(x+10,y+1),(x+12,y+8)],'shade');a.r(x+4,y+2,4,2,'steel')
            elif mode=='rails':
                for y in range(10,57,8):a.r(9,y,44,3,'wood');a.r(13,y,4,3,'steel');a.r(45,y,4,3,'steel')
            elif mode=='pitgrate':
                for x in (16,25,34,43):a.line(x,26,x+4,51,'steel',2)
                for y in (31,40,48):a.line(13,y,53,y-6,'steel',2)
        return a

    assert len(tiles)==40 and len(buildings)==40 and len(landscapes)==32 and len(objects)==91
    for slug,label,mode,kind in objects:
        tags=['окружение',mode]
        if mode in [entry[2] for entry in objects[:18]]:tags.extend(['растительность','природа'])
        elif mode in [entry[2] for entry in objects[18:33]]:tags.extend(['камень','природа'])
        elif mode in [entry[2] for entry in objects[33:57]]:tags.extend(['ремесло','интерьер'])
        elif mode in [entry[2] for entry in objects[57:77]]:tags.extend(['город','улица'])
        else:tags.extend(['механизм','строительство'])
        add('object-'+slug,label,'object',obj(mode),tags,kind)
