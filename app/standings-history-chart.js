'use client';
export default function StandingsHistoryChart({snapshots=[]}){
 const weekNum=w=>w==='CC'?14:w==='PLAYOFFS'?15:Number(String(w).replace(/\D/g,''))||99;
 const weeks=[...new Set(snapshots.map(x=>x.week_key))].sort((a,b)=>weekNum(a)-weekNum(b));
 if(!weeks.length)return <div className="card standingsChartEmpty">The standings graph will begin after Week 1 is finalized.</div>;
 const owners=[...new Map(snapshots.map(x=>[Number(x.owner_id),{id:Number(x.owner_id),name:x.owner_name}])).values()];
 const W=Math.max(720,weeks.length*90+120),H=330,L=55,R=25,T=25,B=55;
 const x=i=>weeks.length===1?(L+W-R)/2:L+i*(W-L-R)/(weeks.length-1),y=r=>T+(Number(r)-1)*(H-T-B)/7;
 return <div className="card standingsChartCard"><div className="standingsChartScroll"><svg className="standingsHistorySvg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Week by week league standings">{[1,2,3,4,5,6,7,8].map(r=><g key={r}><line x1={L} x2={W-R} y1={y(r)} y2={y(r)} className="rankGrid"/><text x={L-12} y={y(r)+4} textAnchor="end" className="rankAxis">{r}</text></g>)}{weeks.map((w,i)=><text key={w} x={x(i)} y={H-20} textAnchor="middle" className="weekAxis">{w}</text>)}{owners.map((o,idx)=>{const rows=weeks.map(w=>snapshots.find(s=>s.week_key===w&&Number(s.owner_id)===o.id)).filter(Boolean);const pts=rows.map(r=>`${x(weeks.indexOf(r.week_key))},${y(r.weekly_rank)}`).join(' ');return <g key={o.id} className="ownerSeries">{rows.length>1?<polyline points={pts} fill="none" className="rankLine"/>:null}{rows.map(r=><g key={r.week_key}><circle cx={x(weeks.indexOf(r.week_key))} cy={y(r.weekly_rank)} r="7" className="rankDot"/><text x={x(weeks.indexOf(r.week_key))} y={y(r.weekly_rank)+3.5} textAnchor="middle" className="rankDotLabel">{idx+1}</text></g>)}</g>})}</svg></div><div className="standingsChartLegend">{owners.map((o,idx)=><span key={o.id}><b>{idx+1}</b> {o.name}</span>)}</div></div>;
}
