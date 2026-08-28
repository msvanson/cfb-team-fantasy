import {NextResponse} from 'next/server';
import {isAdminAuthenticated} from '../../../../lib/admin-auth';
import {createClient} from '@supabase/supabase-js';
import {currentFantasyWeek} from '../../../../lib/fantasy-weeks';

const BASE='https://api.odds-api.io/v3';
const BOOKMAKERS='DraftKings,FanDuel';
const MULTI_BATCH_SIZE=10;

const supabase=createClient(
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
  const n=norm(s);
  const a=new Set([n]);

  for(const x of(aliases[n]||[])){
    a.add(norm(x));
  }

  return[...a];
};

function exactTeam(api,school,mascot){
  const a=norm(api);

  for(const r of roots(school)){
    if(a===r)return true;

    if(a.startsWith(r+' ')){
      if(mascot){
        return a===`${r} ${norm(mascot)}`;
      }

      return true;
    }
  }

  return false;
}

function ml(book){
  const market=(book||[])
    .find(x=>x.name==='ML');

  return market?.odds?.[0]||null;
}

function fair(home,away){
  home=Number(home);
  away=Number(away);

  if(!home||!away){
    return null;
  }

  const h=1/home;
  const a=1/away;
  const total=h+a;

  return{
    home:h/total,
    away:a/total
  };
}

function latestTime(book){
  const market=(book||[])
    .find(x=>x.name==='ML');

  return market?.updatedAt||null;
}

function chunks(items,size){
  const out=[];

  for(let i=0;i<items.length;i+=size){
    out.push(items.slice(i,i+size));
  }

  return out;
}

function list(x){
  if(Array.isArray(x))return x;
  if(Array.isArray(x?.data))return x.data;
  if(Array.isArray(x?.events))return x.events;
  return[];
}

function oddsList(x){
  if(Array.isArray(x))return x;

  for(const key of [
    'data',
    'events',
    'results',
    'odds'
  ]){
    if(Array.isArray(x?.[key])){
      return x[key];
    }
  }

  if(x?.id&&x?.bookmakers){
    return[x];
  }

  return[];
}

async function authorized(req){
  const secret=
    process.env.CRON_SECRET||'';

  const auth=
    req.headers.get('authorization')||'';

  if(
    secret&&
    auth===`Bearer ${secret}`
  ){
    return true;
  }

  return await isAdminAuthenticated();
}

async function providerJson(url){
  const response=await fetch(
    url,
    {cache:'no-store'}
  );

  const body=await response.json();

  if(!response.ok){
    throw new Error(
      `Odds API HTTP ${response.status}`
    );
  }

  return{
    body,
    rateLimit:{
      limit:
        response.headers.get(
          'x-ratelimit-limit'
        ),
      remaining:
        response.headers.get(
          'x-ratelimit-remaining'
        ),
      reset:
        response.headers.get(
          'x-ratelimit-reset'
        )
    }
  };
}

/*
 * Returns:
 *
 * same
 *   Provider and CFBD home/away match.
 *
 * reversed
 *   Provider designation is opposite CFBD.
 *
 * null
 *   Cannot safely establish orientation.
 */
function orientation(event,home,away){

  if(
    exactTeam(
      event.home,
      home?.school,
      home?.mascot
    )&&
    exactTeam(
      event.away,
      away?.school,
      away?.mascot
    )
  ){
    return'same';
  }

  if(
    exactTeam(
      event.home,
      away?.school,
      away?.mascot
    )&&
    exactTeam(
      event.away,
      home?.school,
      home?.mascot
    )
  ){
    return'reversed';
  }

  return null;
}

function findLiveEvent(
  liveEvents,
  game,
  home,
  away,
  cachedEventId
){

  /*
   * Best match:
   * use the Odds-API event ID we already discovered
   * during the pregame process.
   */
  if(cachedEventId){

    const byId=liveEvents.find(
      e=>
        String(e.id)===
        String(cachedEventId)
    );

    if(byId){
      return byId;
    }
  }

  /*
   * Backup:
   * match teams.
   */
  return liveEvents.find(
    e=>orientation(e,home,away)
  )||null;
}

