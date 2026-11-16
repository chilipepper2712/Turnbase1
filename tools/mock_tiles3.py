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

import cv2
def crisp(img,b=4,colors=22):
    a=np.array(img.convert('RGBA'))
    h,w=a.shape[:2]
    gh,gw=h//b,w//b
    ys=(np.arange(gh)*b+b//2); xs=(np.arange(gw)*b+b//2)
    g=a[np.ix_(ys,xs)]
    alpha=(g[:,:,3]>128)
    rgb=cv2.medianBlur(np.ascontiguousarray(g[:,:,:3]),3)
    pil=Image.fromarray(rgb).quantize(colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
    q=np.array(pil).astype(int)
    r0=g[:,:,:3].astype(int)
    warm=(r0[:,:,0]>r0[:,:,1]*1.35)&(r0[:,:,0]>55)&(r0[:,:,2]<r0[:,:,0]*0.85)
    q[warm]=r0[warm]
    R,G,B=q[:,:,0],q[:,:,1],q[:,:,2]
    spill=(R>G+6)&(B>G+6)&(np.maximum(np.maximum(R,G),B)<150)   # ám tím từ nền magenta
    q[spill]=(24,34,28)
    out=np.dstack([q.astype(np.uint8),(alpha*255).astype(np.uint8)])
    return Image.fromarray(out.astype(np.uint8),'RGBA')
CACHE={}
def scaled(img,world_h,k=3):
    key=(id(img),k)
    if key not in CACHE:
        c=crisp(img)
        CACHE[key]=c.resize((c.width*k,c.height*k),Image.NEAREST)
    return CACHE[key]
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
SH_SPR=[]
rnd=random.Random(5)
def put(sp,tx,ty,jx=0.35,jy=0.35):
    SH_SPR.append(sp)
    cx_,cy_=center(tx+rnd.uniform(-jx,jx),ty+rnd.uniform(-jy,jy))
    items.append((cy_,sp,cx_,cy_))
for ty in range(H):
    for tx in range(W):
        t=terr[ty][tx]
        if t=='plain':
            for _ in range(rnd.choice([0,1,1,1,2])): put(scaled(rnd.choice(tufts[:4]),0,2),tx,ty,.4,.4)
            if rnd.random()<.12: put(scaled(rnd.choice(bushes),0,2),tx,ty)
            if rnd.random()<.12: put(scaled(rnd.choice(flowers),0,2),tx,ty)
            if rnd.random()<.07: put(scaled(rnd.choice(trees),0,3),tx,ty,.2,.2)
        elif t=='forest':
            for _ in range(rnd.choice([2,3,3])): put(scaled(rnd.choice(trees),0,3),tx,ty,.4,.4)
            if rnd.random()<.5: put(scaled(rnd.choice(tufts),0,2),tx,ty)
        elif t=='hill':
            put(scaled(rnd.choice(boulders),0,3),tx,ty); put(scaled(rnd.choice(tufts),0,2),tx,ty)
            if rnd.random()<.5: put(scaled(rnd.choice(bushes),0,2),tx,ty)
        elif t=='mountain':
            put(scaled(rnd.choice(mounds),0,3),tx,ty,.25,.25)
            if rnd.random()<.6: put(scaled(rnd.choice(boulders),0,2),tx,ty)
        elif t=='swamp':
            for _ in range(2): put(scaled(rnd.choice(reeds),0,2),tx,ty)
            put(scaled(rnd.choice(puddles),0,2),tx,ty,.25,.25)
            if rnd.random()<.4: put(scaled(rnd.choice(shrubs),0,2),tx,ty)
        elif t=='dirt':
            if rnd.random()<.7: put(scaled(boulders[0],0,2),tx,ty)
            if rnd.random()<.5: put(scaled(rnd.choice(tufts[:3]),0,2),tx,ty)
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
sh=Image.new('RGBA',img.size,(0,0,0,0)); sd=ImageDraw.Draw(sh)
for yb,sp,cx_,cy_ in items:
    if any(sp is q for q in SH_SPR):
        w=sp.width*0.78; hh=max(4,w*0.26); cxs=cx_+sp.width*0.06; cys=cy_-hh*0.15
        sd.ellipse((cxs-w/2,cys-hh/2,cxs+w/2,cys+hh/2),fill=(20,45,25,92))
img=Image.alpha_composite(img,sh)
for yb,sp,cx_,cy_ in sorted(items,key=lambda i:i[0]):
    img.alpha_composite(sp,(int(cx_-sp.width/2),int(cy_-sp.height+ (TH/4*S if False else 0)*0)))
img.convert('RGB').save('mock3.png'); print(img.size)
