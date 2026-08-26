'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
export const nav=[['/','Standings'],['/live','Live'],['/rosters','Rosters'],['/teams','Teams'],['/waivers','Waivers'],['/weekly','Weekly'],['/history','History'],['/league','League'],['/account','Account']];
const mobilePrimary=[['/','Standings','⌂'],['/live','Live','●'],['/rosters','Rosters','▦'],['/waivers','Waivers','↕'],['/account','Account','○']];
function active(path,h){return h==='/'?path===h:path.startsWith(h)}
export function Nav(){const path=usePathname();return <><nav className="nav desktopNav">{nav.map(([h,l])=><Link className={active(path,h)?'active':''} key={h} href={h}>{l}</Link>)}</nav><nav className="mobileDock" aria-label="Primary navigation">{mobilePrimary.map(([h,l,icon])=><Link className={active(path,h)?'active':''} key={h} href={h}><span aria-hidden="true">{icon}</span><small>{l}</small></Link>)}</nav><nav className="mobileMoreNav" aria-label="More navigation">{nav.filter(([h])=>!mobilePrimary.some(([m])=>m===h)).map(([h,l])=><Link className={active(path,h)?'active':''} key={h} href={h}>{l}</Link>)}</nav></>}
