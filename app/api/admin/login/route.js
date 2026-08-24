import { NextResponse } from 'next/server';
import { verifyAdminPassword, setAdminCookie } from '../../../../lib/admin-auth';
export async function POST(req){
  const { password } = await req.json();
  if(!verifyAdminPassword(password)) return NextResponse.json({ok:false,error:'Invalid commissioner password'},{status:401});
  await setAdminCookie();
  return NextResponse.json({ok:true});
}
