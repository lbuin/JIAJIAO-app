import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StudentHome } from './pages/StudentHome';
import { AdminDashboard } from './pages/AdminDashboard';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StudentHome />} />
        {/* In a real app, protect this route with auth middleware */}
        <Route path="/admin-secret-dashboard" element={<AdminDashboard />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
