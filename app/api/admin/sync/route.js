import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
import { syncCfbd } from '../../../../lib/cfbd';
export async function POST(){
  if(!await isAdminAuthenticated()) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    await adminRpc('admin_clear_cfbd_cooldown');
    const result=await syncCfbd({forceSchedule:false});
    await adminRpc('admin_log_action',{p_action_type:'force_sync',p_summary:'Forced CFBD sync',p_details:result||{}});
    return NextResponse.json({ok:true,result});
  } catch {
  return NextResponse.json(
    { ok: false, error: 'Sync failed because of an internal error' },
    { status: 500 }
  );
}
}
