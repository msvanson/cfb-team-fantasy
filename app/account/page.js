import {Nav} from '../nav';
import AccountClient from './account-client';
export const dynamic='force-dynamic';
export default function AccountPage(){
 return <main className="shell"><div className="topbar"><div><div className="brand">Account</div><div className="sub">Sign in and manage your fantasy identity</div></div></div><Nav/><section className="section"><AccountClient/></section></main>
}
