import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const s=sb();
 const [{data:history,error:he},{data:ledger,error:le},{data:totals,error:te},{data:owners,error:oe},{data:teams,error:tde}]=await Promise.all([
  s.from('team_ownership_history').select('*').eq('season_id',1).order('owner_id').order('acquired_at'),
  s.from('ownership_game_ledger').select('*').eq('season_id',1).order('start_time'),
  s.from('ownership_owner_game_totals').select('*').eq('season_id',1),
  s.from('owners').select('id,name').eq('season_id',1),
  s.from('team_directory').select('team_id,school').eq('season_id',1)
 ]);
 if(he||le||te||oe||tde)return NextResponse.json({ok:false,error:(he||le||te||oe||tde).message},{status:500});
 const om=new Map((owners||[]).map(x=>[Number(x.id),x.name])),tm=new Map((teams||[]).map(x=>[Number(x.team_id),x.school]));
 const historyRows=(history||[]).map(h=>({...h,owner:om.get(Number(h.owner_id)),team:tm.get(Number(h.team_id))}));
 const ledgerRows=(ledger||[]).map(g=>({...g,owner:om.get(Number(g.owner_id)),team:tm.get(Number(g.team_id))}));
 return NextResponse.json({ok:true,mode:'diagnostic_only',rule:'A game belongs to the owner who owned the team at kickoff. Historical production never transfers.',ownership_periods:historyRows,game_ledger:ledgerRows,owner_totals:(totals||[]).map(x=>({...x,owner:om.get(Number(x.owner_id))}))});
}
