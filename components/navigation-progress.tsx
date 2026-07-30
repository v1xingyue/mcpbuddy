'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Keeps the current screen interactive while a client-side route transition is in flight. */
export function NavigationProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  useEffect(() => { setLoading(false); }, [pathname]);
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const link = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname !== window.location.pathname) setLoading(true);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return loading ? <div className="navigation-progress" role="status" aria-label="Loading next page"><i /></div> : null;
}
