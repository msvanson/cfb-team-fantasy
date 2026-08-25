'use client';
import {useEffect,useState} from 'react';
let logoMap=null,logoPromise=null;
const listeners=new Set();
function norm(s=''){return String(s).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim()}
function load(){
 if(logoMap)return Promise.resolve(logoMap);
 if(!logoPromise)logoPromise=fetch('/api/team-logos').then(r=>r.json()).then(j=>{logoMap=j.logos||{};for(const fn of listeners)fn(logoMap);return logoMap}).catch(()=>{logoMap={};return logoMap});
 return logoPromise;
}
export function TeamName({school,team,className='',size='normal'}){
 const name=school||team?.school||team?.location||'Team';
 const [logos,setLogos]=useState(logoMap||{});
 useEffect(()=>{const fn=m=>setLogos({...m});listeners.add(fn);load().then(fn);return()=>listeners.delete(fn)},[]);
 const logo=logos[norm(name)]||logos[norm(team?.abbreviation||'')]||null;
 return <span className={`teamNameWithLogo teamName-${size} ${className}`.trim()}>
   {logo?<img className="schoolLogo" src={logo} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none'}}/>:<span className="schoolLogoPlaceholder" aria-hidden="true"/>}
   <span>{name}</span>
 </span>
}
