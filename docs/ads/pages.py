from PIL import Image, ImageDraw, ImageFont
import math, os, glob, random
SC=2; W,H=1080,1350
SITE="free-heart.de.deplexo.com"
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,"pages"); os.makedirs(OUT,exist_ok=True)
def pick(names):
    for d in ["/system/fonts/","/usr/share/fonts/truetype/dejavu/"]:
        for n in names:
            if os.path.exists(d+n): return d+n
    return sorted(glob.glob("/system/fonts/*.ttf"))[0]
HW=pick(["ComingSoon.ttf","DancingScript-Regular.ttf","DejaVuSans-Oblique.ttf","DejaVuSans.ttf"])
HWB=pick(["ComingSoon.ttf","DancingScript-Bold.ttf","DejaVuSans-BoldOblique.ttf","DejaVuSans-Bold.ttf"])
FC={}
def font(p,s):
    if (p,s) not in FC: FC[(p,s)]=ImageFont.truetype(p,s)
    return FC[(p,s)]
BLUE=(31,95,190);GREEN=(36,150,85);RED=(214,48,62);PURP=(125,75,200);ORNG=(238,135,35);PINK=(255,150,200);INK=(28,36,66);TEAL=(20,150,160);YEL=(255,214,60)
CYC=[BLUE,GREEN,RED,ORNG,PURP,TEAL]
def wrapl(t,f,mw):
    out,l=[],""
    for w in t.split():
        c=(l+" "+w).strip()
        if f.getlength(c)<=mw: l=c
        else:
            if l: out.append(l)
            l=w
    out.append(l); return out
