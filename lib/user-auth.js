import {createClient} from '@supabase/supabase-js';

function adminClient(){
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}}
  );
}

export async function authenticatedProfileFromRequest(req){
  const header=req.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return {ok:false,status:401,error:'Sign in required'};

  const sb=adminClient();
  const {data:{user},error:userError}=await sb.auth.getUser(token);
  if(userError||!user)return {ok:false,status:401,error:'Invalid or expired session'};

  const {data:profile,error:profileError}=await sb
    .from('user_profiles')
    .select('user_id,username,owner_id,role')
    .eq('user_id',user.id)
    .maybeSingle();

  if(profileError)return {ok:false,status:500,error:profileError.message};
  if(!profile)return {ok:false,status:403,error:'Account profile not found'};

  return {ok:true,user,profile};
}

export async function requireOwner(req,ownerId){
  const auth=await authenticatedProfileFromRequest(req);
  if(!auth.ok)return auth;
  if(auth.profile.role==='commissioner')return auth;
  if(!auth.profile.owner_id)return {ok:false,status:403,error:'Your account is not assigned to a league team'};
  if(Number(auth.profile.owner_id)!==Number(ownerId))return {ok:false,status:403,error:'You can only manage your own team'};
  return auth;
}

export async function requireCommissioner(req){
  const auth=await authenticatedProfileFromRequest(req);
  if(!auth.ok)return auth;
  if(auth.profile.role!=='commissioner')return {ok:false,status:403,error:'Commissioner access required'};
  return auth;
}
