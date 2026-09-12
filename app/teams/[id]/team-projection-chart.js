'use client';

import {FANTASY_WEEKS_2026} from '../../../lib/fantasy-weeks';

const timestamp=value=>new Date(value).getTime();

function latestAtOrBefore(rows,cutoff){
  return rows.filter(row=>timestamp(row.snapshot_at)<=cutoff).at(-1)||null;
}

function chartPoints(history){
  const raw=history
    .map(row=>({...row,value:Number(row.projected_points),wins:Number(row.projected_wins)}))
    .filter(row=>Number.isFinite(row.value)&&Number.isFinite(timestamp(row.snapshot_at)))
    .sort((a,b)=>timestamp(a.snapshot_at)-timestamp(b.snapshot_at));

  const byRun=[];
  for(const row of raw){
    if(!byRun.length||byRun.at(-1).run_id!==row.run_id)byRun.push(row);
    else byRun[byRun.length-1]=row;
  }
  if(!byRun.length)return [];

  const points=[];
  const firstWeekStart=timestamp(FANTASY_WEEKS_2026[0].start);
  const preseason=latestAtOrBefore(byRun,firstWeekStart)||byRun[0];
  points.push({...preseason,label:'Pre',title:'Preseason'});

  for(const [index,week] of FANTASY_WEEKS_2026.entries()){
    const cutoff=timestamp(week.end);
    if(Date.now()<cutoff)continue;

    const snapshot=latestAtOrBefore(byRun,cutoff);
    if(!snapshot)continue;

    points.push({
      ...snapshot,
      label:index<13?`W${index+1}`:week.label,
      title:week.label
    });
  }

  return points.map((point,index)=>({...point,i:index}));
}

export default function TeamProjectionChart({history=[]}){
  if(!history.length)return <div className="card standingsChartEmpty">Projection history will appear after the preseason projection is published.</div>;

  const points=chartPoints(history);
  if(!points.length)return <div className="card standingsChartEmpty">No projection history available.</div>;

  const W=680,H=270,L=48,R=24,T=24,B=52;
  const vals=points.map(point=>point.value);
  const lo=Math.floor(Math.min(...vals)-1);
  const hi=Math.ceil(Math.max(...vals)+1);
  const span=Math.max(1,hi-lo);
  const x=index=>points.length===1?(L+W-R)/2:L+index*(W-L-R)/(points.length-1);
  const y=value=>T+(hi-value)*(H-T-B)/span;

  return <div className="card teamProjectionCard">
    <div className="teamProjectionScroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="teamProjectionSvg" role="img" aria-label="Season projected points history">
        {[lo,lo+span/2,hi].map((value,index)=><g key={index}>
          <line x1={L} x2={W-R} y1={y(value)} y2={y(value)} className="rankGrid"/>
          <text x={L-8} y={y(value)+4} textAnchor="end" className="rankAxis">{value.toFixed(1)}</text>
        </g>)}
        {points.length>1?<polyline points={points.map(point=>`${x(point.i)},${y(point.value)}`).join(' ')} fill="none" className="teamProjectionLine"/>:null}
        {points.map(point=><g key={`${point.title}-${point.i}`}>
          <circle cx={x(point.i)} cy={y(point.value)} r="5" className="teamProjectionDot"/>
          <text x={x(point.i)} y={H-22} textAnchor="middle" className="weekAxis">{point.label}</text>
          <title>{`${point.title}: ${point.value.toFixed(2)} projected pts`}</title>
        </g>)}
      </svg>
    </div>
    <div className="teamProjectionLatest">
      <span><small>Current projection</small><b>{points.at(-1).value.toFixed(2)} pts</b></span>
      <span><small>Projected wins</small><b>{points.at(-1).wins.toFixed(2)}</b></span>
      <span><small>Change</small><b>{points.length>1?`${points.at(-1).value-points[0].value>=0?'+':''}${(points.at(-1).value-points[0].value).toFixed(2)}`:'—'}</b></span>
    </div>
  </div>;
}
