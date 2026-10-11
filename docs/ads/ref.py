import os, re, sys, glob
HERE=os.path.dirname(os.path.abspath(__file__))
_p=os.path.join(HERE,"car.py")
if not os.path.exists(_p): sys.exit("car.py missing: run the previous step first")
exec(open(_p).read().split("import sys\nonly=")[0],globals())
OUT=os.path.join(HERE,"ref"); os.makedirs(OUT,exist_ok=True)
_h=os.path.join(HERE,"hand.ttf")
if os.path.exists(_h) and os.path.getsize(_h)>20000: HW=_h; HWB=_h
BLU2=(33,76,175); BLK=(25,25,30); GRN=(30,140,80); LN=(70,70,82)
L,R,CX=110,1040,575
def page(i):
    c=C(); c.im.paste((251,250,246),[0,0,W*SC,H*SC])
    for y in range(70,H,46): c.ln([(0,y),(W,y)],(233,233,228),1.2)
    c.r(0,0,64,H,fill=(214,214,216)); c.ln([(64,0),(64,H)],(160,160,165),2)
    for y in range(6,H,52):
        c.r(0,y,58,26,fill=(20,20,24),rad=13); c.el(46,y-1,74,y+27,fill=(20,20,24)); c.r(8,y+8,24,5,fill=(120,120,128),rad=2)
    c.tx(R-80,8,"%02d"%i,34,BLK,maxw=80,align="r"); return c
def title(c,t,y=52,size=80):
    c.tx(L,y,t,size,BLK,maxw=R-L,maxh=size*1.2,align="c")
    w=min(c.tw(t,size),R-L); x1=CX-w/2; yy=y+size*1.22
    c.ln([(x1+x,yy+3*math.sin(x/18)) for x in range(0,int(w)-90,6)],RED,6)
    c.ln([(x1+w-80,yy),(x1+w-40,yy)],RED,6); c.ln([(x1+w-28,yy),(x1+w-8,yy)],RED,6)
def hd(c,x,y,n,t,w=420,size=32):
    c.el(x,y,x+40,y+40,out=GRN,wd=3); c.tx(x,y+3,str(n),26,GRN,maxw=40,align="c"); c.tx(x+52,y+1,t,size,BLK,maxw=w-52,maxh=40)
def lay(text,size,maxw):
    f=font(HW,int(size*SC)); sp=f.getlength(" "); out=[]
    for para in text.split("\n"):
        toks=[];red=False
        for part in re.split(r"(\*)",para):
            if part=="*": red=not red; continue
            toks+=[(w,red) for w in part.split(" ") if w]
        cur=[];cw=0
        for w,r in toks:
            wl=f.getlength(w)
            if cur and cw+sp+wl>maxw*SC: out.append(cur); cur=[(w,r)]; cw=wl
            else: cw+=(sp if cur else 0)+wl; cur.append((w,r))
        out.append(cur)
    return f,sp,out
def rt(c,x,y,text,size,col=BLU2,maxw=400,maxh=None,lh=1.28,align="l"):
    while True:
        f,sp,lines=lay(text,size,maxw)
        if maxh is None or len(lines)*size*lh<=maxh or size<=10: break
        size-=1
    for ln_ in lines:
        wl=sum(f.getlength(w) for w,_ in ln_)+sp*(len(ln_)-1); xx=x*SC+((maxw*SC-wl)/2 if align=="c" else 0)
        for w,r in ln_: c.d.text((xx,y*SC),w,font=f,fill=RED if r else col); xx+=f.getlength(w)+sp
        y+=size*lh
    return y
def tick(c,x,y,s=1.0): c.ln([(x,y+11*s),(x+7*s,y+19*s),(x+21*s,y+1*s)],GRN,4)
def yel(c,x,y,w,h): c.r(x,y,w,h,fill=(255,247,214),out=(238,196,70),rad=14,wd=2.5)
def blu(c,x,y,w,h): c.r(x,y,w,h,fill=(241,245,253),out=(70,100,170),rad=6,wd=2)
def dash(c,x,y,w,h,col=(60,170,150)):
    for a in range(0,int(w),16): c.ln([(x+a,y),(x+min(a+9,w),y)],col,2); c.ln([(x+a,y+h),(x+min(a+9,w),y+h)],col,2)
    for a in range(0,int(h),16): c.ln([(x,y+a),(x,y+min(a+9,h))],col,2); c.ln([(x+w,y+a),(x+w,y+min(a+9,h))],col,2)
