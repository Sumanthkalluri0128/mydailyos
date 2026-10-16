import pickle,glob,os,json,sys,cv2,numpy as np
from build import SHEETS
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
out=sys.argv[1]; man={}
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
        a=cv2.GaussianBlur((c['mask']*255).astype(np.uint8),(0,0),0.8)
        img=np.dstack([cv2.cvtColor(c['crop'],cv2.COLOR_RGB2BGR),a])
        ys,xs=np.where(a>10);img=img[ys.min():ys.max()+1,xs.min():xs.max()+1]
        s=224/max(img.shape[:2])
        if s<1: img=cv2.resize(img,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'{out}/{who}/{name}.webp',img,[cv2.IMWRITE_WEBP_QUALITY,86])
        lst.append((c['cat'],name,img.shape[1],img.shape[0]))
    m={}
    for cat,name,w,h in lst: m.setdefault(cat,[]).append([name,w,h])
    man[who]=m; print(who,len(lst))
json.dump(man,open(f'{out}/manifest.json','w'),separators=(',',':'))
