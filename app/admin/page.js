import { Nav } from '../nav';
import { getTeamDirectory } from '../../lib/data';
import { isAdminAuthenticated } from '../../lib/admin-auth';
import { Login, AdminPanel } from './admin-client';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  const authed = await isAdminAuthenticated();
  const teams = authed
    ? await getTeamDirectory()
    : [];

  return (
    <main className="shell commissionerShell">
      <header className="topbar commissionerHeader">
        <div>
          <div className="commissionerEyebrow">
            League administration
          </div>

          <div className="brand">
            Commissioner Center
          </div>

          <div className="sub">
            Monitor league operations, review pending work,
            and safely run commissioner controls.
          </div>
        </div>

        {authed ? (
          <span className="commissionerSignedIn">
            Commissioner
          </span>
        ) : null}
      </header>

      <Nav />

      <section className="section commissionerContent">
        {authed
          ? <AdminPanel teams={teams} />
          : <Login />}
      </section>
    </main>
  );
}
