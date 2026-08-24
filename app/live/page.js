import LiveClient from './live-client';

export const dynamic = 'force-dynamic';

export default function LivePage(){
  return <main>
    <h1>Live Scores</h1>
    <p className="muted">Drafted-team games refresh automatically while this page is open. Official fantasy points are awarded only when a game is final.</p>
    <LiveClient />
  </main>;
}
