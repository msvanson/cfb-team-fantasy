'use client';
export default function TeamProjectionChart({history=[]}){
 if(!history.length)return <div className="card standingsChartEmpty">Projection history will appear after the first published projection run.</div>;
 const points=history.map((r,i)=>({i,value:Number(r.projected_points),date:new Date(r.snapshot_at),wins:Number(r.projected_wins)})).filter(x=>Number.isFinite(x.value));
 if(!points.length)return <div className="card standingsChartEmpty">No projection history available.</div>;
 const W=Math.max(680,points.length*70+100),H=270,L=48,R=24,T=24,B=52;
 const vals=points.map(x=>x.value),lo=Math.floor(Math.min(...vals)-1),hi=Math.ceil(Math.max(...vals)+1),span=Math.max(1,hi-lo);
 const x=i=>points.length===1?(L+W-R)/2:L+i*(W-L-R)/(points.length-1);
 const y=v=>T+(hi-v)*(H-T-B)/span;
 return <div className="card teamProjectionCard"><div className="teamProjectionScroll"><svg viewBox={`0 0 ${W} ${H}`} className="teamProjectionSvg" role="img" aria-label="Season projected fantasy points history">
  {[lo,lo+span/2,hi].map((v,i)=><g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className="rankGrid"/><text x={L-8} y={y(v)+4} textAnchor="end" className="rankAxis">{v.toFixed(1)}</text></g>)}
  {points.length>1?<polyline points={points.map(p=>`${x(p.i)},${y(p.value)}`).join(' ')} fill="none" className="teamProjectionLine"/>:null}
  {points.map(p=><g key={p.i}><circle cx={x(p.i)} cy={y(p.value)} r="5" className="teamProjectionDot"/><text x={x(p.i)} y={H-22} textAnchor="middle" className="weekAxis">{p.date.toLocaleDateString([],{month:'short',day:'numeric'})}</text><title>{`${p.date.toLocaleDateString()}: ${p.value.toFixed(2)} projected pts · ${p.wins.toFixed(2)} projected wins`}</title></g>)}
 </svg></div><div className="teamProjectionLatest"><span><small>Current projection</small><b>{points.at(-1).value.toFixed(2)} pts</b></span><span><small>Projected wins</small><b>{points.at(-1).wins.toFixed(2)}</b></span><span><small>Change</small><b>{points.length>1?`${points.at(-1).value-points[0].value>=0?'+':''}${(points.at(-1).value-points[0].value).toFixed(2)}`:'—'}</b></span></div></div>
}
