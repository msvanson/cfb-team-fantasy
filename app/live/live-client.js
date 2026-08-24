'use client';
import { useEffect, useState } from 'react';

function gameState(g) {
  if (g.completed) return 'FINAL';
  if (g.status === 'in_progress') {
    const q = g.period ? `Q${g.period}` : 'LIVE';
    return g.clock ? `${q} ${g.clock}` : q;
  }
  if (!g.start_time) return 'Scheduled';
  return new Date(g.start_time).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function winnerClass(g, side) {
  if (!g.completed) return '';
  const home = Number(g.home_score ?? -1);
  const away = Number(g.away_score ?? -1);
  if (side === 'home' && home > away) return 'game-winner';
  if (side === 'away' && away > home) return 'game-winner';
  return '';
}

export default function LiveClient() {
  const [data, setData] = useState({ games: [], sync: null, totalGames: 0, updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState(null);

  async function refresh(force = false) {
    try {
      setRequestError(null);
      const res = await fetch(`/api/live${force ? '?force=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      setData(json);
      if (!res.ok) setRequestError(json.error || `Request failed (${res.status})`);
    } catch (error) {
      setRequestError(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(false), 60000);
    return () => clearInterval(id);
  }, []);

  const games = data.games || [];
  const liveCount = games.filter(g => !g.completed && g.status === 'in_progress').length;
  const finalCount = games.filter(g => g.completed).length;

  return <div>
    <div className="liveHeaderGrid">
      <div className="card">
        <div className="muted">Feed Status</div>
        <div className="liveStatusGood">● Live</div>
        <div className="muted">CFBD Tier 1 connected</div>
      </div>
      <div className="card">
        <div className="muted">Games Live Now</div>
        <div className="kpi">{liveCount}</div>
      </div>
      <div className="card">
        <div className="muted">Finals In Window</div>
        <div className="kpi">{finalCount}</div>
      </div>
    </div>

    <div className="liveMeta">
      <span>Auto-refreshes every minute while open</span>
      <span>Last checked: {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : '—'}</span>
    </div>

    {requestError && <div className="notice">Live feed issue: {requestError}</div>}
    {data.sync?.error && <div className="notice">Sync issue: {data.sync.error}</div>}
    {data.sync?.reason === 'throttled' && <div className="muted liveThrottle">A recent sync is being reused to conserve API calls.</div>}

    {games.length === 0 && !loading
      ? <div className="card liveEmpty">No drafted-team games in the current live window.</div>
      : null}

    <div className="game-list">
      {games.map(g => <div className="card game-card" key={g.cfbd_game_id}>
        <div className="game-status">{gameState(g)}</div>

        <div className={`game-team ${winnerClass(g,'away')}`}>
          <span>
            <strong>{g.away.school}</strong>
            {g.away.owner_name ? <small>{g.away.owner_name}</small> : null}
          </span>
          <b>{g.away_score ?? '—'}</b>
        </div>

        <div className={`game-team ${winnerClass(g,'home')}`}>
          <span>
            <strong>{g.home.school}</strong>
            {g.home.owner_name ? <small>{g.home.owner_name}</small> : null}
          </span>
          <b>{g.home_score ?? '—'}</b>
        </div>
      </div>)}
    </div>
  </div>;
}
