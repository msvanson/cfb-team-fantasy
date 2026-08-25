'use client';
import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

export default function AccountClient(){
 const supabase=useMemo(()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),[]);
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null);
 const [mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[username,setUsername]=useState('');
 const [msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[recovering,setRecovering]=useState(false),[newPassword,setNewPassword]=useState('');

 async function loadProfile(user){
   if(!user){setProfile(null);return}
   const {data}=await supabase.from('user_profiles').select('user_id,username,owner_id,role,owners(name)').eq('user_id',user.id).maybeSingle();
   setProfile(data||null);
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>{setSession(data.session);loadProfile(data.session?.user)});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);loadProfile(s?.user);if(event==='PASSWORD_RECOVERY')setRecovering(true)});
   return()=>subscription.unsubscribe();
 },[]);

 async function submit(e){
   e.preventDefault();setBusy(true);setMsg('');
   try{
     if(mode==='signup'){
       const cleanUsername=username.trim();
       if(cleanUsername.length<3||cleanUsername.length>30)throw new Error('Username must be 3–30 characters.');
       if(!/^[A-Za-z0-9_.-]+$/.test(cleanUsername))throw new Error('Username can only contain letters, numbers, underscores (_), periods (.), and hyphens (-). Spaces are not allowed.');
       const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username:cleanUsername}}});
       if(error)throw error;
       setMsg(data.session?'Account created and signed in.':'Account created. Check your email to confirm it, then sign in.');
     }else{
       const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
     }
   }catch(e){setMsg(e.message||String(e))}finally{setBusy(false)}
 }
 async function signOut(){await fetch('/api/auth/commissioner-session',{method:'DELETE'});await supabase.auth.signOut();setRecovering(false);setMsg('Signed out.')}
 async function reset(){if(!email)return setMsg('Enter your email first.');const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/account`});setMsg(error?error.message:'Password reset email sent.')}
 async function updatePassword(e){e.preventDefault();setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error)return setMsg(error.message);setRecovering(false);setNewPassword('');setMsg('Password updated successfully.');}
 async function openCommissioner(){
   const {data}=await supabase.auth.getSession();const token=data.session?.access_token;
   if(!token)return setMsg('Your sign-in session has expired. Please sign in again.');
   setBusy(true);const r=await fetch('/api/auth/commissioner-session',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const j=await r.json();setBusy(false);
   if(!r.ok)return setMsg(j.error||'Commissioner access failed');
   location.href='/admin';
 }
 if(session)return <div className="card accountCard">
   <h2>Signed in</h2>
   <div className="accountGrid"><span>Email</span><b>{session.user.email}</b><span>Username</span><b>{profile?.username||'—'}</b><span>League team</span><b>{profile?.owners?.name||'Not assigned yet'}</b><span>Access</span><b>{profile?.role==='commissioner'?'Commissioner':'Owner'}</b></div>
   {!profile?.owner_id&&<div className="notice">Your account is ready. The commissioner still needs to assign it to your league team.</div>}
   {recovering?<form onSubmit={updatePassword} className="accountForm"><h3>Choose a new password</h3><label>New password<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={6} required/></label><button className="button" disabled={busy}>Update Password</button></form>:null}
   <div className="accountActions">{profile?.role==='commissioner'?<button className="button" onClick={openCommissioner} disabled={busy}>Open Commissioner Admin</button>:null}<button className="button secondary" onClick={signOut}>Sign Out</button></div>
   {msg&&<div className="notice">{msg}</div>}
 </div>;
 return <div className="card accountCard"><div className="authTabs"><button className={mode==='signin'?'button':'button secondary'} onClick={()=>setMode('signin')}>Sign In</button><button className={mode==='signup'?'button':'button secondary'} onClick={()=>setMode('signup')}>Create Account</button></div>
   <form onSubmit={submit} className="accountForm">{mode==='signup'&&<label>Public username<input value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.-]+" title="Letters, numbers, underscores, periods, and hyphens only. No spaces." placeholder="Username"/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/></label><button className="button" disabled={busy}>{busy?'Working…':mode==='signup'?'Create Account':'Sign In'}</button></form>
   {mode==='signin'&&<button className="linkButton" onClick={reset}>Forgot password?</button>}{msg&&<div className="notice">{msg}</div>}
 </div>
}
