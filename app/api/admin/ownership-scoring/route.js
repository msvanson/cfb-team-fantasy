import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const s=sb();
 const [{data:history,error:he},{data:ledger,error:le},{data:totals,error:te},{data:fullTotals,error:fte},{data:legacy,error:lge},{data:events,error:ee},{data:owners,error:oe},{data:teams,error:tde}]=await Promise.all([
  s.from('team_ownership_history').select('*').eq('season_id',1).order('owner_id').order('acquired_at'),
  s.from('ownership_game_ledger').select('*').eq('season_id',1).order('start_time'),
  s.from('ownership_owner_game_totals').select('*').eq('season_id',1),
  s.from('ownership_owner_full_totals').select('*').eq('season_id',1),
  s.from('owner_standings').select('owner_id,owner_name,fantasy_points,wins,point_differential').eq('season_id',1),
  s.from('ownership_scoring_event_ledger').select('scoring_event_id,owner_id,team_id,event_type,points,occurred_at').eq('season_id',1).order('occurred_at'),
  s.from('owners').select('id,name').eq('season_id',1),
  s.from('team_directory').select('team_id,school').eq('season_id',1)
 ]);
 if (he || le || te || fte || lge || ee || oe || tde) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Ownership scoring data temporarily unavailable'
    },
    { status: 500 }
  );
}
 const om=new Map((owners||[]).map(x=>[Number(x.id),x.name])),tm=new Map((teams||[]).map(x=>[Number(x.team_id),x.school]));
 const historyRows=(history||[]).map(h=>({...h,owner:om.get(Number(h.owner_id)),team:tm.get(Number(h.team_id))}));
 const ledgerRows=(ledger||[]).map(g=>({...g,owner:om.get(Number(g.owner_id)),team:tm.get(Number(g.team_id))}));
 const legacyMap=new Map((legacy||[]).map(x=>[Number(x.owner_id),x]));
 const comparison=(fullTotals||[]).map(x=>{const old=legacyMap.get(Number(x.owner_id))||{};return {...x,legacy_fantasy_points:Number(old.fantasy_points||0),fantasy_match:Number(x.fantasy_points||0)===Number(old.fantasy_points||0),legacy_wins:Number(old.wins||0),wins_match:Number(x.wins||0)===Number(old.wins||0),legacy_point_differential:Number(old.point_differential||0),diff_match:Number(x.point_differential||0)===Number(old.point_differential||0)}});
 return NextResponse.json({ok:true,mode:'diagnostic_only',rule:'Fantasy scoring events and game results belong to the owner at the event/game timestamp. Historical production never transfers.',ownership_periods:historyRows,game_ledger:ledgerRows,scoring_events:(events||[]).map(x=>({...x,owner:om.get(Number(x.owner_id)),team:tm.get(Number(x.team_id))})),owner_totals:(totals||[]).map(x=>({...x,owner:om.get(Number(x.owner_id))})),comparison,all_match:comparison.every(x=>x.fantasy_match&&x.wins_match&&x.diff_match)});
}
