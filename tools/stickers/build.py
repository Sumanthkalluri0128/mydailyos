import cv2, numpy as np, json, os, sys
from scipy import ndimage as ndi
U='/mnt/user-data/uploads/'
SHEETS={
 'asta':['Chibi_Anime_Adventure_Sticker_Sheet.png'],
 'luffy':["Chibi_Luffy_s_Ultimate_Sticker_Sheet.png"],
 'naruto':['Naruto_Chibi_Sticker_Pack.png','Chibi_Naruto_Sticker_Sheet_Extravaganza.png'],
 'jinwoo':['Sung_Jin-Woo_Chibi_Sticker_Collection.png'],
 'goku':['Kid_Goku_Chibi_Sticker_Sheet.png'],
 'kakashi':['Kakashi_Chibi_Sticker_Sheet.png'],
 'zoro':['Chibi_Zoro_Sticker_Collection.png'],
 'gojo':["Gojo_s_Ultimate_Anime_Sticker_Sheet.png"],
 'tanjiro':['Tanjiro_Kamado_Chibi_Sticker_Collage.png'],
 'killua':['Killua_Chibi_Sticker_Collection.png'],
 'vegeta':['Vegeta_Anime_Chibi_Sticker_Sheet.png'],
 'zenitsu':['Zenitsu_Anime_Sticker_Sheet_Collage.png'],
 'bakugo':['Bakugo_Explosive_Chibi_Sticker_Sheet.png'],
}
# template labels per row (fractions of the row's width map onto these)
T0=['hype','laugh','eat','noodles','drink','thumbs','lift','read','think']
T1=['sleep','sleep','sleep','game','game','study','chill','chill','chill']
T2=['burger','rice','pizza','boba','party','laptop','bath','read','read']
TL=['confused','angry','shock','cry','love','cool','smug','smug','smug','think','peace']
def comps(path):
    im=cv2.imread(path,cv2.IMREAD_UNCHANGED)
    if im.shape[2]==4:
        rgb=im[:,:,:3]; w=(im[:,:,3]>128).astype(np.uint8)
    else:
        rgb=im; i=rgb.astype(int); lum=i.mean(2); sat=i.max(2)-i.min(2)
        w=((lum>238)&(sat<30)).astype(np.uint8)
    c=cv2.morphologyEx(w,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(11,11)))
    n,lab_,st,_=cv2.connectedComponentsWithStats(c,connectivity=8)
    K=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(25,25))
    E3=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))
    pieces=[]
    for k in range(1,n):
        x,y,ww,hh,ar=st[k]
        if ar<300 or ww<12 or hh<12: continue
        pad=14
        x0,y0=max(0,x-pad),max(0,y-pad);x1,y1=min(c.shape[1],x+ww+pad),min(c.shape[0],y+hh+pad)
        sub=(lab_[y0:y1,x0:x1]==k).astype(np.uint8)
        sub=cv2.morphologyEx(sub,cv2.MORPH_CLOSE,K)
        sub=ndi.binary_fill_holes(sub).astype(np.uint8)
        sub=cv2.erode(sub,E3)
        m=np.zeros(c.shape,np.uint8); m[y0:y1,x0:x1]=sub
        pieces.append([x,y,ww,hh,int(sub.sum()),m])
    big=[p for p in pieces if p[4]>=9000]
    small=[p for p in pieces if p[4]<9000]
    for sm in small:
        sx,sy,sw,sh=sm[:4]; best=None;bd=50
        for b in big:
            bx,by,bw,bh=b[:4]
            dx=max(bx-(sx+sw),sx-(bx+bw),0);dy=max(by-(sy+sh),sy-(by+bh),0)
            d=(dx*dx+dy*dy)**.5
            if d<bd: bd=d;best=b
        if best is not None: best[5]=np.maximum(best[5],sm[5])
    out=[]
    for p in big:
        ys,xs=np.where(p[5]>0); x,y,ww,hh=xs.min(),ys.min(),xs.max()-xs.min()+1,ys.max()-ys.min()+1
        if ww>520 or hh>330 or ww<70 or hh<70: continue
        out.append((x,y,ww,hh,p[5]>0))
    return rgb,out
def rows(items):
    items=sorted(items,key=lambda t:t[1]+t[3]/2)
    R=[];cur=[items[0]]
    for t in items[1:]:
        if abs((t[1]+t[3]/2)-np.mean([c[1]+c[3]/2 for c in cur]))<75: cur.append(t)
        else: R.append(cur);cur=[t]
    R.append(cur)
    return [sorted(r,key=lambda t:t[0]) for r in R]
def lab(T,i,n): return T[min(len(T)-1,int((i+.5)/n*len(T)))]
def save(rgb,t,path,maxs=256):
    x,y,w,h,m=t
    p=6
    x0,y0=max(0,x-p),max(0,y-p);x1,y1=min(rgb.shape[1],x+w+p),min(rgb.shape[0],y+h+p)
    a=cv2.GaussianBlur((m[y0:y1,x0:x1]*255).astype(np.uint8),(0,0),0.9)
    crop=rgb[y0:y1,x0:x1].copy()
    # tight bbox of alpha
    ys,xs=np.where(a>8); crop=crop[ys.min():ys.max()+1,xs.min():xs.max()+1]; a=a[ys.min():ys.max()+1,xs.min():xs.max()+1]
    out=np.dstack([crop,a])
    s=maxs/max(out.shape[:2])
    if s<1: out=cv2.resize(out,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    cv2.imwrite(path,out,[cv2.IMWRITE_WEBP_QUALITY,88])
    return out.shape[1],out.shape[0]
if __name__=='__main__':
    dest=sys.argv[1]; os.makedirs(dest,exist_ok=True)
    man={}
    for who,files in SHEETS.items():
        os.makedirs(f'{dest}/{who}',exist_ok=True); lst=[]
        for si,f in enumerate(files):
            rgb,items=comps(U+f)
            if not items: print('NONE',f); continue
            R=rows(items)
            # classify: rows 0..2 & last by template; middle rows by shape (wide card => scene, else power/sport)
            for ri,r in enumerate(R):
                last=(ri==len(R)-1)
                for ci,t in enumerate(r):
                    ar=t[2]/t[3]
                    if ri==0: c=lab(T0,ci,len(r))
                    elif ri==1: c=lab(T1,ci,len(r))
                    elif ri==2: c=lab(T2,ci,len(r))
                    elif last: c=lab(TL,ci,len(r))
                    else: c='scene' if ar>1.45 else ('power' if ri==3 else 'sport')
                    name=f's{si}r{ri}c{ci}'
                    w,h=save(rgb,t,f'{dest}/{who}/{name}.webp')
                    lst.append({'f':name,'c':c,'w':w,'h':h})
        man[who]=lst
        print(who,len(lst))
    json.dump(man,open(f'{dest}/manifest.json','w'),separators=(',',':'))
