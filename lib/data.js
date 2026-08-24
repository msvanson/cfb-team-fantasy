import { createClient } from '@supabase/supabase-js';
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
export async function getStandings(){const {data,error}=await supabase.from('owner_standings').select('*').eq('season_id',1).order('rank').order('draft_slot');if(error)throw error;return data||[]}
export async function getTeamDirectory(){const {data,error}=await supabase.from('team_directory').select('*').eq('season_id',1).order('conference_display_order').order('fantasy_points',{ascending:false}).order('school');if(error)throw error;return data||[]}
export async function getRules(){const {data,error}=await supabase.from('scoring_rules').select('*').eq('season_id',1).order('id');if(error)throw error;return data||[]}
export async function getWeekly(){const {data,error}=await supabase.from('weekly_owner_points').select('*').eq('season_id',1).order('week_key').order('weekly_points',{ascending:false});if(error)throw error;return data||[]}
