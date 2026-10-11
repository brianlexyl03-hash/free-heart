from PIL import Image, ImageDraw, ImageFont
import math, os, glob, random
W,H=1080,1350
SITE="free-heart.de.deplexo.com"
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,"posts"); os.makedirs(OUT,exist_ok=True)
def pick(names):
    for d in ["/system/fonts/","/usr/share/fonts/truetype/dejavu/"]:
        for n in names:
            if os.path.exists(d+n): return d+n
    g=sorted(glob.glob("/system/fonts/*.ttf")); return g[0]
HW=pick(["ComingSoon.ttf","DancingScript-Bold.ttf","DancingScript-Regular.ttf","NotoSerif-Italic.ttf","DejaVuSans-Oblique.ttf","DejaVuSans.ttf"])
HWB=pick(["DancingScript-Bold.ttf","ComingSoon.ttf","NotoSerif-BoldItalic.ttf","DejaVuSans-BoldOblique.ttf","DejaVuSans-Bold.ttf"])
def F(p,s): return ImageFont.truetype(p,s)
def hw(im,text,x,y,font,fill,seed=1):
    rng=random.Random(seed); s=font.size
    for ch in text:
        adv=font.getlength(ch)
        if ch!=" ":
            w,h=int(s*1.8),int(s*2)
            layer=Image.new("RGBA",(w,h),(0,0,0,0))
            ImageDraw.Draw(layer).text((s*0.4,s*0.3),ch,font=font,fill=tuple(fill)+(255,))
            layer=layer.rotate(rng.uniform(-4,4),resample=Image.BICUBIC,center=(w/2,h/2))
            im.paste(layer,(int(x-s*0.4),int(y-s*0.3+rng.uniform(-3,3))),layer)
        x+=adv+rng.uniform(-1,1.2)
def wrap(text,font,maxw):
    out,line=[],""
    for w in text.split():
        t=(line+" "+w).strip()
        if font.getlength(t)<=maxw: line=t
        else: out.append(line); line=w
    out.append(line); return out
def hwrap(im,text,x,y,font,fill,maxw,lh,seed=1):
    for i,l in enumerate(wrap(text,font,maxw)):
        hw(im,l,x,y,font,fill,seed+i); y+=lh
    return y
def heart(d,cx,cy,s,fill,outline=None):
    pts=[(cx+16*math.sin(math.radians(i))**3*s, cy-(13*math.cos(math.radians(i))-5*math.cos(2*math.radians(i))-2*math.cos(3*math.radians(i))-math.cos(4*math.radians(i)))*s) for i in range(360)]
    d.polygon(pts,fill=fill)
    if outline: d.line(pts+[pts[0]],fill=outline,width=5)
def wavy(d,x1,x2,y,fill,w=5):
    pts=[(x,y+6*math.sin((x-x1)/14)) for x in range(int(x1),int(x2),4)]
    d.line(pts,fill=fill,width=w)
def notebook(sl,i,n):
    im=Image.new("RGB",(W,H),(252,248,235)); d=ImageDraw.Draw(im)
    for y in range(190,H,66): d.line([(0,y),(W,y)],fill=(176,204,232),width=2)
    d.line([(125,0),(125,H)],fill=(236,130,130),width=3)
    for y in (200,675,1150): d.ellipse([34,y,74,y+40],fill=(225,220,205),outline=(190,185,170),width=2)
    ink=(28,58,150); red=(210,50,90)
    y=90; hw(im,sl["title"],165,y,F(HWB,92),red,i+3); wavy(d,165,165+min(740,F(HWB,92).getlength(sl["title"])),y+118,red)
    y=250
    for k,it in enumerate(sl.get("items",[])):
        f=F(HW,60 if not sl.get("cta") else 66)
        y=hwrap(im,it,165,y,f,ink,W-230,78,10*k+i)+22
    if sl.get("cta"): heart(d,W/2,1020,9,(255,94,168),(210,50,90))
    if i==0: hw(im,"swipe  >>>",W-380,H-120,F(HW,50),red,99)
    hw(im,SITE,165,H-120,F(HW,44),(90,90,110),77)
    hw(im,f"{i+1}/{n}",W-150,60,F(HW,40),(120,120,140),55)
    return im