def tbl(c,x,y,w,hdr,rows,cw,rh,fs,hh=None):
    hh=hh or rh; s=w/sum(cw); cw=[v*s for v in cw]; h=hh+rh*len(rows)
    c.r(x,y,w,h,out=LN,wd=1.8); c.ln([(x,y+hh),(x+w,y+hh)],LN,1.8)
    for k in range(1,len(rows)): c.ln([(x,y+hh+rh*k),(x+w,y+hh+rh*k)],LN,1.1)
    xx=x
    for j in range(len(cw)):
        if j: c.ln([(xx,y),(xx,y+h)],LN,1.2)
        c.tx(xx+8,y+(hh-fs*1.15)/2,hdr[j],fs,RED,maxw=cw[j]-14,maxh=hh); 
        for k,row in enumerate(rows): c.tx(xx+8,y+hh+rh*k+(rh-fs*1.15)/2,row[j],fs,BLU2 if j==0 else BLK,maxw=cw[j]-14,maxh=rh-4,lh=1.05)
        xx+=cw[j]
    return y+h
def foot(c,D):
    c.tx(L,1306,"free-heart | "+D["topic"],20,BLU2,maxw=400,maxh=26); c.tx(560,1306,SITE+" (link in bio)",20,RED,maxw=480,maxh=26,align="r")
def s_cover(D):
    c=page(1); c.heart(CX,175,6,PINK,RED); c.pg([(CX-14,150),(CX-14,200),(CX+28,175)],(255,255,255))
    title(c,"free-heart",270,150)
    c.r(CX-330,500,660,64,out=GRN,rad=32,wd=3); c.tx(CX-320,510,D["part"],34,GRN,maxw=640,maxh=46,align="c")
    c.tx(L,600,D["title"],72,BLK,maxw=R-L,maxh=210,align="c",lh=1.1)
    yel(c,L+30,840,R-L-60,140); c.tx(L+30,848,"Key Takeaway",32,BLK,maxw=R-L-60,align="c"); rt(c,L+60,895,D["hook"],32,maxw=R-L-120,maxh=80,align="c")
    for i in range(3):
        ic,lab,sub=D["steps"][i]; x=L+30+i*300; blu(c,x,1020,270,200); c.ico(ic,x+135,1090,38); c.tx(x,1150,lab,32,BLK,maxw=270,align="c",maxh=40); c.tx(x+8,1188,sub,22,BLU2,maxw=254,align="c",maxh=28)
    c.tx(L,1262,"swipe  >>>",36,RED,maxw=300); foot(c,D); return c
def s_dense(D):
    c=page(2); T=D["topic"]; title(c,D["title"],52,76)
    hd(c,L,190,1,"What is %s ?"%T,430); rt(c,L+10,245,"\n".join("*%s* %s"%(b.split(" ")[0],b.split(" ",1)[1] if " " in b else "") for b in D["bul"]),30,maxw=440,maxh=265,lh=1.3)
    yel(c,585,185,455,335); c.tx(585,195,"Key Takeaway",32,BLK,maxw=455,align="c")
    yy=245
    for t in D["take"][:4]:
        tick(c,602,yy+4); yy=rt(c,640,yy,t,27,maxw=390,maxh=90,lh=1.2)+22
    hd(c,L,545,2,"How it works",430); blu(c,L,595,455,235); yy=608
    for ic,lab,sub in D["steps"]: c.tx(L+12,yy,lab,23,RED,maxw=120,maxh=30); c.tx(L+135,yy,sub,22,BLU2,maxw=312,maxh=30); yy+=36
    hd(c,585,545,3,"Before vs After",450); hdr,rows,cw=D["tab"]; tbl(c,585,600,455,hdr,rows,cw,50,22,44)
    hd(c,L,860,4,"Quick tips",430); blu(c,L,910,455,225); yy=922
    for t in D["tips"]: c.el(L+14,yy+10,L+24,yy+20,fill=BLU2); c.tx(L+34,yy,t,22,BLU2,maxw=410,maxh=40,lh=1.05); yy+=42
    hd(c,585,860,5,"Why %s ?"%T,450); blu(c,585,910,455,225); yy=920
    for t in D["chk"]: tick(c,600,yy+1,.8); c.tx(630,yy,t,22,BLU2,maxw=400,maxh=30); yy+=35
    hd(c,L,1155,6,"Real-World Example",430); dash(c,L,1205,455,125); yy=1212
    for k,(ic,lab) in enumerate(D["ex"]): c.tx(L+14,yy,"%d. %s"%(k+1,lab),20,BLK,maxw=430,maxh=24); yy+=24
    yel(c,585,1160,455,170); c.ico("bulb",1000,1205,22); c.tx(610,1170,"Remember",30,BLK,maxw=300); yy=1212
    for t in D["take"][2:5]: tick(c,610,yy+2,.8); c.tx(640,yy,t,20,BLU2,maxw=390,maxh=26); yy+=36
    return c