class C:
    def __init__(s):
        s.im=Image.new("RGB",(W*SC,H*SC),(150,106,72)); s.d=ImageDraw.Draw(s.im,"RGBA")
    def r(s,x,y,w,h,fill=None,out=None,rad=0,wd=2):
        s.d.rounded_rectangle([x*SC,y*SC,(x+w)*SC,(y+h)*SC],radius=rad*SC,fill=fill,outline=out,width=int(wd*SC))
    def ln(s,pts,col,wd=2):
        s.d.line([(a*SC,b*SC) for a,b in pts],fill=col,width=int(wd*SC),joint="curve")
    def el(s,x1,y1,x2,y2,fill=None,out=None,wd=2):
        s.d.ellipse([x1*SC,y1*SC,x2*SC,y2*SC],fill=fill,outline=out,width=int(wd*SC))
    def pg(s,pts,fill,out=None):
        s.d.polygon([(a*SC,b*SC) for a,b in pts],fill=fill,outline=out)
    def heart(s,cx,cy,k,fill,out=None):
        pts=[(cx+16*math.sin(math.radians(i))**3*k, cy-(13*math.cos(math.radians(i))-5*math.cos(2*math.radians(i))-2*math.cos(3*math.radians(i))-math.cos(4*math.radians(i)))*k) for i in range(0,360,3)]
        s.pg(pts,fill)
        if out: s.ln(pts+[pts[0]],out,2.5)
    def tw(s,text,size,bold=False):
        return font(HWB if bold else HW,int(size*SC)).getlength(text)/SC
    def tx(s,x,y,text,size,col,bold=False,maxw=None,maxh=None,align="l",lh=1.18,jit=False,seed=1):
        p=HWB if bold else HW
        while True:
            f=font(p,int(size*SC)); lines=[]
            for para in text.split("\n"):
                lines+= wrapl(para,f,maxw*SC) if maxw else [para]
            h=len(lines)*size*lh; wide=max(f.getlength(l) for l in lines)/SC
            if ((maxh is None or h<=maxh) and (maxw is None or wide<=maxw+1)) or size<=9: break
            size-=1
        rng=random.Random(seed)
        for i,l in enumerate(lines):
            w=f.getlength(l)/SC
            xx=x if align=="l" else (x+(maxw-w)/2 if align=="c" else x+maxw-w)
            yy=y+i*size*lh
            if jit:
                cx=xx*SC
                for ch in l:
                    fs=f.size
                    if ch!=" ":
                        lay=Image.new("RGBA",(int(fs*1.8),int(fs*2)),(0,0,0,0))
                        ImageDraw.Draw(lay).text((fs*.4,fs*.3),ch,font=f,fill=tuple(col)+(255,))
                        lay=lay.rotate(rng.uniform(-3,3),resample=Image.BICUBIC,center=(lay.width/2,lay.height/2))
                        s.im.paste(lay,(int(cx-fs*.4),int(yy*SC-fs*.3+rng.uniform(-2,2))),lay)
                    cx+=f.getlength(ch)
            else:
                s.d.text((xx*SC,yy*SC),l,font=f,fill=col)
        return y+len(lines)*size*lh
    def arrow(s,x1,y,x2,col=INK):
        s.ln([(x1,y),(x2,y)],col,2.5); s.pg([(x2+7,y),(x2-3,y-6),(x2-3,y+6)],col)
    def check(s,x,y,r=9):
        s.el(x,y,x+2*r,y+2*r,fill=GREEN); s.ln([(x+r*.45,y+r*1.05),(x+r*.85,y+r*1.45),(x+r*1.55,y+r*.6)],(255,255,255),2.5)
    def ico(s,k,cx,cy,r):
        W_=(255,255,255)
        if k=="play":
            s.el(cx-r,cy-r,cx+r,cy+r,fill=(230,60,70)); s.pg([(cx-r*.3,cy-r*.5),(cx-r*.3,cy+r*.5),(cx+r*.6,cy)],W_)
        elif k=="down":
            s.el(cx-r,cy-r,cx+r,cy+r,fill=BLUE); s.ln([(cx,cy-r*.55),(cx,cy+r*.15)],W_,4); s.pg([(cx-r*.42,cy),(cx+r*.42,cy),(cx,cy+r*.5)],W_); s.ln([(cx-r*.5,cy+r*.68),(cx+r*.5,cy+r*.68)],W_,4)
        elif k=="cut":
            s.el(cx-r*.85,cy+r*.15,cx-r*.3,cy+r*.7,out=RED,wd=3.5); s.el(cx+r*.3,cy+r*.15,cx+r*.85,cy+r*.7,out=RED,wd=3.5)
            s.ln([(cx-r*.5,cy+r*.2),(cx+r*.6,cy-r*.8)],INK,4); s.ln([(cx+r*.5,cy+r*.2),(cx-r*.6,cy-r*.8)],INK,4)
        elif k=="phone":
            s.r(cx-r*.55,cy-r,r*1.1,r*2,fill=INK,rad=6); s.r(cx-r*.43,cy-r*.8,r*.86,r*1.45,fill=(160,215,250),rad=3); s.el(cx-3,cy+r*.74,cx+3,cy+r*.74+6,fill=(200,200,210))
            s.heart(cx,cy-r*.05,r*.03,RED)
        elif k=="ball":
            s.el(cx-r,cy-r,cx+r,cy+r,fill=W_,out=INK,wd=3)
            pts=[(cx+r*.36*math.cos(math.radians(a-90)),cy+r*.36*math.sin(math.radians(a-90))) for a in range(0,360,72)]
            s.pg(pts,INK)
            for (px,py),a in zip(pts,range(0,360,72)): s.ln([(px,py),(cx+r*.85*math.cos(math.radians(a-90)),cy+r*.85*math.sin(math.radians(a-90)))],INK,2.5)
        elif k=="share":
            a,b,c_=(cx+r*.6,cy-r*.6),(cx-r*.6,cy),(cx+r*.6,cy+r*.6)
            s.ln([a,b,c_],PURP,3.5)
            for (px,py) in (a,b,c_): s.el(px-r*.3,py-r*.3,px+r*.3,py+r*.3,fill=PURP,out=W_,wd=2)
        elif k=="bell":
            s.el(cx-r*.7,cy-r*.8,cx+r*.7,cy+r*.3,fill=YEL,out=ORNG,wd=2.5); s.pg([(cx-r*.7,cy-r*.2),(cx+r*.7,cy-r*.2),(cx+r*.9,cy+r*.45),(cx-r*.9,cy+r*.45)],YEL,ORNG)
            s.el(cx-r*.2,cy+r*.5,cx+r*.2,cy+r*.9,fill=ORNG)
        elif k=="heart": s.heart(cx,cy,r*.062*3.1/3,PINK,RED)
        elif k=="bulb":
            s.el(cx-r*.6,cy-r*.9,cx+r*.6,cy+r*.3,fill=YEL,out=ORNG,wd=2.5); s.r(cx-r*.3,cy+r*.3,r*.6,r*.4,fill=(190,190,200),rad=3)
            for a in (-60,-30,0,30,60): s.ln([(cx+r*1.0*math.sin(math.radians(a)),cy-r*.3-r*1.0*math.cos(math.radians(a))),(cx+r*1.25*math.sin(math.radians(a)),cy-r*.3-r*1.25*math.cos(math.radians(a)))],ORNG,2.5)
        elif k=="sparkle":
            pts=[]
            for i in range(8):
                rr=r if i%2==0 else r*.3; a=math.radians(i*45-90); pts.append((cx+rr*math.cos(a),cy+rr*math.sin(a)))
            s.pg(pts,PURP); s.el(cx+r*.45,cy-r*.95,cx+r*.75,cy-r*.65,fill=PINK)
        elif k=="globe":
            s.el(cx-r,cy-r,cx+r,cy+r,fill=(70,150,235),out=INK,wd=2.5); s.el(cx-r*.45,cy-r,cx+r*.45,cy+r,out=W_,wd=2); s.ln([(cx-r,cy),(cx+r,cy)],W_,2); s.ln([(cx-r*.85,cy-r*.5),(cx+r*.85,cy-r*.5)],W_,2); s.ln([(cx-r*.85,cy+r*.5),(cx+r*.85,cy+r*.5)],W_,2)
        elif k=="gear":
            pts=[]
            for i in range(16):
                rr=r if i%2==0 else r*.75; a=math.radians(i*22.5); pts.append((cx+rr*math.cos(a),cy+rr*math.sin(a)))
            s.pg(pts,(90,110,150),INK); s.el(cx-r*.35,cy-r*.35,cx+r*.35,cy+r*.35,fill=(240,245,250))
        elif k=="person":
            s.el(cx-r*.38,cy-r*.9,cx+r*.38,cy-r*.15,fill=(250,205,170),out=INK,wd=2); s.d.pieslice([(cx-r*.8)*SC,(cy-r*.05)*SC,(cx+r*.8)*SC,(cy+r*1.5)*SC],180,360,fill=BLUE)
        elif k=="film":
            s.r(cx-r,cy-r*.75,r*2,r*1.5,fill=INK,rad=5)
            for i in range(4):
                s.r(cx-r*.9+i*r*.48,cy-r*.65,r*.28,r*.25,fill=W_,rad=2); s.r(cx-r*.9+i*r*.48,cy+r*.4,r*.28,r*.25,fill=W_,rad=2)
            s.r(cx-r*.55,cy-r*.3,r*1.1,r*.6,fill=(110,180,250),rad=3)
