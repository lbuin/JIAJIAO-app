import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { Order, Job, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconCheck, IconX, IconLock } from '../components/Icons';

type Tab = 'orders' | 'jobs';

export const AdminMobile: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Fetch Orders (PAYMENT_PENDING)
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isConfigured()) return;
    if (!isBackground) setLoading(true);
    
    // CHANGED: Filter by PAYMENT_PENDING instead of generic PENDING
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, jobs(*)')
      .eq('status', OrderStatus.PAYMENT_PENDING) 
      .order('created_at', { ascending: true });

    if (ordersError) {
      setErrorMsg("订单失败: " + ordersError.message);
    } else {
      const rawOrders = ordersData as unknown as (Order & { jobs: Job })[];
      const contacts = Array.from(new Set(rawOrders.map(o => o.student_contact)));
      let profilesMap: Record<string, StudentProfile> = {};
      
      if (contacts.length > 0) {
        const { data: profilesData } = await supabase.from('profiles').select('*').in('phone', contacts);
        profilesData?.forEach((p: StudentProfile) => profilesMap[p.phone] = p);
      }
      
      setOrders(rawOrders.map(o => ({ ...o, profile: profilesMap[o.student_contact] })));
    }
    
    if (!isBackground) setLoading(false);
  }, []);

  // 2. Fetch Jobs (Pending)
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

  const handleOrderAction = async (id: number, status: OrderStatus) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    await supabase.from('orders').update({ status }).eq('id', id);
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
            <h1 className="text-lg font-bold">审核后台</h1>
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setActiveTab('orders')} className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'orders' ? 'bg-white shadow' : 'text-gray-500'}`}>资金 ({orders.length})</button>
                <button onClick={() => setActiveTab('jobs')} className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'jobs' ? 'bg-white shadow' : 'text-gray-500'}`}>帖子 ({pendingJobs.length})</button>
            </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {errorMsg && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{errorMsg}</div>}

        {activeTab === 'orders' && (
             orders.length === 0 ? <p className="text-center text-gray-400 mt-10">暂无待确认收款订单</p> :
             orders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <div className="mb-4">
                        <div className="flex justify-between items-start">
                            <span className="text-lg font-bold">{order.profile?.name || order.student_contact}</span>
                            <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">已支付待放号</span>
                        </div>
                        {order.profile && <div className="text-xs text-gray-500 mt-1">{order.profile.school} · {order.profile.major}</div>}
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 mb-4">
                        <div className="text-sm text-orange-900">{order.jobs?.title}</div>
                        <div className="text-xs text-orange-600 mt-1">{order.jobs?.price}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleOrderAction(order.id, OrderStatus.REJECTED)} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">拒绝</button>
                        <button onClick={() => handleOrderAction(order.id, OrderStatus.FINAL_APPROVED)} className="py-2 bg-green-500 text-white rounded-lg font-bold text-sm">确认收款并放号</button>
                    </div>
                </div>
             ))
        )}

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