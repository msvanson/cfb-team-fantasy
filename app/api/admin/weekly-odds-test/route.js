import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';
import {currentFantasyWeek} from '../../../../lib/fantasy-weeks';

const BASE='https://api.odds-api.io/v3';
const BOOKMAKERS='DraftKings,FanDuel';
const MULTI_BATCH_SIZE=20;

const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
);

const norm=s=>String(s||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/&/g,'and')
  .replace(/\b(university|college|the)\b/g,' ')
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

const aliases={
  'tcu':['tcu','texas christian'],
  'usc':['usc','southern california'],
  'umass':['umass','massachusetts'],
  'ucf':['ucf','central florida'],
  'uconn':['uconn','connecticut'],
  'smu':['smu','southern methodist'],
  'lsu':['lsu','louisiana state'],
  'ole miss':['ole miss','mississippi'],
  'byu':['byu','brigham young'],
  'fiu':['fiu','florida international'],
  'uab':['uab','alabama birmingham'],
  'utep':['utep','texas el paso'],
  'nc state':['nc state','north carolina state']
};

const roots=s=>{
  const n=norm(s),a=new Set([n]);
  for(const x of(aliases[n]||[]))a.add(norm(x));
  return[...a];
};

function exactTeam(api,school,mascot){
  const a=norm(api);
  for(const r of roots(school)){
    if(a===r)return true;
    if(a.startsWith(r+' ')){
      if(mascot)return a===`${r} ${norm(mascot)}`;
      return true;
    }
  }
  return false;
}

const hours=(a,b)=>Math.abs(new Date(a)-new Date(b))/3600000;

const list=x=>
  Array.isArray(x)?x:
  Array.isArray(x?.data)?x.data:
  Array.isArray(x?.events)?x.events:
  [];

function oddsList(x){
  if(Array.isArray(x))return x;

  for(const k of ['data','events','results','odds']){
    if(Array.isArray(x?.[k]))return x[k];
  }

  if(x?.id&&x?.bookmakers)return[x];

  if(x&&typeof x==='object'){
    return Object.values(x).filter(
      v=>v&&typeof v==='object'&&v.id&&v.bookmakers
    );
  }

  return[];
}

function findEvent(pool,g,h,a){
  const candidates=pool.filter(e=>hours(e.date,g.start_time)<=1);

  if(h&&a){
    return candidates.find(e=>
      (exactTeam(e.home,h.school,h.mascot)&&
       exactTeam(e.away,a.school,a.mascot))||
      (exactTeam(e.home,a.school,a.mascot)&&
       exactTeam(e.away,h.school,h.mascot))
    )||null;
  }

  const known=h||a;
  if(!known)return null;

  const m=candidates.filter(e=>
    exactTeam(e.home,known.school,known.mascot)||
    exactTeam(e.away,known.school,known.mascot)
  );

  return m.length===1?m[0]:null;
}

function ml(book){
  const m=(book||[]).find(x=>x.name==='ML');
  return m?.odds?.[0]||null;
}

function fair(home,away){
  home=Number(home);
  away=Number(away);

  if(!home||!away)return null;

  const h=1/home;
  const a=1/away;
  const total=h+a;

  return{
    home:h/total,
    away:a/total
  };
}

function latestTime(book){
  const m=(book||[]).find(x=>x.name==='ML');
  return m?.updatedAt||null;
}

function chunks(items,size){
  const out=[];
  for(let i=0;i<items.length;i+=size){
    out.push(items.slice(i,i+size));
  }
  return out;
}

async function authorized(req){
  const secret=process.env.CRON_SECRET||'';
  const auth=req.headers.get('authorization')||'';

  if(secret&&auth===`Bearer ${secret}`){
    return true;
  }

  return await isAdminAuthenticated();
}

async function providerJson(url){
  const r=await fetch(url,{cache:'no-store'});
  const body=await r.json();

  if(!r.ok){
    throw new Error(`Odds API HTTP ${r.status}`);
  }

  return{
    body,
    rateLimit:{
      limit:r.headers.get('x-ratelimit-limit'),
      remaining:r.headers.get('x-ratelimit-remaining'),
      reset:r.headers.get('x-ratelimit-reset')
    }
  };
}