def box(c,x,y,w,h,col,title):
    c.r(x,y,w,h,fill=(255,255,255,235),out=col,rad=12,wd=3)
    c.tx(x+12,y+6,title,25,col,bold=True,maxw=w-24,maxh=30,jit=True,seed=len(title))
def bullets(c,x,y,w,h,items,size=21):
    avail=h-44; per=avail/len(items); yy=y+40
    for i,t in enumerate(items):
        c.el(x+4,yy+9,x+14,yy+19,fill=CYC[i%6])
        c.tx(x+22,yy,t,size,INK,maxw=w-30,maxh=per-4)
        yy+=per
def build(D,n):
    c=C(); d=c.d
    for k in range(0,H,96): c.ln([(0,k),(W,k)],(120,82,52,150),3)
    rng=random.Random(5)
    for _ in range(500):
        x=rng.randint(0,W); yv=rng.randint(0,H); c.ln([(x,yv),(x+rng.randint(20,90),yv+rng.randint(-2,2))],(130,90,58,70),1)
    c.r(106,40,945,1290,fill=(0,0,0,90),rad=10)
    c.r(100,30,945,1290,fill=(252,250,243),rad=10)
    for yv in range(58,1300,46):
        c.r(72,yv,66,14,fill=(40,40,48),rad=7); c.r(78,yv+3,40,5,fill=(130,130,140),rad=3); c.el(106,yv+3,118,yv+11,fill=(185,178,165))
    for i,col in enumerate([(255,100,160),(255,150,40),(255,225,60),(90,200,120),(90,170,240)]): c.r(14,330+i*40,62,32,fill=col,rad=5)
    c.r(1056,160,20,560,fill=(30,30,36),rad=10); c.pg([(1056,720),(1076,720),(1066,760)],(30,30,36))
    # header
    c.heart(222,125,5.4,PINK,RED); c.pg([(206,105),(206,145),(244,125)],(255,255,255))
    wf=c.tw("free",96,True)
    c.tx(325,50,"free",96,BLUE,bold=True,jit=True,seed=2); c.tx(325+wf,50,"-heart",96,RED,bold=True,jit=True,seed=3)
    c.r(325,172,520,40,out=RED,rad=10,wd=3); c.tx(337,176,D["part"],26,RED,bold=True,maxw=496,maxh=32)
    c.tx(850,48,"Page - %02d"%n,30,INK,bold=True,maxw=190,align="r")
    for i,wd in enumerate(D["words"]): c.tx(900,90+i*28,wd+("  !" if i==4 else ""),24,CYC[(i+1)%6],bold=True,maxw=130,maxh=26,lh=1.0)
    c.el(990,168,1030,208,fill=YEL,out=INK,wd=2); c.el(1002,180,1006,186,fill=INK); c.el(1015,180,1019,186,fill=INK); c.ln([(1002,194),(1010,200),(1020,194)],INK,2)
    # row A
    box(c,125,235,440,235,BLUE,D["s1"][0]); bullets(c,125,235,440,235,D["s1"][1])
    x2,w2=580,440; box(c,x2,235,w2,235,GREEN,D["s2"][0])
    hdr=D["s2"][1]; rows=D["s2"][2]; cw=D["s2"][3]; tx0=x2+10; ty=278
    c.r(tx0,ty,w2-20,34,fill=(40,160,90),rad=6); xx=tx0
    for j,hh in enumerate(hdr): c.tx(xx+6,ty+4,hh,18,(255,255,255),bold=True,maxw=cw[j]-10,maxh=26); xx+=cw[j]
    ty+=34
    for i,row in enumerate(rows):
        c.r(tx0,ty,w2-20,38,fill=(235,248,240) if i%2==0 else (255,255,255),out=(150,200,170),wd=1)
        xx=tx0
        for j,cell in enumerate(row): c.tx(xx+6,ty+3,cell,18,INK,bold=(j==0),maxw=cw[j]-10,maxh=34,lh=1.05); xx+=cw[j]
        ty+=38
    # row B
    box(c,125,482,440,208,GREEN,D["s3"][0])
    yy=522
    for i,t in enumerate(D["s3"][1]): c.check(138,yy+2,9); c.tx(162,yy,t,20,INK,maxw=255,maxh=27); yy+=27.5
    c.r(440,520,115,140,fill=(255,170,205),rad=4,out=(230,120,170),wd=2)
    c.tx(446,526,D["s3"][2],20,INK,bold=True,maxw=103,maxh=128,align="c",lh=1.12)
    box(c,580,482,440,208,BLUE,D["s4"][0]); nodes=D["s4"][1]; m=len(nodes); sp=420/m
    for i,(ic,lab,sub) in enumerate(nodes):
        cx=600+sp*i+sp/2
        c.ico(ic,cx,566,25); c.tx(cx-sp/2+2,598,lab,18,INK,bold=True,maxw=sp-4,maxh=22,align="c",lh=1.0)
        c.tx(cx-sp/2+2,620,sub,15,(70,80,110),maxw=sp-4,maxh=58,align="c",lh=1.05)
        if i<m-1: c.arrow(cx+30,566,cx+sp-30)
    # row C
    box(c,125,702,895,166,PURP,D["s5"][0]); tl=D["s5"][1]; tw_=122; gap=(871-tw_*6)/5
    for i,(ic,lab,sub) in enumerate(tl):
        tx_=137+i*(tw_+gap); col=CYC[i%6]
        c.r(tx_,740,tw_,72,fill=tuple(col)+(35,),out=col,rad=8,wd=2.5); c.r(tx_,740,tw_,24,fill=col,rad=8)
        c.tx(tx_+4,742,"%d. %s"%(i+1,lab),17,(255,255,255),bold=True,maxw=tw_-8,maxh=21,align="c",lh=1.0)
        c.ico(ic,tx_+tw_/2,790,19)
        c.tx(tx_-4,815,sub,15,INK,maxw=tw_+8,maxh=46,align="c",lh=1.05)
        if i<5: c.arrow(tx_+tw_+4,776,tx_+tw_+gap-6)
    # row D
    box(c,125,880,895,140,ORNG,D["s6"][0]); nd=D["s6"][1]; m=len(nd); sp=780/m
    for i,(ic,lab) in enumerate(nd):
        cx=140+sp*i+sp/2
        c.ico(ic,cx,945,27); c.tx(cx-sp/2+4,978,lab,17,INK,bold=True,maxw=sp-8,maxh=40,align="c",lh=1.05)
        if i<m-1: c.arrow(cx+34,945,cx+sp-34)
    c.ico("bulb",975,950,30)
    # row E
    box(c,125,1032,440,213,TEAL,D["s7"][0]); bullets(c,125,1032,440,213,D["s7"][1],20); c.ico(D["s7"][2],515,1062,18)
    box(c,580,1032,440,150,RED,D["s8"][0]); yy=1070
    for i,t in enumerate(D["s8"][1]):
        c.el(592,yy+2,610,yy+20,fill=CYC[i%6]); c.tx(596,yy+1,str(i+1),15,(255,255,255),bold=True,maxw=10)
        c.tx(618,yy,t,16,INK,maxw=392,maxh=21,lh=1.0); yy+=21.5
    c.r(580,1192,440,53,fill=(255,170,205),out=(230,120,170),rad=10,wd=2)
    c.tx(592,1198,D["tag"],21,INK,bold=True,maxw=350,maxh=42,align="c",lh=1.05); c.ico("heart",990,1220,18)
    c.tx(125,1262,"Learn | Clip | Share | Grow Together !",18,BLUE,bold=True,maxw=420,maxh=24)
    c.tx(570,1262,SITE+" (link in bio)",18,RED,bold=True,maxw=450,maxh=24,align="r")
    im=c.im.resize((W,H),Image.LANCZOS); im.save(os.path.join(OUT,"page_%02d.png"%n))
