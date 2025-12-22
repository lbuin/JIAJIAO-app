import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { Order, Job, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconCheck, IconX, IconLock } from '../components/Icons';

type Tab = 'applications' | 'finance' | 'jobs';

export const AdminMobile: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<Tab>('applications');

  // Data Stores
  const [applications, setApplications] = useState<OrderWithDetails[]>([]); // Status = APPLYING
  const [payments, setPayments] = useState<OrderWithDetails[]>([]);         // Status = PAYMENT_PENDING
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);                // Status = PENDING
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- Fetch Logic ---

  // 1. Fetch Orders (Both Applications & Payments)
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isConfigured()) return;
    if (!isBackground) setLoading(true);
    
    // We fetch both relevant statuses
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, jobs(*)')
      .in('status', [OrderStatus.APPLYING, OrderStatus.PAYMENT_PENDING])
      .order('created_at', { ascending: true });

    if (ordersError) {
      setErrorMsg("订单失败: " + ordersError.message);
    } else {
      const rawOrders = ordersData as unknown as (Order & { jobs: Job })[];
      
      // Get Profiles
      const contacts = Array.from(new Set(rawOrders.map(o => o.student_contact)));
      let profilesMap: Record<string, StudentProfile> = {};
      
      if (contacts.length > 0) {
        const { data: profilesData } = await supabase.from('profiles').select('*').in('phone', contacts);
        profilesData?.forEach((p: StudentProfile) => profilesMap[p.phone] = p);
      }
      
      const enrichedOrders = rawOrders.map(o => ({ ...o, profile: profilesMap[o.student_contact] }));
      
      // Split into categories
      setApplications(enrichedOrders.filter(o => o.status === OrderStatus.APPLYING));
      setPayments(enrichedOrders.filter(o => o.status === OrderStatus.PAYMENT_PENDING));
    }
    
    if (!isBackground) setLoading(false);
  }, []);

  // 2. Fetch Pending Jobs
  const fetchPendingJobs = useCallback(async (isBackground = false) => {
    if (!isConfigured()) return;
    if (!isBackground) setLoading(true);

    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
       if (!error.message.includes('column "status" does not exist')) {
           setErrorMsg("帖子获取失败: " + error.message);
       }
    } else {
       setPendingJobs(data || []);
    }

    if (!isBackground) setLoading(false);
  }, []);

  // Realtime
  useEffect(() => {
    if (!isAuthenticated || !isConfigured()) return;
    
    fetchOrders();
    fetchPendingJobs();

    const channel = supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => fetchPendingJobs(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, fetchOrders, fetchPendingJobs]);

  const handleLogin = () => {
    if (passwordInput === 'xk,131579') setIsAuthenticated(true);
    else { alert("密码错误"); setPasswordInput(''); }
  };

  // Actions
  const handleApproveApplication = async (id: number) => {
      // Set to PARENT_APPROVED -> Triggers Payment UI for student
      await supabase.from('orders').update({ status: OrderStatus.PARENT_APPROVED }).eq('id', id);
      setApplications(prev => prev.filter(o => o.id !== id));
  };

  const handleConfirmPayment = async (id: number) => {
      // Set to FINAL_APPROVED -> Unlocks info
      await supabase.from('orders').update({ status: OrderStatus.FINAL_APPROVED }).eq('id', id);
      setPayments(prev => prev.filter(o => o.id !== id));
  };

  const handleRejectOrder = async (id: number) => {
      await supabase.from('orders').update({ status: OrderStatus.REJECTED }).eq('id', id);
      setApplications(prev => prev.filter(o => o.id !== id));
      setPayments(prev => prev.filter(o => o.id !== id));
  };

  const handleJobAction = async (id: number, action: 'published' | 'rejected') => {
    setPendingJobs(prev => prev.filter(j => j.id !== id));
    await supabase.from('jobs').update({ status: action, is_active: action === 'published' }).eq('id', id);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm text-center">
          <IconLock className="w-8 h-8 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-6">管理员入口</h2>
          <input type="password" className="w-full border p-4 rounded-xl mb-4 text-center" placeholder="Access Code" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
          <button onClick={handleLogin} className="w-full bg-black text-white font-bold py-4 rounded-xl">Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <div className="bg-white px-4 pt-4 pb-2 shadow-sm sticky top-0 z-20">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg font-bold">后台管理</h1>
            <div className="text-xs text-gray-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> 在线
            </div>
        </div>
        
        {/* Tabs */}
        <div className="flex bg-gray-100 p-1 rounded-lg gap-1 overflow-x-auto">
            <button onClick={() => setActiveTab('applications')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'applications' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>新申请 ({applications.length})</button>
            <button onClick={() => setActiveTab('finance')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'finance' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>待收款 ({payments.length})</button>
            <button onClick={() => setActiveTab('jobs')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'jobs' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>帖子 ({pendingJobs.length})</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {errorMsg && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{errorMsg}</div>}

        {/* --- TAB 1: APPLICATIONS (Intermediary Mode) --- */}
        {activeTab === 'applications' && (
             applications.length === 0 ? <p className="text-center text-gray-400 mt-10">暂无新申请</p> :
             applications.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                        <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">需对接家长</span>
                        <span className="text-xs text-gray-400">#{order.id}</span>
                    </div>
                    <div className="mb-4">
                        <div className="font-bold text-lg">{order.profile?.name || order.student_contact}</div>
                        <div className="text-sm text-gray-500">{order.profile?.school} · {order.profile?.major} · {order.profile?.grade}</div>
                        {order.profile?.experience && (
                            <div className="mt-2 text-xs bg-gray-50 p-2 rounded text-gray-600 border border-gray-100">
                                {order.profile.experience}
                            </div>
                        )}
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                        <div className="text-[10px] text-blue-800 font-bold uppercase mb-1">对接目标 (家长)</div>
                        <div className="text-sm font-bold text-blue-900">{order.jobs?.contact_name}</div>
                        <div className="text-lg font-mono text-blue-700 select-all">{order.jobs?.contact_phone}</div>
                        <div className="text-xs text-blue-600 mt-1">{order.jobs?.title} ({order.jobs?.price})</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleRejectOrder(order.id)} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">不合适</button>
                        <button onClick={() => handleApproveApplication(order.id)} className="py-2 bg-black text-white rounded-lg font-bold text-sm shadow-md">
                            允许付款
                        </button>
                    </div>
                </div>
             ))
        )}

        {/* --- TAB 2: FINANCE (Payment Pending) --- */}
        {activeTab === 'finance' && (
             payments.length === 0 ? <p className="text-center text-gray-400 mt-10">暂无待确认收款</p> :
             payments.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full">已支付</span>
                        <span className="text-xs text-gray-400">#{order.id}</span>
                    </div>
                    <div className="mb-4">
                        <div className="font-bold text-gray-800">{order.profile?.name || order.student_contact}</div>
                        <div className="text-sm text-gray-500">申请: {order.jobs?.title}</div>
                        <div className="text-xs text-gray-400 mt-1">学生电话: {order.student_contact}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleRejectOrder(order.id)} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">驳回</button>
                        <button onClick={() => handleConfirmPayment(order.id)} className="py-2 bg-green-500 text-white rounded-lg font-bold text-sm shadow-green-200 shadow-md">
                            确认收款并放号
                        </button>
                    </div>
                </div>
             ))
        )}

        {/* --- TAB 3: JOBS (New Posts) --- */}
        {activeTab === 'jobs' && (
             pendingJobs.length === 0 ? <p className="text-center text-gray-400 mt-10">暂无待审核帖子</p> :
             pendingJobs.map(job => (
                <div key={job.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <div className="mb-3">
                        <h3 className="font-bold text-lg text-gray-900 mb-1">{job.title}</h3>
                        <p className="text-sm text-gray-500">{job.grade} {job.subject} · {job.price}</p>
                        <p className="text-xs text-gray-400 mt-1">发布人: {job.contact_name} ({job.contact_phone})</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleJobAction(job.id, 'rejected')} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">拒绝</button>
                        <button onClick={() => handleJobAction(job.id, 'published')} className="py-2 bg-blue-600 text-white rounded-lg font-bold text-sm">上架</button>
                    </div>
                </div>
             ))
        )}
      </div>
    </div>
  );
};