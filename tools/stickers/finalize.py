import pickle,glob,os,json,sys,cv2,numpy as np
from build import SHEETS,U
BANDS=[(0,222),(204,402),(384,582),(560,735),(862,1024)]
T0=['hype','laugh','eat','noodles','drink','thumbs','lift','read','think']
T1=['sleep','sleep','sleep','game','game','study','chill','chill','chill']
T2=['burger','rice','pizza','boba','party','laptop','bath','read','read']
TLR=['confused','angry','shock','cool','smug','smug','peace']
def lab(T,i,n): return T[min(len(T)-1,int((i+.5)/n*len(T)))]
def frac(c,lo,hi,smin=150,vmin=170):
    hsv=cv2.cvtColor(c['crop'],cv2.COLOR_RGB2HSV);m=c['mask']
    h=hsv[...,0];s=hsv[...,1];v=hsv[...,2]
    sel=(h>=lo)&(h<=hi)&(s>=smin)&(v>=vmin)&m
    return sel.sum()/max(1,m.sum())
def ok(c,y0,y1,last):
    if c['w']>290 or c['h']>260: return False
    if c['ar']/(c['w']*c['h'])<0.42 or c['w']/c['h']>1.85: return False
    if c['y']<=y0+1 and y0>0: return False
    if not last and c['y']+c['h']>=y1-2: return False
    return c['w']>=80 and c['h']>=70 and c['ar']>=9000


from scipy import ndimage as ndi
_SH={}
def sheet_bgr(who,si):
    k=(who,si)
    if k not in _SH:
        im=cv2.imread(U+SHEETS[who][si],cv2.IMREAD_UNCHANGED)
        if im.shape[2]==4:
            a=im[:,:,3:4]/255.0; im=(im[:,:,:3]*a+np.array([150,150,150])*(1-a)).astype(np.uint8)
        _SH[k]=im
    return _SH[k]
def refine(c,who,si):
    """Silueta drops dark clothing. Grow its mask back with GrabCut against the real sheet pixels, then add a clean white outline."""
    img=sheet_bgr(who,si); H,W=img.shape[:2]; pad=64
    x0=max(0,c['x']-pad);y0=max(0,c['y']-pad);x1=min(W,c['x']+c['w']+pad);y1=min(H,c['y']+c['h']+pad)
    crop=img[y0:y1,x0:x1].copy(); m0=np.zeros(crop.shape[:2],np.uint8)
    oy,ox=c['y']-y0,c['x']-x0; m0[oy:oy+c['h'],ox:ox+c['w']]=c['mask'].astype(np.uint8)
    # a mask with holes/notches: close it so the seed is one solid blob
    # white pixels (hair, shirt, the sticker's own white outline) are invisible to the model but are never background (it is grey)
    bgrI=crop.astype(int); wl=((bgrI.mean(2)>218)&((bgrI.max(2)-bgrI.min(2))<46)).astype(np.uint8)
    wlc=cv2.morphologyEx(wl,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
    nl,ll,stl,_=cv2.connectedComponentsWithStats(wlc,connectivity=8)
    touch=cv2.dilate(m0,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(11,11)))
    ids=np.unique(ll[(touch>0)&(wlc>0)]); ids=ids[ids>0]
    own=np.isin(ll,ids).astype(np.uint8)
    # drop white blobs that are mostly outside our neighbourhood (a neighbour's outline that happens to touch)
    own=own&cv2.dilate(m0,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(91,91)))
    seed=cv2.morphologyEx(np.maximum(m0,own),cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
    seed=ndi.binary_fill_holes(seed).astype(np.uint8)
    seed=cv2.morphologyEx(seed,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
    nl2,l2,st2,_=cv2.connectedComponentsWithStats(seed,connectivity=8)
    if nl2>2:
        best=1+int(np.argmax([(l2==k)[m0>0].sum() for k in range(1,nl2)])); seed=(l2==best).astype(np.uint8)
    gc=np.full(crop.shape[:2],cv2.GC_PR_BGD,np.uint8)
    far=cv2.dilate(seed,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(31,31)))
    gc[far==0]=cv2.GC_BGD
    gc[seed>0]=cv2.GC_PR_FGD
    gc[cv2.erode(m0,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13)))>0]=cv2.GC_FGD
    try:
        bgd=np.zeros((1,65));fgd=np.zeros((1,65))
        cv2.grabCut(crop,gc,None,bgd,fgd,4,cv2.GC_INIT_WITH_MASK)
        res=((gc==cv2.GC_FGD)|(gc==cv2.GC_PR_FGD)).astype(np.uint8)
    except cv2.error:
        res=seed
    res=cv2.morphologyEx(res,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
    res=ndi.binary_fill_holes(res).astype(np.uint8)
    res=cv2.morphologyEx(res,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
    n,lab_,st,_=cv2.connectedComponentsWithStats(res,connectivity=8)
    if n<2: res=seed
    else:
        keep=np.zeros_like(res); main=1+int(np.argmax([ (lab_==k)[m0>0].sum() for k in range(1,n)]))
        mb=st[main]
        for k in range(1,n):
            kx,ky,kw,kh,ka=st[k]
            dx=max(mb[0]-(kx+kw),kx-(mb[0]+mb[2]),0);dy=max(mb[1]-(ky+kh),ky-(mb[1]+mb[3]),0)
            if k==main or (ka>=80 and (dx*dx+dy*dy)**.5<26): keep[lab_==k]=1
        res=keep
    # keep only what is the sticker's own: never let a neighbour's pixels creep in
    res=(res&far).astype(np.uint8)
    # uniform white sticker outline under the art
    k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))
    outline=cv2.dilate(res,k)
    alpha=cv2.GaussianBlur((outline*255).astype(np.uint8),(0,0),0.9)
    art=cv2.GaussianBlur((res*255).astype(np.uint8),(0,0),0.9)/255.0
    rgb=crop.astype(np.float32)*art[...,None]+255.0*(1-art[...,None])      # art over white
    rgba=np.dstack([np.clip(rgb,0,255).astype(np.uint8),alpha])
    # completeness: a real sticker is ringed by its own white outline; a fragment cut through the body is not
    ar8=(res*255).astype(np.uint8); edge=cv2.subtract(ar8,cv2.erode(ar8,np.ones((7,7),np.uint8)))>0
    gl=crop.astype(int); whiteish=(gl.mean(2)>205)&((gl.max(2)-gl.min(2))<55)
    ring=float((edge&whiteish).sum())/max(1,int(edge.sum()))
    ys,xs=np.where(alpha>10)
    c['ring']=ring; c['fill']=float(res.sum())/max(1,(res.shape[0]*res.shape[1]))
    return rgba[ys.min():ys.max()+1,xs.min():xs.max()+1]