P1=dict(part="Part 1 : Introduction & Basic Concepts",words=["Discover","Watch","Save","Clip","Share"],
 s1=("1. What is free-heart ?",["A Netflix-style streaming PWA for your phone.","Installs like an app, no store needed.","Clip Studio makes 1-60 sec shorts.","Live Match Center for matchday."]),
 s2=("2. Before vs After",["Feature","Without","free-heart"],[["Install","App store hunt","Home screen"],["Offline","Extra tools","Built-in saves"],["Clips","Other editor","Clip Studio"],["Matchday","Another app","Match Center"]],[100,150,170]),
 s3=("3. Why free-heart ?",["Discover movies and fixtures","Subtitles + quality control","Resilient playback","Offline downloads","Clips + AI captions","Push alerts for matchday"],"Watch\nSave\nClip\nShare\nRepeat !  :)"),
 s4=("4. free-heart Overview",[("person","You","Open the site"),("globe","Discover","Movies, fixtures"),("play","Watch","With subtitles"),("cut","Clip","Trim 1-60 sec"),("share","Share","Post anywhere")]),
 s5=("5. Step-by-Step Flow of free-heart",[("globe","Open","Visit in any browser"),("phone","Install","Add to home screen"),("play","Watch","Subtitles, quality"),("down","Save","Download offline"),("cut","Clip","Trim + AI caption"),("share","Share","Story or feed")]),
 s6=("6. Real-World Example : Matchday",[("person","Fan opens free-heart"),("ball","Checks Live Match Center"),("bell","Gets a push alert"),("cut","Clips the moment"),("share","Shares to story")]),
 s7=("7. What is inside ?",["Frontend: installable PWA","Backend: deployed on Render","Clip Studio: 1-60 sec trims","AI: captions + hashtags","Live: scores + push alerts"],"gear"),
 s8=("8. Key Takeaways",["free-heart is a mobile-first streaming PWA.","Install it, watch it, save it offline.","Clip Studio turns moments into shorts.","AI writes captions and hashtags.","Live Match Center keeps you in the game."]),
 tag="Watch today, clip tomorrow !")
