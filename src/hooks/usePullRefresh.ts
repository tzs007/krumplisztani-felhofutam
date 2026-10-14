import { useState } from 'react';

/** Props for a RefreshControl: the spinner shows while `refresh` runs. */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  return { refreshing, onRefresh };
}
