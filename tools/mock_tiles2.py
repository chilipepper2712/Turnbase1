import numpy as np, cv2, random
from PIL import Image, ImageDraw
S=3; TW,TH=96,48
def comps(path,minarea=200):
    im=Image.open(path).convert('RGBA'); a=np.array(im)[:,:,3]
    n,lab,st,cen=cv2.connectedComponentsWithStats((a>0).astype(np.uint8),connectivity=8)
    out=[]
    for i in range(1,n):
        x,y,w,h,ar=st[i]
        if ar<minarea or w<10: continue
        out.append((cen[i][1],cen[i][0],im.crop((x,y,x+w,y+h))))
    return out
def rows(cs,ngroups,key=lambda c:c[0]):
    cs=sorted(cs,key=key); ys=[c[0] for c in cs]
    # split by y gaps
    groups=[[cs[0]]]
    for c in cs[1:]:
        if c[0]-groups[-1][-1][0]>45: groups.append([c])
        else: groups[-1].append(c)
    return [[g[2] for g in sorted(gr,key=lambda c:c[1])] for gr in groups]
trees=[c[2] for c in sorted(comps('trees_a.png',3000),key=lambda c:(round(c[0]/300),c[1]))]
tg=rows(comps('tufts_c.png',150),4); rg=rows(comps('rocks_c.png',150),4)
print('trees',len(trees),'tuft rows',[len(g) for g in tg],'rock rows',[len(g) for g in rg])
tufts=tg[0]+tg[1]; bushes=tg[2]; flowers=tg[3][:3]; tiny=tg[3][3:] if len(tg)>3 else []
boulders=rg[0]+rg[1][:1]; mounds=rg[1][1:]; reeds=rg[2]; puddles=rg[3][:2]; shrubs=rg[3][2:]
print(len(tufts),len(bushes),len(flowers),len(boulders),len(mounds),len(reeds),len(puddles),len(shrubs))
def scaled(img,world_h):
    # art grid: BOX /4 then nearest to target
    w,h=img.size; a=img.resize((max(1,w//4),max(1,h//4)),Image.BOX)
    H=int(world_h*S); W=max(1,int(a.width*H/a.height))
    return a.resize((W,H),Image.NEAREST)
W,H=11,9
terr=[['plain']*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        t='plain'
        if x+y in (7,8) and 2<=x<=8: t='dirt'
        if 7<=x<=10 and 0<=y<=3: t='forest'
        if 0<=x<=2 and 5<=y<=8: t='mountain'
        if 3<=x<=5 and 0<=y<=2: t='swamp'
        if 0<=x<=1 and 1<=y<=3: t='hill'
        terr[y][x]=t
COL={'plain':(121,170,84),'dirt':(190,160,108),'forest':(84,136,66),'mountain':(140,128,112),'swamp':(96,112,70),'hill':(130,160,84)}
def t2w(x,y): return ((x-y)*TW/2,(x+y)*TH/2)
cs=[t2w(-.5,-.5),t2w(W-.5,-.5),t2w(W-.5,H-.5),t2w(-.5,H-.5)]
minx=min(c[0] for c in cs)-20;maxx=max(c[0] for c in cs)+20;miny=min(c[1] for c in cs)-90;maxy=max(c[1] for c in cs)+10
OW=int((maxx-minx)*S);OH=int((maxy-miny)*S)
sx,sy=np.meshgrid(np.arange(OW),np.arange(OH)); wx=sx/S+minx; wy=sy/S+miny
x=(wy/(TH/2)+wx/(TW/2))/2; y=(wy/(TH/2)-wx/(TW/2))/2
cx=np.round(x).astype(int); cy=np.round(y).astype(int)
inside=(cx>=0)&(cx<W)&(cy>=0)&(cy<H)
names=list(COL); M=np.array([[names.index(terr[j][i]) for i in range(W)] for j in range(H)])
cxc=np.clip(cx,0,W-1);cyc=np.clip(cy,0,H-1)
fx=x-cx;fy=y-cy;ax=np.abs(fx);ay=np.abs(fy);horiz=ax>=ay;d=0.5-np.maximum(ax,ay)
nx=np.clip(cx+np.where(horiz,np.sign(fx).astype(int),0),0,W-1);ny=np.clip(cy+np.where(horiz,0,np.sign(fy).astype(int)),0,H-1)
def h2(a,b):
    h=(a*374761393+b*668265263)&0xffffffff; h=((h^(h>>13))*1274126177)&0xffffffff; return ((h^(h>>16))&0xffff)/65535.0
blk=3*S  # dither block size in output px (≈ art pixel)
noise=h2(sx//blk,sy//blk)
p=0.5*(1-np.clip(d/0.2,0,1)); use=(d<0.2)&(noise<p)
sel=np.where(use,M[ny,nx],M[cyc,cxc])
pal=np.array([COL[n] for n in names],np.uint8)
base=pal[sel].astype(int)
# per-block subtle value variation (flat look)
v=(h2(sx//(blk*3)+7,sy//(blk*3)+3)-0.5)*10
base=np.clip(base+v[:,:,None],0,255).astype(np.uint8)
out=np.full((OH,OW,3),(233,231,222),np.uint8); out[inside]=base[inside]
img=Image.fromarray(out).convert('RGBA')
dr=ImageDraw.Draw(img,'RGBA')
def center(tx,ty):
    c=t2w(tx,ty); return ((c[0]-minx)*S,(c[1]-miny)*S)
items=[]  # (ybase, sprite, x, y)
rnd=random.Random(5)
def put(sp,tx,ty,jx=0.35,jy=0.35):
    cx_,cy_=center(tx+rnd.uniform(-jx,jx),ty+rnd.uniform(-jy,jy))
    items.append((cy_,sp,cx_,cy_))
for ty in range(H):
    for tx in range(W):
        t=terr[ty][tx]
        if t=='plain':
            for _ in range(rnd.choice([2,3,3,4])): put(scaled(rnd.choice(tufts),rnd.uniform(9,16)),tx,ty)
            if rnd.random()<.25: put(scaled(rnd.choice(bushes),rnd.uniform(12,17)),tx,ty)
            if rnd.random()<.2: put(scaled(rnd.choice(flowers),9),tx,ty)
            if rnd.random()<.08: put(scaled(rnd.choice(trees),rnd.uniform(40,52)),tx,ty,.2,.2)
        elif t=='forest':
            for _ in range(rnd.choice([2,3,3])): put(scaled(rnd.choice(trees),rnd.uniform(46,62)),tx,ty,.4,.4)
            if rnd.random()<.5: put(scaled(rnd.choice(tufts),12),tx,ty)
        elif t=='hill':
            put(scaled(rnd.choice(boulders),rnd.uniform(14,20)),tx,ty); put(scaled(rnd.choice(tufts),12),tx,ty)
            if rnd.random()<.5: put(scaled(rnd.choice(bushes),14),tx,ty)
        elif t=='mountain':
            put(scaled(rnd.choice(mounds),rnd.uniform(34,52)),tx,ty,.25,.25)
            if rnd.random()<.6: put(scaled(rnd.choice(boulders),14),tx,ty)
        elif t=='swamp':
            for _ in range(2): put(scaled(rnd.choice(reeds),rnd.uniform(22,30)),tx,ty)
            put(scaled(rnd.choice(puddles),12),tx,ty,.25,.25)
            if rnd.random()<.4: put(scaled(rnd.choice(shrubs),20),tx,ty)
        elif t=='dirt':
            if rnd.random()<.7: put(scaled(boulders[0],8),tx,ty)
            if rnd.random()<.5: put(scaled(rnd.choice(tufts[:3]),9),tx,ty)
# highlight overlays & units
ov=Image.new('RGBA',img.size,(0,0,0,0)); od=ImageDraw.Draw(ov)
def diamond(tx,ty,fill=None,outline=None):
    c=center(tx,ty); pts=[(c[0],c[1]-TH/2*S),(c[0]+TW/2*S,c[1]),(c[0],c[1]+TH/2*S),(c[0]-TW/2*S,c[1])]
    od.polygon(pts,fill=fill,outline=outline)
for ty in range(H):
    for tx in range(W): diamond(tx,ty,outline=(60,80,50,40))
for ty in range(H):
    for tx in range(W):
        if abs(tx-5)+abs(ty-4)<=2 and (tx,ty)!=(5,4): diamond(tx,ty,fill=(60,120,220,60),outline=(40,90,200,170))
for tx,ty in [(7,3)]: diamond(tx,ty,fill=(220,70,60,70),outline=(200,40,40,200))
img=Image.alpha_composite(img,ov)
A='/home/user/Turnbase1/assets/units/'
def unit(f,tx,ty,h=62):
    s=Image.open(A+f).convert('RGBA'); r=h*S/s.height; s=s.resize((int(s.width*r),int(h*S)),Image.NEAREST)
    c=center(tx,ty); items.append((c[1]+TH/4*S,s,c[0],c[1]+TH/4*S))
for f,tx,ty,h in [('human_infantry.png',5,4,62),('human_archer.png',4,4,62),('human_cavalry.png',5,3,70),('orc_infantry.png',7,3,62),('orc_archer.png',6,6,62),('orc_goblin.png',8,2,50)]: unit(f,tx,ty,h)
for yb,sp,cx_,cy_ in sorted(items,key=lambda i:i[0]):
    img.alpha_composite(sp,(int(cx_-sp.width/2),int(cy_-sp.height+ (TH/4*S if False else 0)*0)))
img.convert('RGB').save('mock2.png'); print(img.size)
