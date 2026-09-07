import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const dynamic='force-dynamic';

const ICONS=new Set([
  'helmet',
  'football',
  'trophy',
  'stadium',
  'playbook',
  'megaphone',
  'goalpost',
  'star'
]);

const COLORS=new Set([
  'blue',
  'green',
  'red',
  'gold',
  'purple',
  'orange',
  'teal',
  'slate'
]);

const THEMES=new Set([
  'midnight',
  'stadium',
  'crimson',
  'royal'
]);

const sb=()=>createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false
    }
  }
);

async function signedInProfile(req,supabase){
  const token=(req.headers.get('authorization')||'')
    .replace(/^Bearer\s+/,'');

  if(!token)return null;

  const {
    data:{user},
    error:userError
  }=await supabase.auth.getUser(token);

  if(userError||!user)return null;

  const {data:profile,error:profileError}=await supabase
    .from('user_profiles')
    .select('user_id,owner_id,theme_key')
    .eq('user_id',user.id)
    .maybeSingle();

  if(profileError||!profile)return null;
  return profile;
}

export async function PATCH(req){
  const supabase=sb();
  const profile=await signedInProfile(req,supabase);

  if(!profile){
    return NextResponse.json(
      {ok:false,error:'Unauthorized'},
      {status:401}
    );
  }

  let body;

  try{
    body=await req.json();
  }catch{
    return NextResponse.json(
      {ok:false,error:'Invalid request'},
      {status:400}
    );
  }

  if(body?.action==='theme'){
    const themeKey=String(body?.themeKey||'');

    if(!THEMES.has(themeKey)){
      return NextResponse.json(
        {ok:false,error:'Choose a valid theme'},
        {status:400}
      );
    }

    const {data,error}=await supabase
      .from('user_profiles')
      .update({
        theme_key:themeKey,
        updated_at:new Date().toISOString()
      })
      .eq('user_id',profile.user_id)
      .select('theme_key')
      .single();

    if(error){
      return NextResponse.json(
        {ok:false,error:'Unable to save theme'},
        {status:500}
      );
    }

    return NextResponse.json({
      ok:true,
      themeKey:data.theme_key
    });
  }

  if(body?.action!=='identity'){
    return NextResponse.json(
      {ok:false,error:'Invalid preference action'},
      {status:400}
    );
  }

  if(!profile.owner_id){
    return NextResponse.json(
      {ok:false,error:'Your account is not assigned to a roster'},
      {status:409}
    );
  }

  const rosterName=String(body?.rosterName||'').trim();
  const avatarKey=String(body?.avatarKey||'');
  const avatarColor=String(body?.avatarColor||'');

  if(rosterName.length<3||rosterName.length>30){
    return NextResponse.json(
      {ok:false,error:'Roster name must be 3–30 characters'},
      {status:400}
    );
  }

  if(!ICONS.has(avatarKey)||!COLORS.has(avatarColor)){
    return NextResponse.json(
      {ok:false,error:'Choose a valid roster icon and color'},
      {status:400}
    );
  }

  const {data,error}=await supabase
    .from('owners')
    .update({
      roster_name:rosterName,
      avatar_key:avatarKey,
      avatar_color:avatarColor,
      identity_updated_at:new Date().toISOString()
    })
    .eq('id',profile.owner_id)
    .eq('season_id',1)
    .select('id,name,roster_name,avatar_key,avatar_color')
    .maybeSingle();

  if(error?.code==='23505'){
    return NextResponse.json(
      {ok:false,error:'That roster name is already taken'},
      {status:409}
    );
  }

  if(error){
    return NextResponse.json(
      {ok:false,error:'Unable to save roster identity'},
      {status:500}
    );
  }

  if(!data){
    return NextResponse.json(
      {ok:false,error:'Assigned roster was not found'},
      {status:404}
    );
  }

  return NextResponse.json({
    ok:true,
    owner:data
  });
}
