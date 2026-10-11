from PIL import Image, ImageDraw, ImageFont
import math, os, glob, random
SC=2; W,H=1080,1350
SITE="free-heart.de.deplexo.com"
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,"car"); os.makedirs(OUT,exist_ok=True)
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

L,R,CX=130,1015,572
def base(c):
    d=c.d
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
def counter(c,i):
    c.r(900,44,110,40,fill=(255,255,255),out=INK,rad=20,wd=2); c.tx(900,48,"%d / 6"%i,26,INK,bold=True,maxw=110,align="c")
def footer(c,D):
    c.tx(L,1268,"free-heart | "+D["topic"],20,BLUE,bold=True,maxw=420,maxh=24)
    c.tx(560,1268,SITE+" (link in bio)",20,RED,bold=True,maxw=455,maxh=24,align="r")
def titlebar(c,D,txt,col):
    c.tx(L,52,"free",44,BLUE,bold=True,jit=True,seed=4); c.tx(L+c.tw("free",44,True),52,"-heart",44,RED,bold=True,jit=True,seed=5)
    c.r(L,128,R-L,76,out=col,rad=14,wd=4,fill=(255,255,255)); c.tx(L+16,138,txt,38,col,bold=True,maxw=R-L-32,maxh=58,jit=True,seed=len(txt))
def vdown(c,x,y1,y2,col=INK):
    c.ln([(x,y1),(x,y2)],col,2.5); c.pg([(x,y2+7),(x-6,y2-3),(x+6,y2-3)],col)
def cover(D):
    c=C(); base(c); counter(c,1)
    c.heart(CX,285,10.5,PINK,RED); c.pg([(CX-30,235),(CX-30,335),(CX+62,285)],(255,255,255))
    wf=c.tw("free",150,True); w2=c.tw("-heart",150,True); x0=CX-(wf+w2)/2
    c.tx(x0,430,"free",150,BLUE,bold=True,jit=True,seed=2); c.tx(x0+wf,430,"-heart",150,RED,bold=True,jit=True,seed=3)
    c.r(CX-350,640,700,70,out=RED,rad=16,wd=4); c.tx(CX-340,648,D["part"],36,RED,bold=True,maxw=680,maxh=56,align="c")
    c.tx(CX-400,745,D["title"],70,INK,bold=True,maxw=800,maxh=200,align="c",lh=1.12,jit=True,seed=9)
    c.tx(CX-380,975,D["hook"],38,BLUE,maxw=760,maxh=120,align="c")
    for i in range(3):
        ic,lab,sub=D["steps"][i]; cx=CX-250+i*250
        c.r(cx-70,1120,140,150,fill=tuple(CYC[i])+(35,),out=CYC[i],rad=16,wd=3); c.ico(ic,cx,1175,38); c.tx(cx-68,1225,lab,24,INK,bold=True,maxw=136,maxh=30,align="c")
        if i<2: c.arrow(cx+78,1195,cx+170)
    c.tx(L,1280,"swipe  >>>",34,RED,bold=True,maxw=300); c.tx(560,1280,SITE,24,INK,bold=True,maxw=455,maxh=30,align="r")
    return c