export async function GET(req){

  if(!await authorized(req)){
    return NextResponse.json(
      {
        ok:false,
        error:'Unauthorized'
      },
      {status:401}
    );
  }

  if(!process.env.ODDS_API_KEY){
    return NextResponse.json(
      {
        ok:false,
        error:'ODDS_API_KEY missing'
      },
      {status:500}
    );
  }

  if(
    !process.env
      .SUPABASE_SERVICE_ROLE_KEY
  ){
    return NextResponse.json(
      {
        ok:false,
        error:
          'SUPABASE_SERVICE_ROLE_KEY missing'
      },
      {status:500}
    );
  }

  const key=
    process.env.ODDS_API_KEY;

  try{

    const now=new Date();
    const nowIso=now.toISOString();

    const fantasyWeek=
      currentFantasyWeek(now);

    /*
     * First inspect Supabase.
     *
     * This costs ZERO Odds-API requests.
     */
    const {
      data:games,
      error:gamesError
    }=await supabase
      .from('games')
      .select(`
        cfbd_game_id,
        start_time,
        home_team_id,
        away_team_id,
        completed,
        winner_team_id,
        status
      `)
      .gte(
        'start_time',
        fantasyWeek.start
      )
      .lt(
        'start_time',
        fantasyWeek.end
      )
      .eq('season_id',1)
      .eq('completed',false)
      .lte(
        'start_time',
        nowIso
      )
      .order('start_time');

    if(gamesError){
      throw gamesError;
    }

    /*
     * No games have even reached kickoff.
     *
     * Important:
     * return here without touching Odds-API.
     */
    if(!games?.length){

      return NextResponse.json({
        ok:true,
        mode:'LIVE_ODDS_REFRESH_V1',

        externalRequestsUsed:0,

        startedGames:0,
        liveProviderEvents:0,
        relevantLiveGames:0,

        freshLiveGames:0,
        cachedLiveGames:0,
        closingFallbackGames:0,

        rowsUpdated:0,

        reason:
          'No current-week games have reached kickoff'
      });
    }

    const teamIds=[
      ...new Set(
        games
          .flatMap(g=>[
            g.home_team_id,
            g.away_team_id
          ])
          .filter(Boolean)
      )
    ];

    const {
      data:teams,
      error:teamsError
    }=await supabase
      .from('team_directory')
      .select(`
        team_id,
        school,
        mascot,
        owner_id,
        owner_name,
        is_owned
      `)
      .eq('season_id',1)
      .in('team_id',teamIds);

    if(teamsError){
      throw teamsError;
    }

    const teamMap=new Map(
      (teams||[])
        .map(t=>[
          t.team_id,
          t
        ])
    );

    /*
     * We only care about games containing
     * at least one fantasy-owned team.
     */
    const relevant=games.filter(
      g=>
        teamMap
          .get(g.home_team_id)
          ?.is_owned||
        teamMap
          .get(g.away_team_id)
          ?.is_owned
    );

    if(!relevant.length){

      return NextResponse.json({
        ok:true,
        mode:'LIVE_ODDS_REFRESH_V1',

        externalRequestsUsed:0,

        startedGames:
          games.length,

        relevantLiveGames:0,

        rowsUpdated:0,

        reason:
          'No started owned-team games'
      });
    }

    /*
     * Load our pregame/closing/live cache.
     */
    const gameIds=
      relevant.map(
        g=>g.cfbd_game_id
      );

    const {
      data:existing,
      error:existingError
    }=await supabase
      .from('weekly_game_odds')
      .select(`
        cfbd_game_id,
        odds_api_event_id,

        home_win_probability,
        away_win_probability,
        projection_source,

        closing_home_win_probability,
        closing_away_win_probability,

        live_home_win_probability,
        live_away_win_probability,
        live_odds_updated_at,
        live_fetched_at,
        live_books_used,
        live_source
      `)
      .eq('season_id',1)
      .in(
        'cfbd_game_id',
        gameIds
      );

    if(existingError){
      throw existingError;
    }

    const existingMap=new Map(
      (existing||[])
        .map(row=>[
          String(row.cfbd_game_id),
          row
        ])
    );

    /*
     * CALL 1:
     * Get every currently live
     * American-football event.
     */
    const liveResult=
      await providerJson(
        `${BASE}/events/live`+
        `?sport=${encodeURIComponent(
          'american-football'
        )}`+
        `&apiKey=${encodeURIComponent(
          key
        )}`
      );

    let calls=1;
    let lastRateLimit=
      liveResult.rateLimit;

    /*
     * Only NCAA college events.
     *
     * The live endpoint supports sport filtering;
     * league filtering is done locally.
     */
    const liveEvents=
      list(liveResult.body)
        .filter(
          e=>
            e?.league?.slug===
              'usa-college'
        );

    /*
     * Nothing live?
     *
     * We already used one provider request,
     * but don't request any odds.
     */
    if(!liveEvents.length){

      return NextResponse.json({
        ok:true,
        mode:'LIVE_ODDS_REFRESH_V1',

        externalRequestsUsed:calls,

        startedGames:
          relevant.length,

        liveProviderEvents:0,
        relevantLiveGames:0,

        freshLiveGames:0,
        cachedLiveGames:0,
        closingFallbackGames:0,

        rowsUpdated:0,

        rateLimit:lastRateLimit,

        reason:
          'Odds API reports no live NCAAF games'
      });
    }

    const matched=[];

    for(const game of relevant){

      const home=
        teamMap.get(
          game.home_team_id
        )||null;

      const away=
        teamMap.get(
          game.away_team_id
        )||null;

      const previous=
        existingMap.get(
          String(game.cfbd_game_id)
        )||null;

      const event=findLiveEvent(
        liveEvents,
        game,
        home,
        away,
        previous?.odds_api_event_id
      );

      if(!event){
        continue;
      }

      const orient=
        orientation(
          event,
          home,
          away
        );

      if(!orient){
        continue;
      }

      matched.push({
        game,
        home,
        away,
        previous,
        event,
        orientation:orient
      });
    }

    /*
     * If no fantasy-owned games match live provider
     * events, don't make any odds requests.
     */
    if(!matched.length){

      return NextResponse.json({
        ok:true,
        mode:'LIVE_ODDS_REFRESH_V1',

        externalRequestsUsed:calls,

        startedGames:
          relevant.length,

        liveProviderEvents:
          liveEvents.length,

        relevantLiveGames:0,

        rowsUpdated:0,

        rateLimit:lastRateLimit,

        reason:
          'No owned-team games matched live provider events'
      });
    }

    const eventIds=[
      ...new Set(
        matched
          .map(x=>x.event.id)
          .filter(Boolean)
      )
    ];

    /*
     * Batch live odds.
     *
     * Up to ten event IDs = one request.
     */
    const oddsByEvent=
      new Map();

    for(
      const batch of chunks(
        eventIds,
        MULTI_BATCH_SIZE
      )
    ){

      const result=
        await providerJson(
          `${BASE}/odds/multi`+
          `?eventIds=${encodeURIComponent(
            batch.join(',')
          )}`+
          `&bookmakers=${encodeURIComponent(
            BOOKMAKERS
          )}`+
          `&apiKey=${encodeURIComponent(
            key
          )}`
        );

      calls++;
      lastRateLimit=
        result.rateLimit;

      for(
        const event of oddsList(
          result.body
        )
      ){
        oddsByEvent.set(
          String(event.id),
          event
        );
      }
    }

    const updates=[];

    let freshLiveGames=0;
    let cachedLiveGames=0;
    let closingFallbackGames=0;
    let emergencyFallbackGames=0;

    for(const item of matched){

      const {
        game,
        previous,
        event,
        orientation:orient
      }=item;

      const odds=
        oddsByEvent.get(
          String(event.id)
        );

      let hp=null;
      let ap=null;

      let books=0;
      let source=null;
      let updated=null;

      /*
       * FRESH LIVE VEGAS
       */
      if(odds){

        const dk=
          ml(
            odds?.bookmakers
              ?.DraftKings
          );

        const fd=
          ml(
            odds?.bookmakers
              ?.FanDuel
          );

        const probabilities=[
          fair(
            dk?.home,
            dk?.away
          ),
          fair(
            fd?.home,
            fd?.away
          )
        ].filter(Boolean);

        if(probabilities.length){

          let providerHome=
            probabilities.reduce(
              (sum,p)=>sum+p.home,
              0
            )/
            probabilities.length;

          let providerAway=
            1-providerHome;

          /*
           * Critical for neutral-site games:
           * Odds provider and CFBD may assign
           * opposite home/away designations.
           */
          if(orient==='reversed'){

            hp=providerAway;
            ap=providerHome;

          }else{

            hp=providerHome;
            ap=providerAway;
          }

          books=
            probabilities.length;

          source=
            books===2
              ?'live_market_2_book'
              :'live_market_1_book';

          updated=[
            latestTime(
              odds?.bookmakers
                ?.DraftKings
            ),
            latestTime(
              odds?.bookmakers
                ?.FanDuel
            )
          ]
            .filter(Boolean)
            .sort()
            .pop()||null;

          freshLiveGames++;
        }
      }

      /*
       * LIVE CACHE
       *
       * DK/FD can temporarily suspend a market
       * after a TD, turnover, review, etc.
       *
       * Never let that cause a projection jump
       * back to 50/50.
       */
      if(
        hp==null&&
        previous
          ?.live_home_win_probability
          !=null&&
        previous
          ?.live_away_win_probability
          !=null
      ){

        hp=Number(
          previous
            .live_home_win_probability
        );

        ap=Number(
          previous
            .live_away_win_probability
        );

        books=Number(
          previous
            .live_books_used||0
        );

        updated=
          previous
            .live_odds_updated_at||
          null;

        source='live_market_cached';

        cachedLiveGames++;
      }

      /*
       * If we have never received a live line,
       * retain the game's closing probability.
       */
      if(
        hp==null&&
        previous
          ?.closing_home_win_probability
          !=null&&
        previous
          ?.closing_away_win_probability
          !=null
      ){

        hp=Number(
          previous
            .closing_home_win_probability
        );

        ap=Number(
          previous
            .closing_away_win_probability
        );

        source=
          'live_closing_fallback';

        closingFallbackGames++;
      }

      /*
       * Absolute emergency fallback.
       *
       * Once our matchup model exists,
       * this branch becomes model-based.
       */
      if(hp==null){

        hp=
          previous
            ?.home_win_probability
            !=null
            ?Number(
              previous
                .home_win_probability
            )
            :.5;

        ap=
          previous
            ?.away_win_probability
            !=null
            ?Number(
              previous
                .away_win_probability
            )
            :1-hp;

        source=
          'live_existing_fallback';

        emergencyFallbackGames++;
      }

      updates.push({

        season_id:1,

        cfbd_game_id:
          game.cfbd_game_id,

        odds_api_event_id:
          event.id,

        /*
         * EFFECTIVE WEEKLY PROJECTION
         *
         * Existing Weekly calculations
         * can continue reading these.
         */
        home_win_probability:hp,
        away_win_probability:ap,

        projection_source:source,

        /*
         * LIVE-SPECIFIC STORAGE
         */
        live_home_win_probability:hp,
        live_away_win_probability:ap,

        live_odds_updated_at:
          updated,

        live_fetched_at:
          nowIso,

        live_books_used:
          books,

        live_source:
          source,

        game_phase:'live',

        fetched_at:nowIso
      });
    }

    /*
     * Use UPDATE rather than a wide UPSERT.
     *
     * We do NOT want this route accidentally
     * touching any frozen closing columns.
     */
    for(const row of updates){

      const {
        season_id,
        cfbd_game_id,
        ...changes
      }=row;

      const {error:updateError}=
        await supabase
          .from('weekly_game_odds')
          .update(changes)
          .eq(
            'season_id',
            season_id
          )
          .eq(
            'cfbd_game_id',
            cfbd_game_id
          );

      if(updateError){
        throw updateError;
      }
    }

    return NextResponse.json({

      ok:true,

      mode:'LIVE_ODDS_REFRESH_V1',

      externalRequestsUsed:calls,

      startedGames:
        relevant.length,

      liveProviderEvents:
        liveEvents.length,

      relevantLiveGames:
        matched.length,

      rowsUpdated:
        updates.length,

      freshLiveGames,
      cachedLiveGames,
      closingFallbackGames,
      emergencyFallbackGames,

      rateLimit:lastRateLimit
    });

  }catch(e){

    return NextResponse.json(
      {
        ok:false,
        error:
          e?.message||
          String(e)
      },
      {status:500}
    );
  }
}
