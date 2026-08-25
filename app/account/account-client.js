'use client';
import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

export default function AccountClient(){
 const supabase=useMemo(()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),[]);
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null);
 const [mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState('');
 const [msg,setMsg]=useState(''),[busy,setBusy]=useState(false);

 async function loadProfile(user){
   if(!user){setProfile(null);return}
   const {data}=await supabase.from('user_profiles').select('user_id,username,owner_id,role,owners(name)').eq('user_id',user.id).maybeSingle();
   setProfile(data||null);
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>{setSession(data.session);loadProfile(data.session?.user)});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);loadProfile(s?.user)});
   return()=>subscription.unsubscribe();
 },[]);

 async function submit(e){
   e.preventDefault();setBusy(true);setMsg('');
   try{
     if(mode==='signup'){
       if(username.trim().length<3)throw new Error('Username must be at least 3 characters.');
       const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username:username.trim()}}});
       if(error)throw error;
       setMsg(data.session?'Account created and signed in.':'Account created. Check your email to confirm it, then sign in.');
     }else{
       const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
     }
   }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function signOut(){await supabase.auth.signOut();setMsg('Signed out.')}
 async function reset(){if(!email)return setMsg('Enter your email first.');const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/account`});setMsg(error?error.message:'Password reset email sent.')}
 if(session)return <div className="card accountCard">
   <h2>Signed in</h2>
   <div className="accountGrid"><span>Email</span><b>{session.user.email}</b><span>Username</span><b>{profile?.username||'—'}</b><span>League team</span><b>{profile?.owners?.name||'Not assigned yet'}</b><span>Access</span><b>{profile?.role==='commissioner'?'Commissioner':'Owner'}</b></div>
   {!profile?.owner_id&&<div className="notice">Your account is ready. The commissioner still needs to assign it to your league team.</div>}
   <button className="button" onClick={signOut}>Sign Out</button>
 </div>;
 return <div className="card accountCard"><div className="authTabs"><button className={mode==='signin'?'button':'button secondary'} onClick={()=>setMode('signin')}>Sign In</button><button className={mode==='signup'?'button':'button secondary'} onClick={()=>setMode('signup')}>Create Account</button></div>
   <form onSubmit={submit} className="accountForm">{mode==='signup'&&<label>Public username<input value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={30} placeholder="Username"/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/></label><button className="button" disabled={busy}>{busy?'Working…':mode==='signup'?'Create Account':'Sign In'}</button></form>
   {mode==='signin'&&<button className="linkButton" onClick={reset}>Forgot password?</button>}{msg&&<div className="notice">{msg}</div>}
 </div>
}