def dense(D,i):
    c=C(); base(c); counter(c,i); d=c.d
    c.heart(222,125,5.4,PINK,RED); c.pg([(206,105),(206,145),(244,125)],(255,255,255))
    wf=c.tw("free",96,True)
    c.tx(325,50,"free",96,BLUE,bold=True,jit=True,seed=2); c.tx(325+wf,50,"-heart",96,RED,bold=True,jit=True,seed=3)
    c.r(325,172,520,40,out=RED,rad=10,wd=3); c.tx(337,176,D["part"],26,RED,bold=True,maxw=496,maxh=32)
    for k,wd in enumerate(D["words"]): c.tx(900,90+k*28,wd+("  !" if k==4 else ""),24,CYC[(k+1)%6],bold=True,maxw=130,maxh=26,lh=1.0)
    c.el(990,168,1030,208,fill=YEL,out=INK,wd=2); c.el(1002,180,1006,186,fill=INK); c.el(1015,180,1019,186,fill=INK); c.ln([(1002,194),(1010,200),(1020,194)],INK,2)
    T=D["topic"]
    box(c,125,235,440,235,BLUE,"1. What is %s ?"%T); bullets(c,125,235,440,235,D["bul"])
    x2,w2=580,440; box(c,x2,235,w2,235,GREEN,"2. Before vs After")
    hdr,rows,cw=D["tab"]; sc_=(w2-20)/sum(cw); cw=[v*sc_ for v in cw]; tx0=x2+10; ty=278
    c.r(tx0,ty,w2-20,34,fill=(40,160,90),rad=6); xx=tx0
    for j,hh in enumerate(hdr): c.tx(xx+6,ty+4,hh,18,(255,255,255),bold=True,maxw=cw[j]-10,maxh=26); xx+=cw[j]
    ty+=34
    for k,row in enumerate(rows):
        c.r(tx0,ty,w2-20,38,fill=(235,248,240) if k%2==0 else (255,255,255),out=(150,200,170),wd=1); xx=tx0
        for j,cell in enumerate(row): c.tx(xx+6,ty+3,cell,18,INK,bold=(j==0),maxw=cw[j]-10,maxh=34,lh=1.05); xx+=cw[j]
        ty+=38
    box(c,125,482,440,208,GREEN,"3. Why %s ?"%T); yy=522
    for t in D["chk"]: c.check(138,yy+2,9); c.tx(162,yy,t,20,INK,maxw=255,maxh=27); yy+=27.5
    c.r(440,520,115,140,fill=(255,170,205),rad=4,out=(230,120,170),wd=2); c.tx(446,526,D["stk"],20,INK,bold=True,maxw=103,maxh=128,align="c",lh=1.12)
    box(c,580,482,440,208,BLUE,"4. %s Overview"%T); nodes=D["steps"][:5]; m=len(nodes); sp=420/m
    for k,(ic,lab,sub) in enumerate(nodes):
        cx=600+sp*k+sp/2; c.ico(ic,cx,566,25); c.tx(cx-sp/2+2,598,lab,18,INK,bold=True,maxw=sp-4,maxh=22,align="c",lh=1.0)
        c.tx(cx-sp/2+2,620,sub,15,(70,80,110),maxw=sp-4,maxh=58,align="c",lh=1.05)
        if k<m-1: c.arrow(cx+30,566,cx+sp-30)
    box(c,125,702,895,166,PURP,"5. Step-by-Step Flow of %s"%T); tw_=122; gap=(871-tw_*6)/5
    for k,(ic,lab,sub) in enumerate(D["steps"]):
        tx_=137+k*(tw_+gap); col=CYC[k%6]
        c.r(tx_,740,tw_,72,fill=tuple(col)+(35,),out=col,rad=8,wd=2.5); c.r(tx_,740,tw_,24,fill=col,rad=8)
        c.tx(tx_+4,742,"%d. %s"%(k+1,lab),17,(255,255,255),bold=True,maxw=tw_-8,maxh=21,align="c",lh=1.0); c.ico(ic,tx_+tw_/2,790,19)
        c.tx(tx_-4,815,sub,15,INK,maxw=tw_+8,maxh=46,align="c",lh=1.05)
        if k<5: c.arrow(tx_+tw_+4,776,tx_+tw_+gap-6)
    box(c,125,880,895,140,ORNG,"6. Real-World Example"); nd=D["ex"]; m=len(nd); sp=780/m
    for k,(ic,lab) in enumerate(nd):
        cx=140+sp*k+sp/2; c.ico(ic,cx,945,27); c.tx(cx-sp/2+4,978,lab,17,INK,bold=True,maxw=sp-8,maxh=40,align="c",lh=1.05)
        if k<m-1: c.arrow(cx+34,945,cx+sp-34)
    c.ico("bulb",975,950,30)
    box(c,125,1032,440,213,TEAL,"7. Quick tips"); bullets(c,125,1032,440,213,D["tips"],20); c.ico(D["tipic"],515,1062,18)
    box(c,580,1032,440,150,RED,"8. Key Takeaways"); yy=1070
    for k,t in enumerate(D["take"]):
        c.el(592,yy+2,610,yy+20,fill=CYC[k%6]); c.tx(596,yy+1,str(k+1),15,(255,255,255),bold=True,maxw=10)
        c.tx(618,yy,t,16,INK,maxw=392,maxh=21,lh=1.0); yy+=21.5
    c.r(580,1192,440,53,fill=(255,170,205),out=(230,120,170),rad=10,wd=2); c.tx(592,1198,D["tag"],21,INK,bold=True,maxw=350,maxh=42,align="c",lh=1.05); c.ico("heart",990,1220,18)
    c.tx(125,1262,"Learn | Clip | Share | Grow Together !",18,BLUE,bold=True,maxw=420,maxh=24); c.tx(570,1262,SITE+" (link in bio)",18,RED,bold=True,maxw=450,maxh=24,align="r")
    return c
