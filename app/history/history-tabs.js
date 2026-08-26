'use client';
import {useState} from 'react';
export default function HistoryTabs({children}){
 const [tab,setTab]=useState('weekly');
 const tabs=[['weekly','Weekly Results'],['draft','Draft Log'],['transactions','Transactions'],['records','Records / Stats']];
 return <><div className="historyTabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div><div className="historyTabBody">{Array.isArray(children)?children.map((c,i)=><div key={i} hidden={tab!==tabs[i]?.[0]}>{c}</div>):children}</div></>;
}
