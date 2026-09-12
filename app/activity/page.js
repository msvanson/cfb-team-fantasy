import {createClient} from '@supabase/supabase-js';
import {Nav} from '../nav';
import {LeagueHeader} from '../league-header';
import {
  getOwners,
  getRules,
  getScoringEvents,
  getTeamDirectory,
  getWaiverTransactionHistory
} from '../../lib/data';
import ActivityClient from './activity-client';

export const dynamic='force-dynamic';

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

async function getUnsuccessfulWaiverClaims(){
  const {data,error}=await sb()
    .from('waiver_claims')
    .select(
      'id,owner_id,add_team_id,drop_team_id,status,waiver_period_key,processed_at,failure_reason'
    )
    .eq('season_id',1)
    .in('status',['lost_to_priority','invalid','expired'])
    .not('processed_at','is',null)
    .order('processed_at',{ascending:false});

  if(error)throw error;
  return data||[];
}

async function getLeagueActivity(){
  const {data,error}=await sb()
    .from('league_activity_log')
    .select('*')
    .eq('season_id',1)
    .order('occurred_at',{ascending:false});

  if(error)throw error;
  return data||[];
}

export default async function Page(){
  const [
    events,
    rules,
    teams,
    owners,
    transactions,
    failedClaims,
    league
  ]=await Promise.all([
    getScoringEvents(),
    getRules(),
    getTeamDirectory(),
    getOwners(),
    getWaiverTransactionHistory(),
    getUnsuccessfulWaiverClaims(),
    getLeagueActivity()
  ]);

  const ownerMap=new Map(
    owners.map(owner=>[
      Number(owner.id),
      owner.name
    ])
  );

  const ruleMap=new Map(
    rules.map(rule=>[
      rule.event_type,
      rule.label
    ])
  );

  const successfulTransactions=transactions.map(transaction=>({
    key:`transaction-${transaction.id}`,
    category:'transactions',
    label:'TRANSACTION',
    week:transaction.waiver_period_key,
    at:transaction.effective_at||transaction.created_at,
    owner:
      transaction.owner_name||
      ownerMap.get(Number(transaction.owner_id))||
      'Owner',
    result:'SUCCESSFUL',
    success:true,
    add_team_id:transaction.add_team_id,
    drop_team_id:transaction.drop_team_id,
    reason:null
  }));

  const unsuccessfulClaims=failedClaims.map(claim=>{
    const lostToPriority=claim.failure_reason
      ?.toLowerCase()
      .includes('priority');

    return {
      key:`claim-${claim.id}`,
      category:'transactions',
      label:'WAIVER CLAIM',
      week:claim.waiver_period_key,
      at:claim.processed_at,
      owner:ownerMap.get(Number(claim.owner_id))||'Owner',
      result:lostToPriority
        ?'LOST TO PRIORITY'
        :'UNSUCCESSFUL',
      success:false,
      add_team_id:claim.add_team_id,
      drop_team_id:claim.drop_team_id,
      reason:claim.failure_reason||null
    };
  });

  const bonuses=events
    .filter(event=>event.event_type!=='win')
    .map(event=>({
      key:`bonus-${event.id}`,
      category:'bonuses',
      label:'POSTSEASON BONUS',
      week:event.week_key,
      at:event.occurred_at||event.created_at,
      team_id:event.team_id,
      points:event.points,
      title:
        ruleMap.get(event.event_type)||
        String(event.event_type).replaceAll('_',' '),
      owner:ownerMap.get(Number(event.owner_id))||null
    }));

  const leagueItems=league.map(item=>({
    key:`league-${item.id}`,
    category:'league',
    label:'LEAGUE ACTIVITY',
    at:item.occurred_at,
    title:item.title,
    description:item.description
  }));

  const items=[
    ...successfulTransactions,
    ...unsuccessfulClaims,
    ...bonuses,
    ...leagueItems
  ]
    .filter(item=>item.at)
    .sort((a,b)=>new Date(b.at)-new Date(a.at));

  return <main className="shell">
    <LeagueHeader/>
    <Nav/>
    <ActivityClient
      items={items}
      teams={teams}
    />
  </main>;
}
