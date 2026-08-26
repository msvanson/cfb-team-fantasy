import {Nav} from '../nav';import {LeagueHeader} from '../league-header';export const dynamic='force-dynamic';
const sections=[
 ['/rosters','Rosters',"View every owner's current roster and previous teams."],
 ['/activity','Activity','Waiver transactions and postseason bonus activity.'],
 ['/weekly','Weekly','Weekly standings, scoring and results.'],
 ['/teams','Teams','Browse every team, schedule and season projections.'],
 ['/history','History','Draft log, weekly history and season archives.'],
 ['/rules','Rules','Scoring, roster construction and fantasy-week schedule.']
];
export default function Page(){return <main className="shell"><LeagueHeader/><Nav/><section className="section leagueMenuSection"><div className="leagueMenu">{sections.map(([href,title,desc])=><a className="card leagueMenuLink" href={href} key={href}><span><b>{title}</b><small>{desc}</small></span><strong aria-hidden="true">›</strong></a>)}</div></section></main>}
