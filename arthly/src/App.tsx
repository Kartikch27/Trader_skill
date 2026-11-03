import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useLangEffect, useThemeEffect } from './state/hooks';
import { Overview } from './pages/Overview';
import { FindStocks } from './pages/FindStocks';
import { Workspace } from './pages/workspace/Workspace';
import { Research } from './pages/Research';
import { Orders } from './pages/Orders';
import { Alerts } from './pages/Alerts';
import { Settings } from './pages/Settings';
import { AlertMonitor } from './pages/AlertMonitor';

export function App() {
  useThemeEffect();
  useLangEffect();
  return (
    <Layout>
      <AlertMonitor />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/find" element={<FindStocks />} />
        <Route path="/workspace" element={<Navigate to="/workspace/context" replace />} />
        <Route path="/workspace/:step" element={<Workspace />} />
        <Route path="/research" element={<Navigate to="/research/company" replace />} />
        <Route path="/research/:tab" element={<Research />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
