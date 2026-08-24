import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
export async function POST(req){
  if(!await isAdminAuthenticated()) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const b=await req.json();
    const id=await adminRpc('admin_add_scoring_event',{
      p_team_id:Number(b.teamId), p_event_type:b.eventType||'commissioner_adjustment',
      p_points:Number(b.points), p_week_key:b.weekKey||'Commissioner',
      p_note:b.note||null
    });
    await adminRpc('admin_log_action',{p_action_type:'scoring_adjustment',p_summary:`Manual scoring adjustment: ${b.points} points`,p_details:{teamId:b.teamId,eventType:b.eventType,weekKey:b.weekKey,note:b.note}});return NextResponse.json({ok:true,id});
  }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}