def s_steps(D):
    c=page(3); title(c,"Step-by-Step : "+D["topic"],52,70); y=170
    for k,(ic,lab,sub) in enumerate(D["steps"]):
        c.el(L,y+20,L+64,y+84,out=GRN,wd=4); c.tx(L,y+30,str(k+1),42,GRN,maxw=64,align="c")
        c.tx(L+90,y+10,lab,46,BLK,maxw=560,maxh=56); c.tx(L+90,y+68,sub,32,BLU2,maxw=620,maxh=44); c.ico(ic,L+850,y+60,40)
        if k<5: dash(c,L,y+138,R-L,0,(190,190,190))
        y+=172
    foot(c,D); return c
def s_compare(D):
    c=page(4); title(c,"Before vs After : "+D["topic"],52,70); hdr,rows,cw=D["tab"]
    e=tbl(c,L,170,R-L,hdr,rows,cw,86,32,72)
    hd(c,L,e+36,1,"Why %s ?"%D["topic"],700,40); y0=e+100; blu(c,L,y0,R-L,300)
    for k,t in enumerate(D["chk"]):
        x=L+24+(k//3)*455; y=y0+22+(k%3)*92; tick(c,x,y+6,1.3); c.tx(x+48,y,t,32,BLU2,maxw=390,maxh=84,lh=1.05)
    y1=y0+330; yel(c,L,y1,R-L,min(190,1290-y1)); c.tx(L+20,y1+10,"Remember",34,BLK,maxw=300); rt(c,L+20,y1+60,"  *•*  ".join(D["stk"].split("\n")),34,maxw=R-L-40,maxh=110)
    foot(c,D); return c
def s_example(D):
    c=page(5); title(c,"Real-World Example : "+D["topic"],52,64); dash(c,L,170,455,860); n=len(D["ex"]); sp=860/n
    for k,(ic,lab) in enumerate(D["ex"]):
        cy=170+sp*k+sp/2; c.ico(ic,L+70,cy-8,40); c.tx(L+130,cy-40,lab,30,BLK,maxw=310,maxh=90,lh=1.1)
        if k<n-1: vdown(c,L+70,cy+44,cy+sp-60)
    hd(c,585,170,1,"Quick tips",450,34); blu(c,585,222,455,520); yy=240
    for t in D["tips"]: c.el(602,yy+13,614,yy+25,fill=BLU2); yy=rt(c,630,yy,t,31,maxw=395,maxh=96,lh=1.12)+22
    yel(c,585,770,455,260); c.tx(600,800,D["tag"],44,BLK,maxw=425,maxh=190,align="c",lh=1.15); c.heart(CX+235,990,2.0,PINK,RED)
    yel(c,L,1060,R-L,215); c.ico("bulb",L+60,1118,28); c.tx(L+110,1072,"Remember",32,BLK,maxw=300); yy=1118
    for t in D["take"][:3]: tick(c,L+120,yy+2,.9); c.tx(L+160,yy,t,26,BLU2,maxw=740,maxh=34); yy+=46
    foot(c,D); return c
def s_cta(D):
    c=page(6); title(c,"Key Takeaways : "+D["topic"],52,64); yel(c,L,170,R-L,520); yy=200
    for t in D["take"]: tick(c,L+30,yy+8,1.5); c.tx(L+90,yy,t,38,BLU2,maxw=R-L-130,maxh=90,lh=1.05); yy+=96
    blu(c,L,720,R-L,150); c.tx(L+20,742,D["ask"],40,BLK,maxw=R-L-40,maxh=60,align="c"); c.tx(L+20,805,"Tell us in the comments",30,RED,maxw=R-L-40,align="c")
    c.r(L+30,900,R-L-60,120,fill=RED,rad=60); c.tx(L+50,925,"Open  "+SITE,44,(255,255,255),maxw=R-L-100,maxh=70,align="c")
    c.tx(L,1050,"Link in bio   |   Save   |   Share   |   Follow",34,BLU2,maxw=R-L,align="c",maxh=44)
    c.tx(L,1130,D["tag"],52,BLK,maxw=R-L,maxh=120,align="c",lh=1.1); foot(c,D); return c
only=int(sys.argv[1]) if len(sys.argv)>1 else 0
for pi,D in enumerate(POSTS,1):
    if only and pi!=only: continue
    for si,fn in enumerate([s_cover,s_dense,s_steps,s_compare,s_example,s_cta],1):
        fn(D).im.resize((W,H),Image.LANCZOS).save(os.path.join(OUT,"p%02d_%d.png"%(pi,si)))
print("ok")