P2=dict(part="Part 2 : Clip Studio",words=["Pick","Trim","Caption","Tag","Share"],
 s1=("1. What is Clip Studio ?",["A built-in tool that makes shorts.","Trim clips from 1 to 60 seconds.","AI writes captions and hashtags.","Share straight from your phone."]),
 s2=("2. Before vs After",["Task","Without","free-heart"],[["Editing","Separate app","Inside the app"],["Length","Guess it","1-60 sec trim"],["Captions","Write by hand","AI suggests"],["Hashtags","Search them","AI suggests"]],[100,150,170]),
 s3=("3. Why use it ?",["No extra editing app","Trim to exact length","AI captions in seconds","Hashtags suggested","Ready for story + feed","Fast on mobile"],"Pick\nTrim\nCaption\nShare\nRepeat !  :)"),
 s4=("4. Clip Overview",[("film","Pick","Choose a moment"),("cut","Trim","1-60 seconds"),("sparkle","Caption","AI writes it"),("share","Share","Post anywhere")]),
 s5=("5. Step-by-Step Flow of Clip Studio",[("film","Pick","Open a video"),("cut","Trim","Set start + end"),("play","Preview","Check the clip"),("sparkle","Caption","AI suggests one"),("bulb","Hashtags","Pick suggestions"),("share","Share","Post or send")]),
 s6=("6. Real-World Example : A Goal Clip",[("person","Fan watches the match"),("cut","Trims the goal"),("sparkle","AI adds a caption"),("share","Posts to story"),("heart","Friends react")]),
 s7=("7. Tips for great clips",["Keep it short: 15-30 sec","Start right on the action","Use the AI caption as a draft","Add 3-5 hashtags","Post when fans are online"],"bulb"),
 s8=("8. Key Takeaways",["Clip Studio is built into free-heart.","Trim from 1 to 60 seconds.","AI drafts captions + hashtags.","Share to story or feed fast.","Short clips travel further."]),
 tag="Clip it. Share it. Repeat !")
