import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {authenticatedProfileFromRequest} from '../../../lib/user-auth';
import {wheelTiming} from '../../../lib/wheel';

const sb=()=>createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false
    }
  }
);

function ownerAccess(auth){
  return Boolean(auth.profile.owner_id)||auth.profile.role==='commissioner';
}

export async function GET(req){
  const auth=await authenticatedProfileFromRequest(req);

  if(!auth.ok){
    return NextResponse.json(
      {ok:false,error:auth.error},
      {status:auth.status}
    );
  }

  if(!ownerAccess(auth)){
    return NextResponse.json(
      {ok:false,error:'Your account is not assigned to the league'},
      {status:403}
    );
  }

  const s=sb();
  const timing=wheelTiming();

  if(timing.latestDrawKey){
    const {error:drawError}=await s.rpc('draw_weekly_wheel',{
      p_season_id:1,
      p_draw_key:timing.latestDrawKey,
      p_week_label:timing.latestWeekLabel
    });

    if(drawError){
      return NextResponse.json(
        {ok:false,error:'The weekly draw is temporarily unavailable'},
        {status:500}
      );
    }
  }

  const drawQuery=s
    .from('wheel_draws')
    .select(
      'id,draw_key,week_label,selected_entry_id,selected_text,entry_snapshot,drawn_at'
    )
    .eq('season_id',1);

  const [
    drawResult,
    approvedResult,
    myResult,
    historyResult
  ]=await Promise.all([
    timing.latestDrawKey
      ?drawQuery.eq('draw_key',timing.latestDrawKey).maybeSingle()
      :Promise.resolve({data:null,error:null}),

    s
      .from('wheel_entries')
      .select('id,item_text')
      .eq('season_id',1)
      .eq('status','approved')
      .order('approved_at',{ascending:true}),

    s
      .from('wheel_entries')
      .select('id,item_text,status,created_at')
      .eq('season_id',1)
      .eq('submitted_by',auth.user.id)
      .order('created_at',{ascending:false})
      .limit(20),

    s
      .from('wheel_draws')
      .select('id,draw_key,week_label,selected_text,drawn_at')
      .eq('season_id',1)
      .order('drawn_at',{ascending:false})
      .limit(12)
  ]);

  const firstError=
    drawResult.error||
    approvedResult.error||
    myResult.error||
    historyResult.error;

  if(firstError){
    return NextResponse.json(
      {ok:false,error:'Wheel data is temporarily unavailable'},
      {status:500}
    );
  }

  let draw=drawResult.data||null;

  if(draw){
    const {data:view,error:viewError}=await s
      .from('wheel_views')
      .select('viewed_at')
      .eq('draw_id',draw.id)
      .eq('user_id',auth.user.id)
      .maybeSingle();

    if(viewError){
      return NextResponse.json(
        {ok:false,error:'Wheel view status is temporarily unavailable'},
        {status:500}
      );
    }

    draw={...draw,watched:Boolean(view)};
  }

  return NextResponse.json({
    ok:true,
    timing,
    draw,
    approvedEntries:approvedResult.data||[],
    myEntries:myResult.data||[],
    history:(historyResult.data||[]).filter(x=>x.id!==draw?.id)
  });
}

export async function POST(req){
  const auth=await authenticatedProfileFromRequest(req);

  if(!auth.ok){
    return NextResponse.json(
      {ok:false,error:auth.error},
      {status:auth.status}
    );
  }

  if(!ownerAccess(auth)){
    return NextResponse.json(
      {ok:false,error:'Your account is not assigned to the league'},
      {status:403}
    );
  }

  let body;

  try{
    body=await req.json();
  }catch{
    return NextResponse.json(
      {ok:false,error:'Invalid request'},
      {status:400}
    );
  }

  const itemText=String(body?.text||'')
    .replace(/\s+/g,' ')
    .trim();

  if(itemText.length<2||itemText.length>160){
    return NextResponse.json(
      {ok:false,error:'Items must be 2–160 characters'},
      {status:400}
    );
  }

  const s=sb();

  const {count,error:countError}=await s
    .from('wheel_entries')
    .select('id',{count:'exact',head:true})
    .eq('season_id',1)
    .eq('submitted_by',auth.user.id)
    .eq('status','pending');

  if(countError){
    return NextResponse.json(
      {ok:false,error:'Unable to submit an item right now'},
      {status:500}
    );
  }

  if(Number(count||0)>=5){
    return NextResponse.json(
      {ok:false,error:'You may have up to 5 pending items at once'},
      {status:400}
    );
  }

  const {data:existing,error:existingError}=await s
    .from('wheel_entries')
    .select('item_text')
    .eq('season_id',1)
    .in('status',['pending','approved']);

  if(existingError){
    return NextResponse.json(
      {ok:false,error:'Unable to submit an item right now'},
      {status:500}
    );
  }

  const duplicate=(existing||[]).some(
    x=>x.item_text.toLocaleLowerCase()===itemText.toLocaleLowerCase()
  );

  if(duplicate){
    return NextResponse.json(
      {ok:false,error:'That item is already pending or on the wheel'},
      {status:409}
    );
  }

  const {data,error}=await s
    .from('wheel_entries')
    .insert({
      season_id:1,
      item_text:itemText,
      submitted_by:auth.user.id,
      submitted_by_owner_id:auth.profile.owner_id||null,
      status:'pending'
    })
    .select('id,item_text,status,created_at')
    .single();

  if(error){
    return NextResponse.json(
      {ok:false,error:'Unable to submit an item right now'},
      {status:500}
    );
  }

  return NextResponse.json(
    {ok:true,entry:data},
    {status:201}
  );
}
