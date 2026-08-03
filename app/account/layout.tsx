import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { provisionUserForSession } from '@/app/actions';
import { AppShell } from '@/components/app-shell';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/');
  const user = await provisionUserForSession(session);
  if (!user) redirect('/');

  return <AppShell active="account" name={user.name ?? user.email}>
    <div className="account-layout">
      <div className="account-content">{children}</div>
    </div>
  </AppShell>;
}