def steps_pg(D):
    c=C(); base(c); counter(c,3); titlebar(c,D,"Step-by-Step : "+D["topic"],PURP)
    for k,(ic,lab,sub) in enumerate(D["steps"]):
        x=L+(k%2)*455; y=235+(k//2)*325; col=CYC[k%6]
        c.r(x,y,430,300,fill=tuple(col)+(30,),out=col,rad=16,wd=3); c.r(x,y,430,56,fill=col,rad=16)
        c.tx(x+14,y+8,"%d. %s"%(k+1,lab),34,(255,255,255),bold=True,maxw=400,maxh=42)
        c.ico(ic,x+95,y+180,58); c.tx(x+175,y+85,sub,30,INK,maxw=240,maxh=190,lh=1.2)
    footer(c,D); return c
def compare_pg(D):
    c=C(); base(c); counter(c,4); titlebar(c,D,"Before vs After : "+D["topic"],GREEN)
    hdr,rows,cw=D["tab"]; sc_=(R-L)/sum(cw); cw=[v*sc_ for v in cw]; y=235
    c.r(L,y,R-L,70,fill=GREEN,rad=10); xx=L
    for j,hh in enumerate(hdr): c.tx(xx+12,y+10,hh,32,(255,255,255),bold=True,maxw=cw[j]-20,maxh=50); xx+=cw[j]
    y+=70
    for k,row in enumerate(rows):
        c.r(L,y,R-L,92,fill=(235,248,240) if k%2==0 else (255,255,255),out=(150,200,170),wd=2); xx=L
        for j,cell in enumerate(row): c.tx(xx+12,y+10,cell,30,INK,bold=(j==0),maxw=cw[j]-20,maxh=74,lh=1.1); xx+=cw[j]
        y+=92
    box(c,L,730,R-L,470,BLUE,"Why %s ?"%D["topic"]); yy=790
    for t in D["chk"]: c.check(L+20,yy+4,14); c.tx(L+62,yy,t,30,INK,maxw=470,maxh=44); yy+=62
    c.r(740,800,250,300,fill=(255,170,205),out=(230,120,170),rad=8,wd=3); c.tx(748,820,D["stk"],34,INK,bold=True,maxw=234,maxh=260,align="c",lh=1.15)
    c.ico("heart",865,1150,30)
    footer(c,D); return c
def example_pg(D):
    c=C(); base(c); counter(c,5); titlebar(c,D,"Real-World Example : "+D["topic"],ORNG)
    box(c,L,235,470,960,ORNG,"The story"); n=len(D["ex"]); sp=(960-70)/n
    for k,(ic,lab) in enumerate(D["ex"]):
        cy=235+70+sp*k+sp/2-10; c.ico(ic,L+75,cy,46); c.tx(L+145,cy-34,lab,30,INK,bold=True,maxw=310,maxh=80,lh=1.1)
        if k<n-1: vdown(c,L+75,cy+54,cy+sp-54)
    box(c,625,235,390,600,TEAL,"Quick tips"); bullets(c,625,235,390,600,D["tips"],28); c.ico("bulb",975,268,22)
    c.r(625,860,390,335,fill=(255,170,205),out=(230,120,170),rad=14,wd=3); c.tx(640,890,D["tag"],42,INK,bold=True,maxw=360,maxh=240,align="c",lh=1.15,jit=True,seed=11); c.ico("heart",820,1140,34)
    footer(c,D); return c
def cta_pg(D):
    c=C(); base(c); counter(c,6); titlebar(c,D,"Key Takeaways : "+D["topic"],RED)
    box(c,L,235,R-L,470,RED,"Remember"); yy=295
    for k,t in enumerate(D["take"]):
        c.el(L+20,yy+6,L+62,yy+48,fill=CYC[k%6]); c.tx(L+20,yy+10,str(k+1),30,(255,255,255),bold=True,maxw=42,align="c"); c.tx(L+80,yy+6,t,32,INK,maxw=780,maxh=70,lh=1.1); yy+=82
    c.r(L,725,R-L,120,fill=(255,170,205),out=(230,120,170),rad=18,wd=3); c.tx(L+20,745,D["tag"],46,INK,bold=True,maxw=R-L-40,maxh=84,align="c",lh=1.05,jit=True,seed=13)
    c.r(L+60,870,R-L-120,150,fill=(255,236,120),out=(230,190,60),rad=8,wd=3); c.tx(L+80,890,D["ask"]+"  Tell us below",36,INK,bold=True,maxw=R-L-160,maxh=110,align="c",lh=1.15)
    c.r(L+40,1050,R-L-80,110,fill=RED,rad=55); c.tx(L+60,1072,"Open  "+SITE,38,(255,255,255),bold=True,maxw=R-L-120,maxh=70,align="c")
    c.tx(L,1182,"Link in bio  |  Save  |  Share  |  Follow",30,BLUE,bold=True,maxw=R-L,align="c",maxh=40)
    footer(c,D); return c
def P(topic,part,title,words,hook,bul,tab,chk,stk,steps,ex,tips,tipic,take,tag,ask):
    return dict(topic=topic,part=part,title=title,words=words.split(","),hook=hook,bul=bul.split(";"),
      tab=(tab.split("|")[0].split(","),[x.split(",") for x in tab.split("|")[1].split(";")],[int(v) for v in tab.split("|")[2].split(",")]),
      chk=chk.split(";"),stk="\n".join(stk.split("|")),steps=[tuple(x.split("/")) for x in steps.split(";")],
      ex=[tuple(x.split("/")) for x in ex.split(";")],tips=tips.split(";"),tipic=tipic,take=take.split(";"),tag=tag,ask=ask)
POSTS=[
P("free-heart","Part 1 : Introduction","What is free-heart ?","Discover,Watch,Save,Clip,Share","A mobile-first streaming PWA for stories worth watching.",
 "Netflix-style streaming PWA for your phone;Installs like an app, no store needed;Clip Studio makes 1-60 sec shorts;Live Match Center for matchday",
 "Feature,Without,free-heart|Install,App store hunt,Home screen;Offline,Extra tools,Built-in saves;Clips,Other editor,Clip Studio;Matchday,Another app,Match Center|100,150,170",
 "Discover movies and fixtures;Subtitles + quality control;Resilient playback;Offline downloads;Clips + AI captions;Push alerts for matchday","Watch|Save|Clip|Share|Repeat !",
 "globe/Open/Visit in any browser;phone/Install/Add to home screen;play/Watch/Subtitles + quality;down/Save/Download for offline;cut/Clip/Trim + AI caption;share/Share/Story or feed",
 "person/Fan opens free-heart;ball/Checks Live Match Center;bell/Gets a push alert;cut/Clips the moment;share/Shares to story",
 "Install it to your home screen;Allow notifications for alerts;Download on Wi-Fi first;Clip 15-30 sec moments;Share while it is fresh","gear",
 "free-heart is a streaming PWA.;Install it, watch it, save it.;Clip Studio makes shorts.;AI writes captions + hashtags.;Match Center keeps you in the game.","Watch today, clip tomorrow !","Which feature do you want a demo of?"),
P("Clip Studio","Part 2 : Clip Studio","Clip Studio : shorts in seconds","Pick,Trim,Caption,Tag,Share","Turn any moment into a 1-60 second short.",
 "Built-in tool that makes shorts;Trim clips from 1 to 60 seconds;AI writes captions and hashtags;Share straight from your phone",
 "Task,Without,free-heart|Editing,Separate app,Inside the app;Length,Guess it,1-60 sec trim;Captions,Write by hand,AI suggests;Hashtags,Search them,AI suggests|100,150,170",
 "No extra editing app;Trim to exact length;AI captions in seconds;Hashtags suggested;Ready for story + feed;Fast on mobile","Pick|Trim|Caption|Share|Repeat !",
 "film/Pick/Open a video;cut/Trim/Set start + end;play/Preview/Check the clip;sparkle/Caption/AI suggests one;bulb/Hashtags/Pick suggestions;share/Share/Post or send",
 "person/Fan watches the match;cut/Trims the goal;sparkle/AI adds a caption;share/Posts to story;heart/Friends react",
 "Keep it short: 15-30 sec;Start right on the action;Use the AI caption as a draft;Add 3-5 hashtags;Post when fans are online","bulb",
 "Clip Studio is built in.;Trim from 1 to 60 seconds.;AI drafts captions + hashtags.;Share to story or feed fast.;Short clips travel further.","Clip it. Share it. Repeat !","What would you clip first?"),
P("Match Center","Part 3 : Live Match Center","Live Match Center","Follow,Alert,Watch,Check,Share","Scores, fixtures and alerts in one place.",
 "Live scores and fixtures together;Follow your favorite teams;Push alerts so you never miss out;Same installable app",
 "Feature,What it does,Why|Scores,Live updates,Stay current;Fixtures,Upcoming matches,Plan ahead;Teams,Follow favorites,Your list;Alerts,Push notifications,Never miss|110,170,140",
 "Scores in one place;Upcoming fixtures;Follow favorite teams;Push alerts;No extra app;Works from your home screen","Follow|Alert|Watch|Share|Repeat !",
 "globe/Open/Match Center;heart/Follow/Pick your teams;bell/Allow/Turn on alerts;ball/Check/Scores + fixtures;play/Watch/Stream the match;share/Share/Clip and post",
 "person/Fan opens free-heart;heart/Follows the team;bell/Alert before kickoff;ball/Checks the scores;share/Shares the moment",
 "Follow 2-3 teams to start;Allow notifications;Check fixtures on Friday;Install to home screen;Clip the best moments","phone",
 "Match Center = scores + fixtures.;Follow teams, get alerts.;It lives inside free-heart.;Install it like an app.;Clip and share the big moments.","Follow today, never miss tomorrow !","Which team are you following?"),
P("Offline Saves","Part 4 : Offline Downloads","Watch Offline","Find,Save,Travel,Watch,Enjoy","Save it once, watch it anywhere.",
 "Download titles inside the app;Watch later without internet;Save mobile data;Great for weak networks",
 "Moment,Without,free-heart|Commute,Buffering,Saved copy;Data,Streams again,Download once;Weak signal,Stalls,Plays offline;Travel,No access,Watch anywhere|110,150,170",
 "Download inside the app;Watch without internet;Save mobile data;Good for weak networks;Resilient playback;Install like an app","Save|Go offline|Watch|Share|Repeat !",
 "globe/Open/Find a title;down/Download/Tap save offline;phone/Close/Leave the signal;play/Play/Watch offline;heart/Enjoy/Anywhere;share/Share/Tell a friend",
 "person/Fan finds a title;down/Downloads on Wi-Fi;phone/Heads out for the commute;play/Watches offline;heart/Arrives entertained",
 "Download on Wi-Fi first;Check free storage;Install the app first;Remove watched items;Keep a few ready for travel","down",
 "Download once, watch anywhere.;Saves mobile data.;Great on weak networks.;Works from your home screen.;Pairs with Clip Studio.","Save today, watch anywhere !","Where do you watch offline?"),
P("AI Captions","Part 5 : AI Captions","AI Captions + Hashtags","Clip,Ask,Edit,Tag,Post","Your clip needs words. Let AI draft them.",
 "AI drafts a caption for your clip;Suggests hashtags to match;Edit it to sound like you;Copy and post fast",
 "Task,Manual,With AI|Caption,Blank page,Draft ready;Hashtags,Guesswork,Suggested;Time,Minutes,Seconds;Tone,Stuck,Edit freely|100,150,170",
 "Draft in seconds;Hashtags suggested;Edit to your voice;No blank page;Works with Clip Studio;Post faster","Clip|Caption|Tag|Post|Repeat !",
 "film/Pick/Choose a clip;cut/Trim/1-60 seconds;sparkle/Generate/AI caption;bulb/Hashtags/Choose a few;heart/Edit/Make it yours;share/Post/Story or feed",
 "person/Creator trims a clip;sparkle/AI drafts a caption;bulb/Picks 3-5 hashtags;heart/Edits the tone;share/Posts it",
 "Treat AI as a first draft;Add your own voice;Use 3-5 hashtags;Keep captions short;Ask a question to spark comments","sparkle",
 "AI drafts, you decide.;Captions in seconds.;Hashtags suggested.;Edit freely.;Built into Clip Studio.","Draft with AI, finish with you !","Short or long captions?"),
P("Playback","Part 6 : Watching","Watch Your Way","Open,Play,Subtitles,Quality,Enjoy","Subtitles, quality control and resilient playback.",
 "Watch in your phone browser or app;Subtitles when you need them;Switch quality to match your signal;Resilient playback keeps going",
 "Need,Without,free-heart|Language,Hunt files,Subtitles;Signal,Buffering,Quality switch;Hiccups,Restart,Resilient play;Device,Another app,Your phone|100,150,170",
 "Subtitles available;Quality switching;Resilient playback;Mobile-first player;Install like an app;Save for offline","Open|Play|Adjust|Enjoy|Repeat !",
 "globe/Open/Find a title;play/Play/Tap to watch;film/Subtitles/Turn them on;gear/Quality/Match your signal;down/Save/Offline copy;heart/Enjoy/Relax",
 "person/Fan opens the player;play/Starts watching;gear/Lowers quality on weak data;film/Turns on subtitles;heart/Keeps watching",
 "Lower quality on mobile data;Use subtitles in noisy places;Install the app for quick access;Save favorites offline;Refresh if a stream stalls","gear",
 "Mobile-first playback.;Subtitles when needed.;Quality control.;Resilient playback.;Save for later.","Press play, we handle the rest !","Subtitles on or off?"),
P("Push Alerts","Part 7 : Push Alerts","Push Alerts","Allow,Follow,Wait,Tap,Watch","Let matchday come to you.",
 "Allow notifications once;Get push alerts on your phone;Follow teams to stay relevant;Tap an alert to jump in",
 "Moment,Without,free-heart|Kickoff,You forget,Alert arrives;Scores,Check manually,Push to phone;Teams,Search,Follow them;Open,Hunt,Tap the alert|100,150,170",
 "Allow once;Alerts on your phone;Follow your teams;Tap to open;Stay in the loop;No extra app","Allow|Follow|Alert|Watch|Repeat !",
 "globe/Open/free-heart;bell/Allow/Notifications;heart/Follow/Pick teams;ball/Wait/Alerts arrive;play/Tap/Open the match;share/Share/Tell friends",
 "person/Fan installs free-heart;bell/Allows notifications;heart/Follows two teams;bell/Alert arrives;ball/Opens the Match Center",
 "Allow notifications on first open;Follow only teams you love;Keep the app installed;Mute at night in phone settings;Share big moments","bell",
 "Alerts come to your phone.;Allow once, follow teams.;Tap to jump in.;Pairs with Match Center.;Stay in the loop.","Never miss a moment !","Which alerts do you want most?"),
P("Install","Part 8 : Install in 60 Seconds","Install in 60 Seconds","Open,Menu,Add,Launch,Enjoy","No app store. Just your browser.",
 "Open the site in your browser;Use Add to Home Screen;Launch it like any app;Updates come from the web",
 "Step,Store app,free-heart|Find,Search store,Open the link;Install,Big download,Add to home;Update,Manual,From the web;Space,Heavy,Light|100,150,170",
 "No app store;Opens like an app;Full screen;Light on storage;Updates from the web;Share with a link","Open|Add|Launch|Share|Repeat !",
 "globe/Open/The free-heart link;gear/Menu/Browser options;phone/Add/Add to Home Screen;heart/Name/Confirm;play/Launch/Tap the icon;share/Share/Send the link",
 "person/Friend sends the link;globe/Opens it in the browser;phone/Adds it to home screen;play/Launches the app;share/Shares it onward",
 "Use Chrome on Android;Look for Add to Home Screen;Allow notifications after install;Keep it on your first screen;Share the link with friends","phone",
 "No store needed.;Add to Home Screen.;Opens like an app.;Light and fast.;Easy to share.","Install in a minute !","Installed a web app before?"),
P("For Fans","Part 9 : For Fans","A Fan's Weekend","Follow,Alert,Watch,Clip,Share","Everything a matchday fan needs.",
 "Follow your teams;Get alerts before kickoff;Watch and save;Clip the moment and share it",
 "Moment,Before,free-heart|Friday,Search fixtures,Match Center;Saturday,Miss kickoff,Push alert;Sunday,Lose the clip,Clip Studio;Monday,Old news,Shared|100,150,170",
 "Fixtures in one place;Alerts before kickoff;Offline saves;Clip Studio;AI captions;Share to story","Follow|Alert|Clip|Share|Repeat !",
 "heart/Follow/Your teams;bell/Alert/Before kickoff;ball/Check/Scores + fixtures;play/Watch/Your way;cut/Clip/The big moment;share/Share/With friends",
 "person/Fan opens free-heart;bell/Gets the alert;ball/Checks the match;cut/Clips the moment;share/Posts to story",
 "Follow your teams first;Allow notifications;Clip 15-30 sec;Add a caption with AI;Tag your friends","heart",
 "Built for matchday fans.;Alerts + scores + clips.;Install like an app.;Share fast.;Repeat every weekend.","Matchday, sorted !","Who is your team?"),
P("For Creators","Part 10 : For Creators","A Creator's Workflow","Watch,Clip,Caption,Tag,Post","From moment to post in minutes.",
 "Find the moment worth sharing;Trim it in Clip Studio;Let AI draft the caption;Post to story or feed",
 "Stage,Slow way,free-heart|Edit,Open editor,Clip Studio;Caption,Think hard,AI draft;Tags,Search,Suggested;Post,Switch apps,Share|100,150,170",
 "One app, fewer steps;1-60 sec trims;AI captions;Hashtag ideas;Story or feed ready;Faster posting","Clip|Caption|Tag|Post|Repeat !",
 "play/Watch/Find the moment;cut/Clip/Trim 1-60 sec;sparkle/Caption/AI draft;bulb/Tags/Choose a few;share/Post/Story or feed;heart/Engage/Reply to fans",
 "person/Creator finds a moment;cut/Trims it;sparkle/AI drafts a caption;bulb/Picks hashtags;share/Posts it",
 "Batch clips weekly;Post at the same time daily;Reply to comments early;Use the AI caption as a draft;Test different clip lengths","bulb",
 "One workflow, fewer apps.;Clip, caption, tag, post.;AI drafts, you decide.;Consistency wins.;Engage with replies.","Create more, stress less !","How often do you post?"),
]
import sys
only=int(sys.argv[1]) if len(sys.argv)>1 else 0
for pi,D in enumerate(POSTS,1):
    if only and pi!=only: continue
    for si,fn in enumerate([cover,lambda D:dense(D,2),steps_pg,compare_pg,example_pg,cta_pg],1):
        c=fn(D); c.im.resize((W,H),Image.LANCZOS).save(os.path.join(OUT,"p%02d_%d.png"%(pi,si)))
print("ok",len(POSTS)*6)