P3=dict(part="Part 3 : Matchday & Offline",words=["Follow","Alert","Watch","Save","Share"],
 s1=("1. Live Match Center ?",["Live scores and fixtures in one place.","Follow your favorite teams.","Push alerts so you never miss out.","Same installable app."]),
 s2=("2. What you get",["Feature","What it does"],[["Scores","Live updates"],["Fixtures","Upcoming matches"],["Teams","Follow favorites"],["Alerts","Push notifications"]],[140,280]),
 s3=("3. Why save offline ?",["Watch on the go","Save mobile data","Good for weak networks","Resilient playback","Install like an app","Download, watch later"],"Save\nWatch\nFollow\nShare\nRepeat !  :)"),
 s4=("4. Matchday Overview",[("ball","Follow","Pick teams"),("bell","Alert","Push alerts"),("play","Watch","Stream it"),("down","Save","Offline copy"),("share","Share","Tell friends")]),
 s5=("5. Step-by-Step Flow of Matchday",[("globe","Open","Match Center"),("heart","Follow","Pick your teams"),("bell","Allow","Turn on alerts"),("play","Watch","Stream live"),("down","Save","Download for later"),("share","Share","Clip and post")]),
 s6=("6. Real-World Example : Weekend Derby",[("person","Fan opens free-heart"),("heart","Follows the team"),("bell","Alert before kickoff"),("play","Watches the match"),("down","Saves for the commute")]),
 s7=("7. Quick setup tips",["Install to your home screen","Allow notifications for alerts","Download on Wi-Fi first","Follow 2-3 teams to start","Clip the best moments"],"phone"),
 s8=("8. Key Takeaways",["Match Center = scores + fixtures.","Follow teams, get push alerts.","Save downloads to watch offline.","Install it like an app.","Clip and share the best moments."]),
 tag="Follow today, never miss tomorrow !")
for i,D in enumerate([P1,P2,P3],1): build(D,i)
print("ok")
