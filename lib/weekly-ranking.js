export function compareWeeklyRank(a,b){
  return Number(b.weekly_points ?? b.points_so_far ?? 0)-Number(a.weekly_points ?? a.points_so_far ?? 0)
    || Number(b.weekly_point_diff ?? 0)-Number(a.weekly_point_diff ?? 0)
    || Number(a.draft_slot ?? 999)-Number(b.draft_slot ?? 999);
}
export function rankWeekly(rows){
  return [...rows].sort(compareWeeklyRank).map((row,index)=>({...row,weekly_rank:index+1}));
}
