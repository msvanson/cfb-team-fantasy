import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const s=sb();const [{data:profiles,error:p},{data:owners,error:o}]=await Promise.all([s.from('user_profiles').select('user_id,username,owner_id,role,created_at').order('created_at'),s.from('owners').select('id,name,draft_slot').eq('season_id',1).order('draft_slot')]);
 if (p || o) {
  return NextResponse.json(
    { ok: false, error: 'Account data temporarily unavailable' },
    { status: 500 }
  );
}
 const {data:{users},error:u}=await s.auth.admin.listUsers({page:1,perPage:100});
 if (u) {
  return NextResponse.json(
    { ok: false, error: 'Account data temporarily unavailable' },
    { status: 500 }
  );
}
 const email=new Map(users.map(x=>[x.id,x.email]));
 return NextResponse.json({ok:true,profiles:(profiles||[]).map(x=>({...x,email:email.get(x.user_id)||''})),owners:owners||[]});
}
export async function POST(req){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const {user_id,owner_id,role}=await req.json();if(!user_id)return NextResponse.json({ok:false,error:'user_id required'},{status:400});
 const s=sb();const patch={owner_id:owner_id?Number(owner_id):null};if(role)patch.role=role;
 const {error}=await s.from('user_profiles').update(patch).eq('user_id',user_id);
 if (error) {
  return NextResponse.json(
    { ok: false, error: 'Unable to update account right now' },
    { status: 400 }
  );
}
 return NextResponse.json({ok:true});
}