export async function GET(req){

  if(!await authorized(req)){
    return NextResponse.json(
      {ok:false,error:'Unauthorized'},
      {status:401}
    );
  }

  if(!process.env.ODDS_API_KEY){
    return NextResponse.json(
      {ok:false,error:'ODDS_API_KEY missing'},
      {status:500}
    );
  }

  if(!process.env.SUPABASE_SERVICE_ROLE_KEY){
    return NextResponse.json(
      {ok:false,error:'SUPABASE_SERVICE_ROLE_KEY missing'},
      {status:500}
    );
  }

  const key=process.env.ODDS_API_KEY;

  try{

    const now=new Date();
    const fantasyWeek=currentFantasyWeek(now);

    const {data:games,error:ge}=await supabase
      .from('games')
      .select(
        'cfbd_game_id,start_time,home_team_id,away_team_id,completed'
      )
      .gte('start_time',fantasyWeek.start)
      .lt('start_time',fantasyWeek.end)
      .eq('season_id',1)
      .eq('completed',false)
      .order('start_time');

    if(ge)throw ge;

    /*
     * IMPORTANT:
     * Once kickoff happens, stop touching that game's odds row.
     *
     * This preserves the final pregame Vegas probability instead of
     * replacing it with a 50/50 fallback when the provider removes
     * the game from its pending-event pool.
     */
    const upcoming=(games||[]).filter(
      g=>new Date(g.start_time)>now
    );

    const ids=[
      ...new Set(
        upcoming
          .flatMap(g=>[g.home_team_id,g.away_team_id])
          .filter(Boolean)
      )
    ];

    if(!ids.length){
      return NextResponse.json({
        ok:true,
        mode:'WEEKLY_ODDS_CACHE_REFRESH_V2',
        externalRequestsUsed:0,
        relevantGames:0,
        rowsSaved:0,
        marketGames:0,
        fallbackGames:0,
        sameOwnerGames:0,
        reason:'No upcoming games in current fantasy week'
      });
    }

    const {data:teams,error:te}=await supabase
      .from('team_directory')
      .select(
        'team_id,school,mascot,owner_id,owner_name,is_owned'
      )
      .eq('season_id',1)
      .in('team_id',ids);

    if(te)throw te;

    const tm=new Map(
      (teams||[]).map(t=>[t.team_id,t])
    );

    const relevant=upcoming.filter(g=>
      tm.get(g.home_team_id)?.is_owned||
      tm.get(g.away_team_id)?.is_owned
    );

    if(!relevant.length){
      return NextResponse.json({
        ok:true,
        mode:'WEEKLY_ODDS_CACHE_REFRESH_V2',
        externalRequestsUsed:0,
        relevantGames:0,
        rowsSaved:0,
        marketGames:0,
        fallbackGames:0,
        sameOwnerGames:0,
        reason:'No upcoming owned-team games'
      });
    }

    /*
     * CALL 1:
     * Fetch the entire NCAAF pending-event pool once.
     */
    const poolResult=await providerJson(
      `${BASE}/events`+
      `?sport=american-football`+
      `&league=usa-college`+
      `&status=pending`+
      `&limit=500`+
      `&apiKey=${encodeURIComponent(key)}`
    );

    const pool=list(poolResult.body);

    let calls=1;
    let lastRateLimit=poolResult.rateLimit;

    /*
     * Match our Supabase games to Odds API events.
     */
    const matched=relevant.map(g=>{
      const h=tm.get(g.home_team_id)||null;
      const a=tm.get(g.away_team_id)||null;
      const e=findEvent(pool,g,h,a);

      return{g,h,a,e};
    });

    const eventIds=[
      ...new Set(
        matched.map(x=>x.e?.id).filter(Boolean)
      )
    ];

    /*
     * Fetch odds in batches instead of one request per game.
     */
    const oddsByEvent=new Map();

    for(const batch of chunks(eventIds,MULTI_BATCH_SIZE)){

      const result=await providerJson(
        `${BASE}/odds/multi`+
        `?eventIds=${encodeURIComponent(batch.join(','))}`+
        `&bookmakers=${encodeURIComponent(BOOKMAKERS)}`+
        `&apiKey=${encodeURIComponent(key)}`
      );

      calls++;
      lastRateLimit=result.rateLimit;

      for(const event of oddsList(result.body)){
        oddsByEvent.set(String(event.id),event);
      }
    }

    const rows=[];
    const ownerTotals={};

    for(const {g,h,a,e} of matched){

      const sameOwner=
        h?.is_owned&&
        a?.is_owned&&
        h.owner_id===a.owner_id;

      let hp=.5;
      let ap=.5;
      let source='fallback_50_50';
      let books=0;

      let dk=null;
      let fd=null;
      let updated=null;

      if(sameOwner){

        source='same_owner_guaranteed';

      }else if(e){

        const ob=oddsByEvent.get(String(e.id));

        if(ob){

          dk=ml(ob?.bookmakers?.DraftKings);
          fd=ml(ob?.bookmakers?.FanDuel);

          const probs=[
            fair(dk?.home,dk?.away),
            fair(fd?.home,fd?.away)
          ].filter(Boolean);

          books=probs.length;

          if(probs.length){

            hp=
              probs.reduce(
                (s,p)=>s+p.home,
                0
              )/probs.length;

            ap=1-hp;

            source=
              probs.length===2
                ?'market_2_book'
                :'market_1_book';
          }

          updated=[
            latestTime(ob?.bookmakers?.DraftKings),
            latestTime(ob?.bookmakers?.FanDuel)
          ]
            .filter(Boolean)
            .sort()
            .pop()||null;
        }
      }

      if(sameOwner){

        ownerTotals[h.owner_name]=
          (ownerTotals[h.owner_name]||0)+1;

      }else{

        if(h?.is_owned){
          ownerTotals[h.owner_name]=
            (ownerTotals[h.owner_name]||0)+hp;
        }

        if(a?.is_owned){
          ownerTotals[a.owner_name]=
            (ownerTotals[a.owner_name]||0)+ap;
        }
      }

      rows.push({
        season_id:1,
        cfbd_game_id:g.cfbd_game_id,
        odds_api_event_id:e?.id||null,

        home_team_id:g.home_team_id,
        away_team_id:g.away_team_id,

        home_win_probability:hp,
        away_win_probability:ap,

        projection_source:source,
        books_used:books,

        draftkings_home_decimal:
          dk?.home?Number(dk.home):null,

        draftkings_away_decimal:
          dk?.away?Number(dk.away):null,

        fanduel_home_decimal:
          fd?.home?Number(fd.home):null,

        fanduel_away_decimal:
          fd?.away?Number(fd.away):null,

        odds_updated_at:updated,
        fetched_at:new Date().toISOString(),

        details:{
          home:h?.school||null,
          away:a?.school||null,
          home_owner:h?.owner_name||null,
          away_owner:a?.owner_name||null
        }
      });
    }

    if(rows.length){

      const {error:ue}=await supabase
        .from('weekly_game_odds')
        .upsert(
          rows,
          {onConflict:'season_id,cfbd_game_id'}
        );

      if(ue)throw ue;
    }

    return NextResponse.json({
      ok:true,
      mode:'WEEKLY_ODDS_CACHE_REFRESH_V2',

      externalRequestsUsed:calls,

      providerEventPoolSize:pool.length,
      matchedProviderEvents:eventIds.length,

      relevantGames:relevant.length,
      rowsSaved:rows.length,

      ownerProjectedWinPoints:ownerTotals,

      fallbackGames:
        rows.filter(
          x=>x.projection_source==='fallback_50_50'
        ).length,

      marketGames:
        rows.filter(
          x=>x.projection_source.startsWith('market_')
        ).length,

      sameOwnerGames:
        rows.filter(
          x=>x.projection_source==='same_owner_guaranteed'
        ).length,

      rateLimit:lastRateLimit
    });

  }catch(e){

    return NextResponse.json(
      {
        ok:false,
        error:e?.message||String(e)
      },
      {status:500}
    );
  }
}
