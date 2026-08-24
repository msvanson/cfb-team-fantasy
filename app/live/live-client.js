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

function StatusLine({ label, value }) {
  return <div className="diag-row"><span>{label}</span><strong>{value ? 'Yes' : 'No'}</strong></div>;
}

export default function LiveClient() {
  const [data, setData] = useState({ games: [], sync: null, diagnostics: null, totalGames: 0, updatedAt: null });
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

  const d = data.diagnostics || {};
  const syncHealthy = data.sync?.ok === true;
  const title = loading ? 'Connecting…' : syncHealthy ? 'CFBD sync connected' : 'CFBD sync needs attention';

  return <div>
    <div className="panel live-summary">
      <div><strong>{title}</strong></div>
      <div className="muted">Last checked: {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : '—'}</div>
      <div className="muted">2026 games stored in Supabase: <strong>{data.totalGames ?? 0}</strong></div>

      {requestError && <div className="notice">API route error: {requestError}</div>}
      {data.sync?.reason === 'missing-sync-secret' && <div className="notice">CFB_SYNC_SECRET is not visible to this Vercel deployment.</div>}
      {data.sync?.reason === 'throttled' && <div className="notice">Sync was skipped because another refresh ran recently. This is normal.</div>}
      {data.sync?.error && <div className="notice">Sync error: {data.sync.error}</div>}
      {data.sync?.scoreboardError && <div className="notice">Live scoreboard: {data.sync.scoreboardError}</div>}
      {data.sync?.liveAvailable === false && <div className="notice">Full-season schedule/results can still work, but live scoreboard access is not enabled on the current CFBD API tier.</div>}

      <details className="diagnostics" open={!syncHealthy || (data.totalGames ?? 0) === 0}>
        <summary>Connection diagnostics</summary>
        <StatusLine label="CFBD_API_KEY available to server" value={d.cfbdApiKeyPresent} />
        <StatusLine label="CFB_SYNC_SECRET available to server" value={d.syncSecretPresent} />
        <StatusLine label="Supabase URL available" value={d.supabaseUrlPresent} />
        <StatusLine label="Supabase publishable key available" value={d.supabasePublishableKeyPresent} />
        <div className="diag-row"><span>Vercel environment</span><strong>{d.vercelEnvironment || 'unknown'}</strong></div>
        <div className="diag-row"><span>Node environment</span><strong>{d.nodeEnvironment || 'unknown'}</strong></div>
        <div className="diag-row"><span>Vercel region</span><strong>{d.runtimeRegion || 'unknown'}</strong></div>
        <div className="diag-row"><span>CFBD key length (value hidden)</span><strong>{d.cfbdApiKeyLength ?? 0}</strong></div>
        <div className="diag-row"><span>Sync secret length (value hidden)</span><strong>{d.syncSecretLength ?? 0}</strong></div>
        <StatusLine label="Vercel deployment ID present" value={d.deploymentIdPresent} />
        <div className="diag-row"><span>Sync claimed / result</span><strong>{data.sync ? JSON.stringify(data.sync) : 'none'}</strong></div>
      </details>
    </div>

    {data.games?.length === 0 && !loading ? <div className="panel">No drafted-team games in the current live window.</div> : null}

    <div className="game-list">
      {(data.games || []).map(g => <div className="panel game-card" key={g.cfbd_game_id}>
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
