import { DataProvider } from '@/data/DataProvider';
import { AppRoutes } from '@/router';
import { useFiltersUrlSync } from '@/store/useFiltersUrlSync';

export function App() {
  useFiltersUrlSync();
  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  );
}
