import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';
import { adminRpc } from '../../../../lib/admin-rpc';
import { syncCfbd } from '../../../../lib/cfbd';
export async function POST(){
  if(!await isAdminAuthenticated()) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    await adminRpc('admin_clear_cfbd_cooldown');
    const result=await syncCfbd({forceSchedule:false});
    return NextResponse.json({ok:true,result});
  }catch(e){return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500})}
}
