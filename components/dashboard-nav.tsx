export function DashboardNav({ active }: { active: 'dashboard' | 'pages' }) {
  return <div className="dashboard-nav"><a className={active === 'dashboard' ? 'active' : ''} href="/">Dashboard</a><a className={active === 'pages' ? 'active' : ''} href="/pages">Pages</a></div>;
}
