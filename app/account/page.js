import {Nav} from '../nav';import {LeagueHeader} from '../league-header';
import AccountClient from './account-client';
export const dynamic='force-dynamic';
export default function AccountPage(){
 return <main className="shell"><LeagueHeader/><Nav/><div className="pageContext"><b>Account</b><span>Sign in and manage your fantasy identity</span></div><section className="section"><AccountClient/></section></main>
}
