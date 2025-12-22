import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StudentHome } from './pages/StudentHome';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminMobile } from './pages/AdminMobile';
import { ParentPost } from './pages/ParentPost';
import { ParentDashboard } from './pages/ParentDashboard';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StudentHome />} />
        <Route path="/post" element={<ParentPost />} />
        <Route path="/parent-login" element={<ParentDashboard />} />
        
        {/* Admin Routes */}
        <Route path="/admin-secret-dashboard" element={<AdminDashboard />} />
        <Route path="/my-secret-admin-888" element={<AdminMobile />} />
      </Routes>
    </HashRouter>
  );
}

export default App;