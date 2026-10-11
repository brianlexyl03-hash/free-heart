from PIL import Image, ImageDraw, ImageFont
import math, os, glob
W,H=1080,1920
def pick(names):
    for n in names:
        p="/system/fonts/"+n
        if os.path.exists(p): return p
    return sorted(glob.glob("/system/fonts/*.ttf"))[0]
B=pick(["Roboto-Bold.ttf","DroidSans-Bold.ttf","NotoSans-Bold.ttf","Roboto-Regular.ttf"])
R=pick(["Roboto-Regular.ttf","DroidSans.ttf","NotoSans-Regular.ttf"])
def f(p,s): return ImageFont.truetype(p,s)
def grad(c1,c2):
    im=Image.new("RGB",(W,H)); d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/H; d.line([(0,y),(W,y)],fill=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3)))
    return im
def heart(d,cx,cy,s,fill):
    pts=[]
    for i in range(360):
        t=math.radians(i)
        pts.append((cx+16*math.sin(t)**3*s, cy-(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))*s))
    d.polygon(pts,fill=fill)
def center(d,text,y,font,fill):
    w=d.textlength(text,font=font); d.text(((W-w)/2,y),text,font=font,fill=fill)
def wrap(d,text,font,maxw):
    out,line=[],""
    for w in text.split():
        t=(line+" "+w).strip()
        if d.textlength(t,font=font)<=maxw: line=t
        else: out.append(line); line=w
    out.append(line); return out
def card(name,headline,sub,bullets,cta):
    im=grad((255,94,168),(30,35,39)); d=ImageDraw.Draw(im)
    heart(d,W/2,330,11,(255,255,255)); heart(d,W/2,330,7.5,(255,94,168))
    center(d,"free",440,f(B,130),(255,255,255))
    y=640
    for l in wrap(d,headline,f(B,78),W-160):
        center(d,l,y,f(B,78),(255,255,255)); y+=94
    y+=10
    for l in wrap(d,sub,f(R,40),W-200):
        center(d,l,y,f(R,40),(255,225,238)); y+=54
    y+=40
    for b in bullets:
        d.rounded_rectangle([110,y,W-110,y+96],radius=28,fill=(30,35,39))
        d.text((150,y+26),"+  "+b,font=f(B,40),fill=(255,255,255)); y+=116
    d.rounded_rectangle([140,y+30,W-140,y+160],radius=65,fill=(255,255,255))
    center(d,cta,y+62,f(B,54),(30,35,39))
    center(d,"Link in bio  |  github.com/brianlexyl03-hash/free-heart",y+210,f(R,28),(255,225,238))
    im.save(os.path.join(os.path.dirname(os.path.abspath(__file__)),name))
card("story1_watch_clip.png","Watch it. Save it. Shape the moment.","A mobile-first PWA for stories worth watching.",["Resilient playback","Offline downloads","Install it like an app"],"Try free-heart")
card("story2_clip_studio.png","Turn any moment into a short.","Trim 1-60 second clips right inside the app.",["Clip Studio built in","AI captions + hashtags","Share in one tap"],"Open Clip Studio")
card("story3_live_match.png","Never miss matchday.","Live scores, fixtures and alerts in one place.",["Live Match Center","Follow your teams","Push alerts"],"Open Live Center")
