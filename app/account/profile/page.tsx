import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { UserInfoEditor } from '@/components/user-info-editor';

export default async function AccountProfilePage() {
  const user = await provisionUserForSession(await auth());
  if (!user) redirect('/');

  return <><header className="app-page-head"><p className="eyebrow">ACCOUNT · PROFILE</p><h1>Your profile</h1><p>Manage the account details and private AI brief for your MCPBuddy workspace.</p></header>
    <section className="account-summary account-email-summary"><div><p className="label">PRIMARY EMAIL</p><b>{user.email}</b><small>Used only to find duplicate GitHub or Google accounts. Merges always need your confirmation.</small></div></section>
    <UserInfoEditor initialValue={user.userInfo} />
  </>;
}
