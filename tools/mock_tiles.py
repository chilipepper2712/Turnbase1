import numpy as np, sys
from PIL import Image
S=3; TW,TH=96,48; N=128; PER=2.0
names=['grass','grassB','dirt','forest','rock','swamp']
src={'grass':'grassA','grassB':'grassB','dirt':'dirt','forest':'forest','rock':'rock','swamp':'swamp'}
tex={}
for k,f in src.items():
    im=Image.open(f+'.png').convert('RGB').resize((N,N),Image.BOX)
    im=im.quantize(24,method=Image.Quantize.MEDIANCUT).convert('RGB')
    tex[k]=np.array(im)
W,H=11,9
# terrain map
m=[['grass']*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        t='grass'
        if x+y in (7,8) and 2<=x<=8: t='dirt'
        if 7<=x<=10 and 0<=y<=3: t='forest'
        if 0<=x<=2 and 5<=y<=8: t='rock'
        if 3<=x<=5 and 0<=y<=2: t='swamp'
        if 5<=x<=6 and 5<=y<=7: t='grassB'
        m[y][x]=t
# canvas bounds in world px
def t2w(x,y): return ((x-y)*TW/2,(x+y)*TH/2)
corners=[t2w(-.5,-.5),t2w(W-.5,-.5),t2w(W-.5,H-.5),t2w(-.5,H-.5)]
minx=min(c[0] for c in corners);maxx=max(c[0] for c in corners)
miny=min(c[1] for c in corners);maxy=max(c[1] for c in corners)
OW=int((maxx-minx)*S);OH=int((maxy-miny)*S)
sx,sy=np.meshgrid(np.arange(OW),np.arange(OH))
wx=sx/S+minx; wy=sy/S+miny
x=(wy/(TH/2)+wx/(TW/2))/2; y=(wy/(TH/2)-wx/(TW/2))/2
cx=np.round(x).astype(int); cy=np.round(y).astype(int)
inside=(cx>=0)&(cx<W)&(cy>=0)&(cy<H)
fx=x-cx; fy=y-cy
tid=np.full((OH,OW),-1)
terr=list(tex.keys())
def hash2(a,b):
    h=(a*374761393+b*668265263)&0xffffffff
    h=((h^(h>>13))*1274126177)&0xffffffff
    return ((h^(h>>16))&0xffff)/65535.0
bx=np.floor(wx/1.0).astype(int); by=np.floor(wy/1.0).astype(int)
noise=hash2(bx//2,by//2)  # coarse noise for dithering
tmap=np.zeros((OH,OW),dtype=int)
for i in range(OH):
    pass
# vectorised: pick terrain index per pixel with border dithering
idx={k:i for i,k in enumerate(terr)}
base=np.zeros((OH,OW),int)
cxc=np.clip(cx,0,W-1);cyc=np.clip(cy,0,H-1)
M=np.array([[idx[m[j][i]] for i in range(W)] for j in range(H)])
base=M[cyc,cxc]
ax=np.abs(fx);ay=np.abs(fy)
horiz=ax>=ay
d=0.5-np.maximum(ax,ay)
nx=np.clip(cx+np.where(horiz,np.sign(fx).astype(int),0),0,W-1)
ny=np.clip(cy+np.where(horiz,0,np.sign(fy).astype(int)),0,H-1)
nb=M[ny,nx]
band=0.16
p=0.5*(1-np.clip(d/band,0,1))
use_nb=(d<band)&(noise<p)
sel=np.where(use_nb,nb,base)
out=np.zeros((OH,OW,3),np.uint8)
out[:]=(233,231,222)
u=((x/PER)%1.0)*N; v=((y/PER)%1.0)*N
ui=np.floor(u).astype(int)%N; vi=np.floor(v).astype(int)%N
for k,i in idx.items():
    mk=(sel==i)&inside
    out[mk]=tex[k][vi[mk],ui[mk]]
img=Image.fromarray(out)
# overlay: grid + move range + sprites
from PIL import ImageDraw
ov=Image.new('RGBA',img.size,(0,0,0,0)); dr=ImageDraw.Draw(ov)
def diamond(tx,ty,fill=None,outline=None):
    c=t2w(tx,ty); cxp=(c[0]-minx)*S; cyp=(c[1]-miny)*S
    pts=[(cxp,cyp-TH/2*S),(cxp+TW/2*S,cyp),(cxp,cyp+TH/2*S),(cxp-TW/2*S,cyp)]
    dr.polygon(pts,fill=fill,outline=outline)
for ty in range(H):
    for tx in range(W): diamond(tx,ty,outline=(120,118,105,72))
for ty in range(H):
    for tx in range(W):
        if abs(tx-5)+abs(ty-4)<=3 and (tx,ty)!=(5,4): diamond(tx,ty,fill=(60,120,220,70),outline=(40,90,200,170))
for tx,ty in [(6,2),(3,6)]: diamond(tx,ty,fill=(220,70,60,80),outline=(200,40,40,200))
img=Image.alpha_composite(img.convert('RGBA'),ov)
def sprite(path,tx,ty,hpx=62):
    s=Image.open(path).convert('RGBA'); r=hpx*S/s.height
    s=s.resize((int(s.width*r),int(hpx*S)),Image.NEAREST)
    c=t2w(tx,ty); X=int((c[0]-minx)*S-s.width/2); Y=int((c[1]-miny)*S+TH/4*S-s.height)
    img.alpha_composite(s,(X,Y))
A='/home/user/Turnbase1/assets/units/'
for (tx,ty,f) in [(3,6,'orc_infantry.png'),(6,2,'orc_archer.png'),(5,4,'human_infantry.png'),(4,4,'human_archer.png'),(7,1,'orc_goblin.png'),(5,3,'human_cavalry.png')]:
    sprite(A+f,tx,ty,70 if 'cav' in f else 62)
img.convert('RGB').save('mock.png')
print(img.size)
