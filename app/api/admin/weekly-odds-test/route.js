import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';

const BASE='https://api.odds-api.io/v3';
const EVENT_ID='70894634';

export async function GET(){
 if(!await isAdminAuthenticated())return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const key=process.env.ODDS_API_KEY;
 if(!key)return NextResponse.json({ok:false,error:'ODDS_API_KEY missing'},{status:500});
 try{
   // EXACTLY ONE external request: odds for the already-discovered NC State @ Virginia event.
   const url=`${BASE}/odds?eventId=${EVENT_ID}&bookmakers=${encodeURIComponent('DraftKings,FanDuel')}&apiKey=${encodeURIComponent(key)}`;
   const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
   const text=await r.text();
   let body; try{body=JSON.parse(text)}catch{body=text}
   return NextResponse.json({
     ok:r.ok,
     mode:'ONE_CALL_SINGLE_EVENT_ODDS',
     externalRequestsUsed:1,
     httpStatus:r.status,
     requestedEventId:EVENT_ID,
     requestedBookmakers:['DraftKings','FanDuel'],
     response:body
   },{status:r.ok?200:502});
 }catch(e){
   return NextResponse.json({ok:false,mode:'ONE_CALL_SINGLE_EVENT_ODDS',externalRequestsUsed:0,error:e?.message||String(e)},{status:500});
 }
}
