import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
export async function POST(req){
  if(!await isAdminAuthenticated()) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const b=await req.json();
    await adminRpc('admin_override_game_classification',{
      p_game_id:Number(b.gameId),
      p_is_ccg:b.isCcg===null?null:Boolean(b.isCcg),
      p_is_bowl:b.isBowl===null?null:Boolean(b.isBowl),
      p_is_cfp:b.isCfp===null?null:Boolean(b.isCfp),
      p_playoff_round:b.playoffRound||null,
      p_bowl_name:b.bowlName||null
    });
    await adminRpc('admin_log_action',{p_action_type:'game_override',p_summary:`Postseason classification override for game ${b.gameId}`,p_details:b});return NextResponse.json({} catch {
  return NextResponse.json(
    {
      ok: false,
      error: 'Game classification update failed because of an internal error'
    },
    { status: 500 }
  );
}
}
