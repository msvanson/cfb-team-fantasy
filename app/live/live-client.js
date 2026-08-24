'use client';
import { useEffect, useState } from 'react';

function gameState(g) {
  if (g.completed) return 'FINAL';
  if (g.status === 'in_progress') {
    const q = g.period ? `Q${g.period}` : 'LIVE';
    return g.clock ? `${q} ${g.clock}` : q;
  }
  if (!g.start_time) return 'Scheduled';
  return new Date(g.start_time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function LiveClient() {
  const [data, setData] = useState({ games: [], sync: null, updatedAt: null });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch('/api/live', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, []);

  return <div>
    <div className="panel live-summary">
      <div><strong>{loading ? 'Connecting…' : 'Live feed connected'}</strong></div>
      <div className="muted">Last checked: {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : '—'}</div>
      {data.sync?.liveAvailable === false && <div className="notice">Schedule/results sync is working. CFBD live scoreboard access is not enabled on the current API tier yet.</div>}
      {data.sync?.error && <div className="notice">Sync notice: {data.sync.error}</div>}
    </div>

    {data.games.length === 0 && !loading ? <div className="panel">No drafted-team games in the current live window.</div> : null}

    <div className="game-list">
      {data.games.map(g => <div className="panel game-card" key={g.cfbd_game_id}>
        <div className="game-status">{gameState(g)}</div>
        <div className="game-team">
          <span><strong>{g.away.school}</strong>{g.away.owner_name ? <small>{g.away.owner_name}</small> : null}</span>
          <b>{g.away_score ?? '—'}</b>
        </div>
        <div className="game-team">
          <span><strong>{g.home.school}</strong>{g.home.owner_name ? <small>{g.home.owner_name}</small> : null}</span>
          <b>{g.home_score ?? '—'}</b>
        </div>
      </div>)}
    </div>
  </div>;
}
