import {NextResponse} from 'next/server';
import {requireCommissioner} from '../../../../lib/user-auth';
import {setAdminCookie,clearAdminCookie} from '../../../../lib/admin-auth';

export async function POST(req){
  const auth=await requireCommissioner(req);
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  await setAdminCookie();
  return NextResponse.json({ok:true,username:auth.profile.username,owner_id:auth.profile.owner_id});
}

export async function DELETE(){
  await clearAdminCookie();
  return NextResponse.json({ok:true});
}
