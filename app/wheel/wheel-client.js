'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

const COLORS=[
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316'
];

function WheelGraphic({items,winnerId,spinning}){
  const count=Math.max(items.length,1);
  const winnerIndex=Math.max(
    0,
    items.findIndex(x=>Number(x.id)===Number(winnerId))
  );
  const slice=360/count;
  const finalRotation=
    2160+(360-(winnerIndex*slice+slice/2));

  const gradient=items.length
    ?`conic-gradient(${items.map(
      (_,i)=>
        `${COLORS[i%COLORS.length]} ${i*slice}deg ${(i+1)*slice}deg`
    ).join(',')})`
    :'conic-gradient(#d1d5db 0deg 360deg)';

  return (
    <div className="wheelStage">
      <div className="wheelPointer" aria-hidden="true"/>

      <div
        role="img"
        className={`wheelDisc ${spinning?'isSpinning':''}`}
        style={{
          background:gradient,
          '--wheel-final':`${finalRotation}deg`
        }}
        aria-label={
          items.length
            ?`Wheel with ${items.length} approved items`
            :'Empty wheel'
        }
      >
        <div className="wheelHub">W</div>
      </div>
    </div>
  );
}

export default function WheelClient(){
  const supabase=useMemo(
    ()=>createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ),
    []
  );

  const [data,setData]=useState(null);
  const [textValue,setTextValue]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [spinning,setSpinning]=useState(false);
  const [revealed,setRevealed]=useState(false);
  const startedDraw=useRef(null);

  async function token(){
    const {data:sessionData}=await supabase.auth.getSession();
    return sessionData.session?.access_token;
  }

  async function load(){
    const t=await token();

    if(!t){
      setMsg('Sign in through Account to use the weekly wheel.');
      return;
    }

    const response=await fetch('/api/wheel',{
      headers:{
        Authorization:`Bearer ${t}`
      },
      cache:'no-store'
    });

    const result=await response.json();

    if(!response.ok){
      setMsg(
        result.error||
        'The wheel is temporarily unavailable.'
      );
      return;
    }

    setData(result);
  }

  useEffect(()=>{
    load();

    const interval=setInterval(load,60000);

    return ()=>{
      clearInterval(interval);
    };
  },[]);

  useEffect(()=>{
    const draw=data?.draw;

    if(
      !draw||
      draw.watched||
      startedDraw.current===draw.id
    ){
      if(draw?.watched){
        setRevealed(true);
      }

      return;
    }

    startedDraw.current=draw.id;
    setSpinning(true);

    const reduceMotion=window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .matches;

    const timer=setTimeout(async()=>{
      setSpinning(false);
      setRevealed(true);

      const t=await token();

      if(t){
        await fetch('/api/wheel/viewed',{
          method:'POST',
          headers:{
            Authorization:`Bearer ${t}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            draw_id:draw.id
          })
        });
      }
    },reduceMotion?250:5200);

    return ()=>{
      clearTimeout(timer);
    };
  },[data]);

  async function submit(event){
    event.preventDefault();

    const clean=textValue.trim();

    if(clean.length<2){
      setMsg('Enter at least 2 characters.');
      return;
    }

    setBusy(true);
    setMsg('');

    const t=await token();

    const response=await fetch('/api/wheel',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${t}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        text:clean
      })
    });

    const result=await response.json();

    setBusy(false);

    if(!response.ok){
      setMsg(result.error||'Submission failed.');
      return;
    }

    setTextValue('');
    setMsg('Submitted for commissioner approval.');

    await load();
  }

  if(!data){
    return (
      <section className="section">
        <div className="card">
          {msg||'Loading the wheel…'}
        </div>
      </section>
    );
  }

  const draw=data.draw;

  const wheelItems=draw?.entry_snapshot?.length
    ?draw.entry_snapshot
    :data.approvedEntries;

  const showWinner=
    draw&&
    (draw.watched||revealed)&&
    !spinning;

  return (
    <>
      <section className="section wheelHero">
        <div className="sectionTitle">
          <div>
            <h2>Weekly Wheel</h2>
            <span className="muted">
                  Every draw is shared and saved for the league.
            </span>
          </div>
        </div>

        <div className="card wheelCard">
          <div className="wheelSchedule">
            <span>Next spin</span>
            <b>{data.timing.nextDrawLabel}</b>
          </div>

          <WheelGraphic
            items={wheelItems}
            winnerId={draw?.selected_entry_id}
            spinning={spinning}
          />

          {spinning?(
            <div
              className="wheelReveal"
              aria-live="polite"
            >
              <b>Spinning…</b>
              <span>
                The weekly result is already locked.
              </span>
            </div>
          ):null}

          {showWinner?(
            <div
              className="wheelWinner"
              aria-live="polite"
            >
              <small>{draw.week_label}</small>
              <h2>{draw.selected_text}</h2>
                            <span>
                {draw.draw_type==='manual'
                  ?'Commissioner spin · saved to history'
                  :'Locked in for the week'}
              </span>
            </div>
          ):null}

          {!draw&&!data.approvedEntries.length?(
            <div className="wheelReveal">
              <b>
                The wheel is waiting for approved items.
              </b>
              <span>
                Submit one below to get started.
              </span>
            </div>
          ):null}

          {!draw&&data.approvedEntries.length?(
            <div className="wheelReveal">
              <b>
                {data.approvedEntries.length} approved{' '}
                {data.approvedEntries.length===1
                  ?'item'
                  :'items'} ready
              </b>
              <span>
                The first spin is Saturday at 8:00 PM ET.
              </span>
            </div>
          ):null}
        </div>
      </section>

      <section className="section">
        <div className="sectionTitle">
          <div>
            <h2>Approved Items</h2>
            <span className="muted">
              These are eligible for the next spin.
            </span>
          </div>
        </div>

        <div className="card wheelApprovedList">
          {data.approvedEntries.length
            ?data.approvedEntries.map((item,index)=>(
              <div key={item.id}>
                <b>{index+1}</b>
                <span>{item.item_text}</span>
              </div>
            ))
            :(
              <span className="muted">
                No approved items yet.
              </span>
            )}
        </div>
      </section>

      <section className="section">
        <div className="sectionTitle">
          <div>
            <h2>Submit an Item</h2>
            <span className="muted">
              The commissioner must approve it before
              it can appear.
            </span>
          </div>
        </div>

        <form
          className="card wheelSubmit"
          onSubmit={submit}
        >
          <textarea
            value={textValue}
            onChange={event=>
              setTextValue(event.target.value)
            }
            maxLength={160}
            placeholder="What should go on the wheel?"
            required
          />

          <div>
            <span className="muted">
              {textValue.length}/160
            </span>

            <button
              className="button"
              disabled={
                busy||
                textValue.trim().length<2
              }
            >
              {busy
                ?'Submitting…'
                :'Submit for Approval'}
            </button>
          </div>

          {msg?(
            <div className="notice">{msg}</div>
          ):null}
        </form>
      </section>

      <section className="section">
        <div className="sectionTitle">
          <div>
            <h2>My Submissions</h2>
            <span className="muted">
              Pending and recent items
            </span>
          </div>
        </div>

        <div className="wheelSubmissionList">
          {data.myEntries.length
            ?data.myEntries.map(item=>(
              <div
                className="card wheelSubmission"
                key={item.id}
              >
                <span>{item.item_text}</span>

                <b
                  className={
                    `wheelStatus ${item.status}`
                  }
                >
                  {item.status}
                </b>
              </div>
            ))
            :(
              <div className="card muted">
                You haven’t submitted anything yet.
              </div>
            )}
        </div>
      </section>

      {data.history.length?(
        <section className="section">
          <div className="sectionTitle">
            <div>
              <h2>Wheel History</h2>
              <span className="muted">
                Previous results
              </span>
            </div>
          </div>

          <div className="wheelHistory">
            {data.history.map(item=>(
              <div className="card" key={item.id}>
                <small>{item.week_label}</small>
                <b>{item.selected_text}</b>
              </div>
            ))}
          </div>
        </section>
      ):null}
    </>
  );
}
