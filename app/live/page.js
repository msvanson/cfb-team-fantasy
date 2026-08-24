import {Nav} from '../nav';import LiveClient from './live-client';export const dynamic='force-dynamic';
export default function LivePage(){
  return <main className="shell">
    <div className="topbar">
      <div>
        <div className="brand">Live Scores</div>
        <div className="sub">Every current game involving a drafted team</div>
      </div>
    </div>
    <Nav/>
    <section className="section"><LiveClient/></section>
  </main>
}
