import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import './index.css';
import { Calibrate } from './pages/Calibrate';
import { Crew } from './pages/Crew';
import { Dashboard } from './pages/Dashboard';
import { Mission } from './pages/Mission';
import { Modules } from './pages/Modules';
import { ReportPage } from './pages/Report';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/crew" element={<Crew />} />
          <Route path="/mission" element={<Mission />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/calibrate" element={<Calibrate />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
