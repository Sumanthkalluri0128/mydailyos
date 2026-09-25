import {useEffect,useState} from 'react';
import {API_URL} from '../config';
import AuthPage from '../pages/AuthPage';

export default function AuthGate({children}){
  const [ready,setReady]=useState(false);const [user,setUser]=useState(null);
  useEffect(()=>{
    const token=localStorage.getItem('mydailyos_token');
    if(!token){setReady(true);return;}
    const original=window.fetch;
    window.fetch=(input,init={})=>{const h=new Headers(init.headers||{});h.set('Authorization',`Bearer ${token}`);return original(input,{...init,headers:h}).then(r=>{if(r.status===401){localStorage.removeItem('mydailyos_token');localStorage.removeItem('mydailyos_user');window.location.reload();}return r;});};
    fetch(`${API_URL}/api/account/me`).then(r=>r.ok?r.json():Promise.reject()).then(d=>{setUser(d.user);localStorage.setItem('mydailyos_user',JSON.stringify(d.user));}).catch(()=>{localStorage.removeItem('mydailyos_token');localStorage.removeItem('mydailyos_user');}).finally(()=>setReady(true));
    return()=>{window.fetch=original;};
  },[]);
  if(!ready)return <div className="auth-loading">Loading MyDailyOS…</div>;
  if(!user)return <AuthPage onAuthenticated={(u)=>{setUser(u);window.location.reload();}}/>;
  return children;
}
