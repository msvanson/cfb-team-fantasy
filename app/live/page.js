import {Nav} from '../nav';import {LeagueHeader} from '../league-header';import LiveClient from './live-client';export const dynamic='force-dynamic';
export default function LivePage(){return <main className="shell"><LeagueHeader/><Nav/><section className="section livePageSection"><LiveClient/></section></main>}