def sticky(sl,i,n):
    im=Image.new("RGB",(W,H),(196,160,122)); d=ImageDraw.Draw(im)
    rng=random.Random(i)
    for _ in range(900):
        x,y=rng.randint(0,W),rng.randint(0,H); d.point((x,y),fill=(176,140,104))
    hw(im,sl["title"],70,60,F(HWB,86),(60,35,20),i+5)
    cols=[(255,235,120),(255,170,200),(170,235,200),(160,210,250)]
    y=270
    for k,it in enumerate(sl.get("items",[])):
        nw,nh=900,300 if not sl.get("cta") else 380
        layer=Image.new("RGBA",(nw+60,nh+60),(0,0,0,0)); ld=ImageDraw.Draw(layer)
        ld.rectangle([34,34,nw+30,nh+30],fill=(0,0,0,70))
        ld.rectangle([20,20,nw+16,nh+16],fill=cols[(k+i)%4]+(255,))
        ld.rectangle([20,20,nw+16,70],fill=(0,0,0,18))
        hwrap(layer,it,60,100,F(HWB,62),(50,40,30),nw-80,76,k+i*7)
        layer=layer.rotate(rng.uniform(-3,3),resample=Image.BICUBIC,expand=True)
        im.paste(layer,((W-layer.width)//2,y),layer); y+=nh+50
    hw(im,SITE,70,H-110,F(HW,44),(60,35,20),66)
    hw(im,f"{i+1}/{n}",W-150,H-110,F(HW,40),(60,35,20),44)
    return im
def chalk(sl,i,n):
    im=Image.new("RGB",(W,H),(120,84,52)); d=ImageDraw.Draw(im)
    d.rectangle([34,34,W-34,H-34],fill=(34,58,50))
    rng=random.Random(i)
    for _ in range(2500):
        x,y=rng.randint(40,W-40),rng.randint(40,H-40); d.point((x,y),fill=(50,76,66))
    white=(240,240,228); yel=(255,226,110); pink=(255,170,200)
    hw(im,sl["title"],90,100,F(HWB,90),yel,i+2); wavy(d,90,90+min(860,F(HWB,90).getlength(sl["title"])),230,yel,4)
    y=320
    for k,it in enumerate(sl.get("items",[])):
        y=hwrap(im,it,100,y,F(HW,62),white if k%2==0 else pink,W-200,80,k*5+i)+34
    if sl.get("cta"): heart(d,W/2,1040,9,pink,white)
    if i==0: hw(im,"swipe  >>>",W-400,H-170,F(HW,52),yel,31)
    hw(im,SITE,90,H-150,F(HW,44),white,21)
    hw(im,f"{i+1}/{n}",W-190,80,F(HW,40),white,12)
    return im
STY={"notebook":notebook,"sticky":sticky,"chalk":chalk}
POSTS=[
("post1_notebook","notebook",[
 {"title":"free-heart","items":["Watch it.","Save it.","Shape the moment."]},
 {"title":"How it works","items":["1. Discover movies, series & matchday fixtures","2. Watch with subtitles + quality switching","3. Save for offline playback"]},
 {"title":"Then make it yours","items":["4. Clip a 1-60 sec moment","5. AI writes the caption","6. Share it in one tap"]},
 {"title":"Try it now","items":[SITE,"Link in bio"],"cta":True}]),
("post2_sticky","sticky",[
 {"title":"Why try free-heart?","items":["Installs like an app, no store needed","Works offline with saved downloads"]},
 {"title":"Make shorts fast","items":["Clip Studio: trim 1-60 sec moments","AI captions + hashtags in seconds"]},
 {"title":"Never miss matchday","items":["Live Match Center: scores + fixtures","Follow teams, get push alerts"]},
 {"title":"Your turn","items":["Open it now: "+SITE+"  (link in bio)"],"cta":True}]),
("post3_chalk","chalk",[
 {"title":"Clip it in 4 steps","items":["with free-heart","Takes under a minute"]},
 {"title":"Step 1 + 2","items":["1. Pick your moment","2. Trim it, 1 to 60 seconds"]},
 {"title":"Step 3 + 4","items":["3. Let AI write the caption","4. Share it anywhere"]},
 {"title":"Start clipping","items":[SITE,"Link in bio"],"cta":True}]),
]
for name,sty,sls in POSTS:
    for i,sl in enumerate(sls):
        STY[sty](sl,i,len(sls)).save(os.path.join(OUT,f"{name}_{i+1}.png"))
print("ok",len(POSTS)*4)
