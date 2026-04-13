import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useRefreshOnFocus(callback: () => void | Promise<void>, path: string) {
  const location = useLocation();
  const runRefresh = useCallback(() => {
    void Promise.resolve(callback()).catch((error) => {
      console.error('Refresh on focus failed:', error);
    });
  }, [callback]);

  useEffect(() => {
    if (location.pathname === path) {
      runRefresh();
    }
  }, [location.pathname, path, runRefresh]);

  useEffect(() => {
    if (location.pathname !== path) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        runRefresh();
      }
    };

    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        runRefresh();
      }
    };

    const onPageShow = () => {
      runRefresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [location.pathname, path, runRefresh]);

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.href === path) {
        window.requestAnimationFrame(() => {
          runRefresh();
        });
      }
    };

    window.addEventListener('app-navigate', onNavigate);
    return () => window.removeEventListener('app-navigate', onNavigate);
  }, [path, runRefresh]);
}
