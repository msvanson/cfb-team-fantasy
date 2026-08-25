import {createClient} from '@supabase/supabase-js';
import {FANTASY_WEEKS_2026} from './fantasy-weeks';

function serviceClient(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function finalizeEndedFantasyWeeks(now=new Date()){
 const sb=serviceClient();
 const ended=FANTASY_WEEKS_2026.filter(w=>new Date(w.end).getTime()<=now.getTime());
 const results=[];
 for(const w of ended){
   const {data:existing}=await sb.from('weekly_snapshots').select('id').eq('season_id',1).eq('week_key',w.key).limit(1);
   if(existing?.length){results.push({week_key:w.key,status:'already_finalized'});continue}
   const {data,error}=await sb.rpc('finalize_fantasy_week',{p_season_id:1,p_week_key:w.key,p_start:w.start,p_end:w.end});
   results.push(error?{week_key:w.key,status:'error',error:error.message}:{week_key:w.key,status:'finalized',rows:data});
 }
 return results;
}