ROWB={'std':[210,395,578,745,855],'asta':[235,430,620,812]}
def row_of(c,who):
    cy=c['y']+c['h']/2
    B=ROWB['asta'] if who=='asta' else ROWB['std']
    if who=='asta':
        for i,t in enumerate(B):
            if cy<t: return i
        return 4
    if cy<B[0]: return 0
    if cy<B[1]: return 1
    if cy<B[2]: return 2
    if cy<B[3]: return 3
    if cy>=B[4]: return 4
    return None
def iou(a,b):
    x0=max(a['x'],b['x']);y0=max(a['y'],b['y']);x1=min(a['x']+a['w'],b['x']+b['w']);y1=min(a['y']+a['h'],b['y']+b['h'])
    i=max(0,x1-x0)*max(0,y1-y0);u=a['w']*a['h']+b['w']*b['h']-i
    return i/u if u else 0
out=sys.argv[1]; man={}; METRICS=[]
for who,files in SHEETS.items():
    cs=[]
    for si in range(len(files)):
        for tag in ('','2'):
            p=f'/home/claude/cand{tag}_{who}_{si}.pkl'
            if not os.path.exists(p): continue
            for c in pickle.load(open(p,'rb')):
                bands=c.get('bands',BANDS); y0,y1=bands[c['band']]
                last=c['band']==len(bands)-1
                if ok(c,y0,y1,last): c['sheet']=si; cs.append(c)
    # global NMS across passes (prefer the more complete = larger area)
    cs.sort(key=lambda c:-c['ar']); keep=[]
    for c in cs:
        if all(k['sheet']!=c['sheet'] or iou(k,c)<0.3 for k in keep): keep.append(c)
    cs=[]
    for c in keep:
        r=row_of(c,who)
        if r is not None: c['row']=r; cs.append(c)
    if not cs: continue
    os.makedirs(f'{out}/{who}',exist_ok=True)
    bybs={}
    for c in cs: bybs.setdefault((c['sheet'],c['row']),[]).append(c)
    for (si,b),lst in bybs.items():
        lst.sort(key=lambda c:c['x']); n=len(lst)
        if b==4:
            cry=max(lst,key=lambda c:frac(c,85,110)); love=max(lst,key=lambda c:frac(c,160,175))
            rest=[c for c in lst if c is not cry and c is not love]
            for i,c in enumerate(rest): c['cat']=lab(TLR,i,len(rest))
            cry['cat']='cry' if frac(cry,85,110)>0.01 else 'shock'
            love['cat']='love' if frac(love,160,175)>0.01 else 'cool'
        elif b==3: 
            for c in lst: c['cat']='sport' if who=='asta' else 'power'
        else:
            for i,c in enumerate(lst): c['cat']=[T0,T1,T2][b][min(8,int((i+.5)/n*9))]
    counts={};lst=[]
    for c in sorted(cs,key=lambda c:(c['sheet'],c['row'],c['x'])):
        k=counts.get(c['cat'],0);counts[c['cat']]=k+1
        name=f"{c['cat']}-{k}"
        img=refine(c,who,c['sheet'])
        if c['row']==4 and img.shape[1]/img.shape[0]>1.4: counts[c['cat']]-=1; continue
        s=224/max(img.shape[:2])
        if s<1: img=cv2.resize(img,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'{out}/{who}/{name}.webp',img,[cv2.IMWRITE_WEBP_QUALITY,86])
        lst.append((c['cat'],name,img.shape[1],img.shape[0]))
        METRICS.append(dict(who=who,name=name,cat=c['cat'],row=c['row'],ring=round(c['ring'],3),w=int(img.shape[1]),h=int(img.shape[0]),area=int(c['ar'])))
    m={}
    for cat,name,w,h in lst: m.setdefault(cat,[]).append([name,w,h])
    man[who]=m; print(who,len(lst))
json.dump(man,open(f'{out}/manifest.json','w'),separators=(',',':'))
json.dump(METRICS,open(f'{out}/metrics.json','w'))
