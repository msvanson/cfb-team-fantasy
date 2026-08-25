import Link from 'next/link';
export const nav=[['/','Standings'],['/live','Live'],['/rosters','Rosters'],['/teams','Teams / Waivers'],['/weekly','Weekly'],['/history','History'],['/league','League'],['/account','Account']];
export function Nav(){return <nav className="nav">{nav.map(([h,l])=><Link key={h} href={h}>{l}</Link>)}</nav>}
