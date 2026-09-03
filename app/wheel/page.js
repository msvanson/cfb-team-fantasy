import {Nav} from '../nav';
import {LeagueHeader} from '../league-header';
import WheelClient from './wheel-client';

export const dynamic='force-dynamic';

export default function Page(){
  return (
    <main className="shell">
      <LeagueHeader/>
      <Nav/>
      <WheelClient/>
    </main>
  );
}
