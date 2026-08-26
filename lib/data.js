import { createClient } from '@supabase/supabase-js';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
export async function getStandings(){const {data,error}=await supabase.from('owner_standings_with_movement').select('*').eq('season_id',1).order('rank').order('draft_slot');if(error)throw error;return data||[]}
export async function getTeamDirectory(){const {data,error}=await supabase.from('team_directory').select('*').eq('season_id',1).order('conference_display_order').order('fantasy_points',{ascending:false}).order('school');if(error)throw error;return data||[]}
export async function getRules(){const {data,error}=await supabase.from('scoring_rules').select('*').eq('season_id',1).order('id');if(error)throw error;return data||[]}
export async function getWeekly(){const {data,error}=await supabase.from('weekly_owner_points').select('*').eq('season_id',1).order('week_key').order('weekly_points',{ascending:false});if(error)throw error;return data||[]}

export async function getTeam(teamId){const {data,error}=await supabase.from('team_directory').select('*').eq('season_id',1).eq('team_id',teamId).maybeSingle();if(error)throw error;return data}
export async function getTeamGames(teamId){const {data,error}=await supabase.from('games').select('*').eq('season_id',1).or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`).order('start_time');if(error)throw error;return data||[]}
export async function getTeamEvents(teamId){const {data,error}=await supabase.from('scoring_events').select('*').eq('season_id',1).eq('team_id',teamId).order('created_at');if(error)throw error;return data||[]}

export async function getOwner(ownerId){const {data,error}=await supabase.from('owner_standings_with_movement').select('*').eq('season_id',1).eq('owner_id',ownerId).maybeSingle();if(error)throw error;return data}
export async function getOwnerTeams(ownerName){const {data,error}=await supabase.from('team_directory').select('*').eq('season_id',1).eq('owner_name',ownerName).order('conference_display_order');if(error)throw error;return data||[]}
export async function getOwnerWeekly(ownerName){const {data,error}=await supabase.from('weekly_owner_points').select('*').eq('season_id',1).eq('owner_name',ownerName).order('week_key');if(error)throw error;return data||[]}
export async function getOwnerEvents(teamIds){if(!teamIds?.length)return[];const {data,error}=await supabase.from('scoring_events').select('*').eq('season_id',1).in('team_id',teamIds).order('created_at',{ascending:false});if(error)throw error;return data||[]}

export async function getScoringEvents(){const {data,error}=await supabase.from('scoring_events').select('*').eq('season_id',1).order('occurred_at',{ascending:false});if(error)throw error;return data||[]}

export async function getOwners(){const {data,error}=await supabase.from('owners').select('*').eq('season_id',1).order('draft_slot');if(error)throw error;return data||[]}

export async function getWeeklyWinners(){const {data,error}=await supabase.from('weekly_winners').select('*').order('season_id').order('week_key');if(error)throw error;return data||[]}
export async function getOwnerWeeklySummary(){const {data,error}=await supabase.from('owner_weekly_summary').select('*').order('season_id').order('weekly_wins',{ascending:false}).order('highest_weekly_score',{ascending:false});if(error)throw error;return data||[]}
export async function getSeasonRecordBook(){const {data,error}=await supabase.from('season_record_book').select('*').order('year',{ascending:false});if(error)throw error;return data||[]}
export async function getAllStandings(){const {data,error}=await supabase.from('owner_standings_with_movement').select('*').order('season_id').order('rank').order('draft_slot');if(error)throw error;return data||[]}
export async function getLatestTeamProjections(){const {data,error}=await supabase.from('latest_team_projections').select('*');if(error)throw error;return data||[]}
export async function getOwnerProjectionTotals(){const {data,error}=await supabase.from('owner_projection_totals').select('*');if(error)throw error;return data||[]}

export async function getWeeklySnapshots(){const {data,error}=await supabase.from('weekly_snapshots').select('*').eq('season_id',1).order('finalized_at',{ascending:false}).order('weekly_rank');if(error)throw error;return data||[]}
export async function getWeeklySnapshotGames(){const {data,error}=await supabase.from('weekly_snapshot_games').select('*').eq('season_id',1).order('start_time');if(error)throw error;return data||[]}

export async function getOwnerWeeklyRecordStats(){const {data,error}=await supabase.from('owner_weekly_record_stats').select('*').eq('season_id',1).order('weeks_won',{ascending:false}).order('average_weekly_finish',{ascending:true});if(error)throw error;return data||[]}
export async function getDraftHistory(){const {data,error}=await supabase.from('draft_history').select('*').eq('season_id',1).order('draft_pick');if(error)throw error;return data||[]}
export async function getWaiverTransactionHistory(){const {data,error}=await supabase.from('waiver_transaction_history').select('*').eq('season_id',1).order('effective_at',{ascending:false});if(error)throw error;return data||[]}

export async function getPreviousTeams(){const {data,error}=await supabase.from('owner_previous_teams').select('*').eq('season_id',1).order('released_at',{ascending:false});if(error)throw error;return data||[]}

export async function getHeadToHeadRecords(){const {data,error}=await supabase.from('owner_head_to_head_records').select('*').eq('season_id',1).order('owner_a_name').order('owner_b_name');if(error)throw error;return data||[]}
export async function getHeadToHeadGames(){const {data,error}=await supabase.from('owner_head_to_head_games').select('*').eq('season_id',1).order('start_time',{ascending:false});if(error)throw error;return data||[]}
