import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
const sb=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
function legalDrops(roster,target){const counts=new Map();for(const t of roster)counts.set(t.conference_code,(counts.get(t.conference_code)||0)+1);const doubled=new Set([...counts].filter(([,n])=>n>1).map(([c])=>c));return roster.filter(t=>t.conference_code===target.conference_code||doubled.has(t.conference_code));}
function period(){const w=[['W1','2026-09-07T23:59:00-04:00'],['W2','2026-09-13T23:59:00-04:00'],['W3','2026-09-20T23:59:00-04:00'],['W4','2026-09-27T23:59:00-04:00'],['W5','2026-10-04T23:59:00-04:00'],['W6','2026-10-11T23:59:00-04:00'],['W7','2026-10-18T23:59:00-04:00'],['W8','2026-10-25T23:59:00-04:00'],['W9','2026-11-01T23:59:00-05:00'],['W10','2026-11-08T23:59:00-05:00'],['W11','2026-11-15T23:59:00-05:00'],['W12','2026-11-22T23:59:00-05:00'],['W13','2026-11-29T23:59:00-05:00']];return w.find(x=>new Date(x[1]).getTime()>Date.now())?.[0]||'CLOSED';}
export async function POST(req){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const body=await req.json().catch(()=>({}));if(body.confirm!=='EXECUTE')return NextResponse.json({ok:false,error:'Confirmation required'},{status:400});
 const s=sb(),key=period();if(key==='CLOSED')return NextResponse.json({ok:false,error:'Waivers are closed.'},{status:400});
 const [{data:claims,error:ce},{data:teams,error:te},{data:standings,error:se}]=await Promise.all([
  s.from('waiver_claims').select('*').eq('season_id',1).eq('waiver_period_key',key).eq('status','pending').order('priority'),
  s.from('team_directory').select('*').eq('season_id',1),
  s.from('official_waiver_order').select('*').eq('season_id',1).order('waiver_priority')
 ]);
 if (ce || te || se) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Waiver execution data temporarily unavailable'
    },
    { status: 500 }
  );
}
 if(!(claims||[]).length)return NextResponse.json({ok:false,error:'No pending claims for '+key},{status:400});
 const order=[...(standings||[])].sort((a,b)=>Number(a.waiver_priority)-Number(b.waiver_priority)), oi=new Map(order.map(o=>[Number(o.owner_id),Number(o.waiver_priority)])), tm=new Map((teams||[]).map(t=>[Number(t.team_id),t]));
 const rosters=new Map(order.map(o=>[Number(o.owner_id),(teams||[]).filter(t=>Number(t.owner_id)===Number(o.owner_id)).map(t=>({...t}))]));
 const q=new Map(order.map(o=>[Number(o.owner_id),(claims||[]).filter(c=>Number(c.owner_id)===Number(o.owner_id)).sort((a,b)=>a.priority-b.priority).map(c=>({...c}))]));
 const claimed=new Set(),plan=[],losers=[];let round=1,progress=true;
 while(progress){progress=false;for(const o of order){const oid=Number(o.owner_id),queue=q.get(oid)||[];while(queue.length){const c=queue.shift(),aid=Number(c.add_team_id),did=Number(c.drop_team_id),target=tm.get(aid),roster=rosters.get(oid)||[],drop=roster.find(t=>Number(t.team_id)===did);
   if(claimed.has(aid)){losers.push({id:c.id,reason:'Target won by higher-priority claim'});continue}
   if(!target||target.is_owned||Number(target.wins||0)>=5||!drop||!legalDrops(roster,target).some(t=>Number(t.team_id)===did)){losers.push({id:c.id,reason:'Claim became invalid at processing'});continue}
   const competing=(claims||[]).filter(x=>Number(x.add_team_id)===aid&&Number(x.owner_id)!==oid).map(x=>Number(x.owner_id));
   plan.push({claim:c,owner:o,target,drop,round,order:oi.get(oid),competing});claimed.add(aid);progress=true;
   roster[roster.findIndex(t=>Number(t.team_id)===did)]={...target,owner_id:oid,is_owned:true};break;
 }}round++;if(round>100)break}
 const effectiveAt = new Date().toISOString();
const done = [];

for (const x of plan) {
  const { data, error } = await s.rpc(
    'execute_waiver_transaction',
    {
      p_season_id: 1,
      p_period: key,
      p_owner_id: Number(x.owner.owner_id),
      p_add_team_id: Number(x.target.team_id),
      p_drop_team_id: Number(x.drop.team_id),
      p_claim_id: Number(x.claim.id),
      p_round: x.round,
      p_order: x.order,
      p_competing: x.competing,
      p_effective_at: effectiveAt
    }
  );

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Waiver execution stopped because of an internal error',
        completed: done
      },
      { status: 500 }
    );
  }

  done.push({
    transaction_id: data,
    round: x.round,
    owner: x.owner.owner_name,
    add: x.target.school,
    drop: x.drop.school
  });
}
 for(const l of losers)await s.from('waiver_claims').update({status:'unsuccessful',failure_reason:l.reason,processed_at:effectiveAt,updated_at:effectiveAt}).eq('id',l.id).eq('status','pending');
 return NextResponse.json({ok:true,period:key,effective_at:effectiveAt,transactions:done,unsuccessful:losers.length,message:'Manual waiver run completed.'});
}
