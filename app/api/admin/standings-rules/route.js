import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const s=sb();const [{data:regular,error:a},{data:waivers,error:b},{data:finals,error:c}]=await Promise.all([
  s.from('official_regular_standings').select('*').eq('season_id',1).order('official_rank'),
  s.from('official_waiver_order').select('*').eq('season_id',1).order('waiver_priority'),
  s.from('official_final_standings').select('*').eq('season_id',1).order('final_rank')
 ]);
 if(a||b||c)return NextResponse.json({ok:false,error:(a||b||c).message},{status:500});
 return NextResponse.json({ok:true,regular_rule:['Fantasy points','Point differential','Higher draft order'],waiver_rule:'Exact reverse of official regular-season standings',final_rule:['Fantasy points','Conference championship wins','Conference championship appearances','CFP teams','Most wins by a single team','Full-season point differential'],regular,waivers,finals});
}