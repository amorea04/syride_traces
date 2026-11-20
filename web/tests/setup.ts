import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Le premier graphique charge ECharts à la demande (`React.lazy`, 6.3) : sa transformation dépasse le délai par défaut.
configure({ asyncUtilTimeout: 5000 });
