'use client';

import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {
  RosterAvatar,
  ROSTER_COLORS,
  ROSTER_ICONS
} from '../roster-avatar';

const THEMES=[
  {key:'midnight',name:'Midnight',description:'Navy and electric blue'},
  {key:'stadium',name:'Stadium',description:'Forest green and gold'},
  {key:'crimson',name:'Crimson',description:'Deep red and silver'},
  {key:'royal',name:'Royal',description:'Royal blue and gold'}
];

const VALID_THEMES=new Set(THEMES.map(t=>t.key));

function applyTheme(themeKey){
  const theme=VALID_THEMES.has(themeKey)?themeKey:'midnight';
  document.documentElement.dataset.theme=theme;
  localStorage.setItem('cfb-theme',theme);
}

export default function PreferencesEditor({
  profile,
  onProfile,
  onMessage
}){
  const supabase=useMemo(()=>createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ),[]);
  const owner=profile?.owners;
  const [rosterName,setRosterName]=useState('');
  const [avatarKey,setAvatarKey]=useState('helmet');
  const [avatarColor,setAvatarColor]=useState('blue');
  const [busy,setBusy]=useState('');

  useEffect(()=>{
    if(owner){
      setRosterName(owner.roster_name||'');
      setAvatarKey(owner.avatar_key||'helmet');
      setAvatarColor(owner.avatar_color||'blue');
    }
    if(profile?.theme_key)applyTheme(profile.theme_key);
  },[
    owner?.roster_name,
    owner?.avatar_key,
    owner?.avatar_color,
    profile?.theme_key
  ]);

  async function patch(body){
    const {data}=await supabase.auth.getSession();
    const token=data.session?.access_token;

    if(!token){
      throw new Error(
        'Your sign-in session has expired. Please sign in again.'
      );
    }

    const response=await fetch('/api/account/preferences',{
      method:'PATCH',
      headers:{
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(body)
    });
    const result=await response.json();

    if(!response.ok){
      throw new Error(result.error||'Unable to save preferences');
    }

    return result;
  }

  async function saveIdentity(event){
    event.preventDefault();
    setBusy('identity');
    onMessage('');

    try{
      const result=await patch({
        action:'identity',
        rosterName,
        avatarKey,
        avatarColor
      });
      onProfile({
        ...profile,
        owners:result.owner
      });
      setRosterName(result.owner.roster_name||'');
      onMessage('Roster identity saved.');
    }catch(error){
      onMessage(error.message||String(error));
    }finally{
      setBusy('');
    }
  }

  async function saveTheme(themeKey){
    const previous=profile?.theme_key||'midnight';
    setBusy(`theme-${themeKey}`);
    onMessage('');
    applyTheme(themeKey);
    onProfile({...profile,theme_key:themeKey});

    try{
      await patch({action:'theme',themeKey});
      const name=THEMES.find(t=>t.key===themeKey)?.name;
      onMessage(`${name} theme saved.`);
    }catch(error){
      applyTheme(previous);
      onProfile({...profile,theme_key:previous});
      onMessage(error.message||String(error));
    }finally{
      setBusy('');
    }
  }

  const previewName=
    rosterName.trim()||
    owner?.roster_name||
    owner?.name||
    'Your Roster';

  return <>
    {profile?.owner_id&&<form
      className="identityEditor"
      onSubmit={saveIdentity}
    >
      <div className="identityEditorTitle">
        <div>
          <h2>Roster Identity</h2>
          <p>Choose how your roster appears around the league.</p>
        </div>
        <div className="identityPreview">
          <RosterAvatar
            avatarKey={avatarKey}
            avatarColor={avatarColor}
            size="lg"
          />
          <span>
            <b>{previewName}</b>
            <small>{owner?.name}</small>
          </span>
        </div>
      </div>

      <label className="identityNameField">
        Roster name
        <input
          className="field"
          value={rosterName}
          onChange={event=>setRosterName(event.target.value)}
          minLength={3}
          maxLength={30}
          placeholder={`${owner?.name||'Owner'}'s Team`}
          required
        />
      </label>

      <fieldset className="identityOptions">
        <legend>Icon</legend>
        <div className="avatarOptionGrid">
          {ROSTER_ICONS.map(icon=><button
            key={icon.key}
            type="button"
            className={
              avatarKey===icon.key
                ?'avatarOption selected'
                :'avatarOption'
            }
            onClick={()=>setAvatarKey(icon.key)}
          >
            <RosterAvatar
              avatarKey={icon.key}
              avatarColor={avatarColor}
              size="md"
            />
            <span>{icon.label}</span>
          </button>)}
        </div>
      </fieldset>

      <fieldset className="identityOptions">
        <legend>Color</legend>
        <div className="avatarColorGrid">
          {ROSTER_COLORS.map(color=><button
            key={color}
            type="button"
            className={
              avatarColor===color
                ?`avatarColorOption avatar-${color} selected`
                :`avatarColorOption avatar-${color}`
            }
            onClick={()=>setAvatarColor(color)}
            aria-label={`Choose ${color}`}
            title={color}
          />)}
        </div>
      </fieldset>

      <button
        className="button identitySave"
        disabled={busy==='identity'}
      >
        {busy==='identity'?'Saving…':'Save Roster Identity'}
      </button>
    </form>}

    <section className="themeEditor">
      <div>
        <h2>App Theme</h2>
        <p>Choose the color scheme you see on this device.</p>
      </div>
      <div className="themeOptionGrid">
        {THEMES.map(theme=><button
          key={theme.key}
          type="button"
          className={
            profile?.theme_key===theme.key
              ?`themeOption themePreview-${theme.key} selected`
              :`themeOption themePreview-${theme.key}`
          }
          onClick={()=>saveTheme(theme.key)}
          disabled={Boolean(busy)}
        >
          <span className="themeSwatches">
            <i/>
            <i/>
            <i/>
          </span>
          <b>{theme.name}</b>
          <small>{theme.description}</small>
        </button>)}
      </div>
    </section>
  </>;
}
