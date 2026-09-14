'use client';

import {FANTASY_WEEKS_2026} from '../lib/fantasy-weeks';

const COLORS=[
  '#60a5fa',
  '#f59e0b',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#a3e635'
];

const timestamp=value=>new Date(value).getTime();

function selectedRuns(history){
  const runs=[...new Map(
    history
      .filter(row=>Number.isFinite(timestamp(row.snapshot_at)))
      .sort((a,b)=>timestamp(a.snapshot_at)-timestamp(b.snapshot_at))
      .map(row=>[
        Number(row.run_id),
        {
          id:Number(row.run_id),
          at:timestamp(row.snapshot_at)
        }
      ])
  ).values()];

  if(!runs.length)return [];

  const selected=[
    {
      ...runs[0],
      label:'Pre',
      title:'Preseason'
    }
  ];

  for(const [index,week] of FANTASY_WEEKS_2026.entries()){
    const cutoff=timestamp(week.end);

    if(Date.now()<cutoff)continue;

    const run=runs
      .filter(item=>item.at<=cutoff)
      .at(-1);

    if(!run)continue;

    selected.push({
      ...run,
      label:index<13
        ?`W${index+1}`
        :index===13
          ?'CC'
          :'PO',
      title:week.label
    });
  }

  return selected;
}

export default function RosterProjectionHistoryChart({
  history=[],
  owners=[]
}){
  const runs=selectedRuns(history);

  if(!runs.length){
    return <div className="card standingsChartEmpty">
      Roster projection history will appear after the preseason projection is published.
    </div>;
  }

  const ownerRows=owners.map(owner=>({
    id:Number(owner.id),
    name:owner.roster_name||owner.name,
    draftSlot:Number(owner.draft_slot)
  }));

  const lookup=new Map(history.map(row=>[
    `${Number(row.run_id)}-${Number(row.owner_id)}`,
    Number(row.projected_points)
  ]));

  const values=runs
    .flatMap(run=>ownerRows.map(owner=>
      lookup.get(`${run.id}-${owner.id}`)
    ))
    .filter(Number.isFinite);

  if(!values.length){
    return <div className="card standingsChartEmpty">
      No roster projection history is available.
    </div>;
  }

  const W=Math.max(680,runs.length*88+130);
  const H=330;
  const L=52;
  const R=24;
  const T=24;
  const B=52;

  const lo=Math.floor(Math.min(...values)-2);
  const hi=Math.ceil(Math.max(...values)+2);
  const span=Math.max(1,hi-lo);

  const x=index=>runs.length===1
    ?(L+W-R)/2
    :L+index*(W-L-R)/(runs.length-1);

  const y=value=>T+(hi-value)*(H-T-B)/span;
  const ticks=[lo,lo+span/2,hi];

  return <div className="card standingsChartCard rosterProjectionChartCard">
    <div className="standingsChartScroll rosterProjectionScroll">
      <svg
        className="rosterProjectionSvg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Projected final fantasy points by roster"
      >
        {ticks.map((value,index)=><g key={index}>
          <line
            x1={L}
            x2={W-R}
            y1={y(value)}
            y2={y(value)}
            className="rankGrid"
          />
          <text
            x={L-8}
            y={y(value)+4}
            textAnchor="end"
            className="rankAxis"
          >
            {value.toFixed(1)}
          </text>
        </g>)}

        {runs.map((run,index)=><text
          key={`${run.title}-${index}`}
          x={x(index)}
          y={H-20}
          textAnchor="middle"
          className="weekAxis"
        >
          {run.label}
        </text>)}

        {ownerRows.map((owner,index)=>{
          const points=runs
            .map((run,runIndex)=>({
              run,
              runIndex,
              value:lookup.get(`${run.id}-${owner.id}`)
            }))
            .filter(point=>Number.isFinite(point.value));

          const color=COLORS[index%COLORS.length];

          return <g
            key={owner.id}
            className="rosterProjectionSeries"
            style={{color}}
          >
            {points.length>1
              ?<polyline
                points={points.map(point=>
                  `${x(point.runIndex)},${y(point.value)}`
                ).join(' ')}
                fill="none"
                className="rosterProjectionLine"
              />
              :null}

            {points.map(point=><g
              key={`${point.run.id}-${owner.id}`}
            >
              <circle
                cx={x(point.runIndex)}
                cy={y(point.value)}
                r="5"
                className="rosterProjectionDot"
              />
              <title>
                {`${owner.name} · ${point.run.title}: ${point.value.toFixed(1)} projected pts`}
              </title>
            </g>)}
          </g>;
        })}
      </svg>
    </div>

    <div className="standingsChartLegend rosterProjectionLegend">
      {ownerRows.map((owner,index)=><span
        key={owner.id}
        style={{color:COLORS[index%COLORS.length]}}
      >
        <i/>
        {owner.name}
      </span>)}
    </div>
  </div>;
}
