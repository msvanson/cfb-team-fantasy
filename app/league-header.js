import {LEAGUE_NAME} from '../lib/league-config';export function LeagueHeader({action=null}){return <div className="topbar leagueIdentity"><div className="brand">{LEAGUE_NAME}</div>{action}</div>}
