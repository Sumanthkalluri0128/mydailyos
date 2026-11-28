import cv2,numpy as np,sys,os,pickle
from rembg import new_session, remove
from PIL import Image
sys.path.insert(0,'.')
from build import SHEETS,U
BANDS=[(0,222),(204,402),(384,582),(560,735),(862,1024)]   # last = expressions; 560-735 = power row
BANDS2=[(0,236),(180,420),(350,600),(545,760),(845,1024)]
ASTA2=[(0,250),(215,450),(410,640),(600,835),(790,1024)]
ASTA=[(0,235),(235,430),(430,620),(620,812),(812,1024)]
WIN=300;STRIDE=90
ORDER=['bakugo','killua','goku','vegeta','kakashi','asta','luffy','tanjiro']
def run(who,si,f):
    s=new_session('silueta')
    im=cv2.imread(U+f,cv2.IMREAD_UNCHANGED)
    if im.shape[2]==4:
        a=im[:,:,3:4]/255.0; rgb=(im[:,:,:3]*a+np.array([150,150,150])*(1-a)).astype(np.uint8)
    else: rgb=im
    H,W=rgb.shape[:2];cands=[]
    BANDS_=(ASTA2 if who=='asta' else BANDS2) if os.environ.get('PASS2') else (ASTA if who=='asta' else BANDS)
    for bi,(y0,y1) in enumerate(BANDS_):
        for x0 in range(-40,W-WIN+60,STRIDE):
            xa=max(0,x0);xb=min(W,x0+WIN)
            if xb-xa<200: continue
            crop=cv2.cvtColor(rgb[y0:y1,xa:xb],cv2.COLOR_BGR2RGB)
            ch,cw=crop.shape[:2]
            big=cv2.resize(crop,None,fx=2,fy=2,interpolation=cv2.INTER_CUBIC)
            m=np.array(remove(Image.fromarray(big),session=s,only_mask=True))
            m=cv2.resize(m,(cw,ch))>128
            n,lab,st,_=cv2.connectedComponentsWithStats(m.astype(np.uint8))
            if n<2: continue
            main=1+int(np.argmax(st[1:,4]))
            x,y,w,h,ar=st[main]
            if ar<7000 or w>285: continue
            grp=(lab==main)
            # pull in nearby small pieces (sparkles, hearts, effect marks) that belong to this sticker
            for k in range(1,n):
                if k==main or st[k][4]<60: continue
                kx,ky,kw,kh,_=st[k]
                if kx<=1 or kx+kw>=cw-1: continue
                dx=max(x-(kx+kw),kx-(x+w),0);dy=max(y-(ky+kh),ky-(y+h),0)
                if (dx*dx+dy*dy)**.5<22: grp|=(lab==k)
            ys,xs=np.where(grp);x,y,w,h=xs.min(),ys.min(),xs.max()-xs.min()+1,ys.max()-ys.min()+1
            if x<=1 or x+w>=cw-1: continue
            cands.append(dict(bands=BANDS_,band=bi,x=xa+x,y=y0+y,w=int(w),h=int(h),ar=int(grp.sum()),mask=grp[y:y+h,x:x+w],crop=crop[y:y+h,x:x+w].copy()))
    # NMS
    cands.sort(key=lambda c:-c['ar']);keep=[]
    for c in cands:
        cx=c['x']+c['w']/2;cy=c['y']+c['h']/2
        if all(abs(cx-(k['x']+k['w']/2))>c['w']*0.45 or abs(cy-(k['y']+k['h']/2))>c['h']*0.45 or k['band']!=c['band'] for k in keep): keep.append(c)
    keep.sort(key=lambda c:(c['band'],c['x']))
    pickle.dump(keep,open(f'/home/claude/cand{os.environ.get("PASS2","")}_{who}_{si}.pkl','wb'))
    print(who,si,len(keep),flush=True)
if __name__=='__main__':
    jobs=[(w,i,f) for w,fs in SHEETS.items() for i,f in enumerate(fs)]
    k=int(sys.argv[1]);n=int(sys.argv[2])
    for j,job in enumerate(jobs):
        if j%n==k and job[0] in ORDER and not os.path.exists(f'/home/claude/cand{os.environ.get("PASS2","")}_{job[0]}_{job[1]}.pkl'): run(*job)
