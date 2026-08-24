import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {adminRpc} from '../../../../lib/admin-rpc';

export async function GET(){
  if(!await isAdminAuthenticated()){
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  }
  try{
    const qa=await adminRpc('admin_projection_qa');
    return NextResponse.json({ok:true,qa});
  }catch(e){
    return NextResponse.json({ok:false,error:e?.message||String(e)},{status:500});
  }
}
