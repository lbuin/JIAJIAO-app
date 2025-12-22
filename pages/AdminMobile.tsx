
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { Order, Job, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconCheck, IconX, IconLock, IconTrash } from '../components/Icons';

type Tab = 'applications' | 'finance' | 'jobs';

export const AdminMobile: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<Tab>('applications');

  // Data Stores
  const [orders, setOrders] = useState<OrderWithDetails[]>([]); 
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]); // Status = PENDING
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- Fetch Logic ---

  // 1. Fetch Orders (Both Applications & Payments)
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isConfigured()) return;
    if (!isBackground) setLoading(true);
    
    // We fetch relevant statuses including FINAL_APPROVED to show history/allow repost
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, jobs(*)')
      .in('status', [
        OrderStatus.APPLYING, 
        OrderStatus.PAYMENT_PENDING, 
        OrderStatus.PARENT_APPROVED, 
        OrderStatus.FINAL_APPROVED
      ])
      .order('created_at', { ascending: false });

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
      setOrders(enrichedOrders);
    }
    
    if (!isBackground) setLoading(false);
  }, []);

  // 2. Fetch Pending Jobs (For Approval)
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

  // --- ACTIONS ---

  const handleApproveApplication = async (id: number) => {
      // Set to PARENT_APPROVED -> Triggers Payment UI for student
      await supabase.from('orders').update({ status: OrderStatus.PARENT_APPROVED }).eq('id', id);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: OrderStatus.PARENT_APPROVED } : o));
  };

  const handleConfirmPayment = async (orderId: number, jobId: number) => {
      // Set Order to FINAL_APPROVED
      const { error: err1 } = await supabase.from('orders').update({ status: OrderStatus.FINAL_APPROVED }).eq('id', orderId);
      if (err1) return alert("订单更新失败");

      // Set Job to TAKEN (so no one else can see it)
      const { error: err2 } = await supabase.from('jobs').update({ status: 'taken' }).eq('id', jobId);
      if (err2) return alert("职位下架失败");

      alert("收款成功！该职位已标记为'已接单'并自动下架。");
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.FINAL_APPROVED, jobs: { ...o.jobs, status: 'taken' } } : o));
  };

  const handleRejectOrder = async (id: number) => {
      await supabase.from('orders').update({ status: OrderStatus.REJECTED }).eq('id', id);
      setOrders(prev => prev.filter(o => o.id !== id));
  };

  const handleJobAction = async (id: number, action: 'published' | 'rejected') => {
    setPendingJobs(prev => prev.filter(j => j.id !== id));
    await supabase.from('jobs').update({ status: action, is_active: action === 'published' }).eq('id', id);
  };

  const handleRelistJob = async (jobId: number) => {
      if(!confirm("确认重新上架吗？这将允许新学生申请。")) return;
      await supabase.from('jobs').update({ status: 'published' }).eq('id', jobId);
      alert("已重新上架！");
  };

  // --- DELETE FUNCTIONALITY ---
  const handleDeleteJob = async (jobId: number) => {
      if(!confirm("⚠️ 危险操作：确定要彻底删除这个帖子吗？\n\n注意：相关的订单记录也会被一并删除！")) return;
      
      // 1. Delete associated orders first to avoid Foreign Key errors
      await supabase.from('orders').delete().eq('job_id', jobId);
      
      // 2. Delete the job
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      
      if(error) {
          alert("删除失败: " + error.message);
      } else {
          alert("删除成功");
          // Update state locally to reflect changes
          setPendingJobs(prev => prev.filter(j => j.id !== jobId));
          // If deleted from finance list, we need to refetch or filter logic. 
          // Since finance list is based on orders, and we deleted orders, filtering orders works.
          setOrders(prev => prev.filter(o => o.job_id !== jobId));
      }
  };

  // --- GROUPING LOGIC ---
  const applications = orders.filter(o => o.status === OrderStatus.APPLYING || o.status === OrderStatus.PARENT_APPROVED);
  const groupedApps: Record<number, OrderWithDetails[]> = {};
  applications.forEach(app => {
      if (!groupedApps[app.job_id]) groupedApps[app.job_id] = [];
      groupedApps[app.job_id].push(app);
  });

  const financeOrders = orders.filter(o => o.status === OrderStatus.PAYMENT_PENDING || o.status === OrderStatus.FINAL_APPROVED);

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
            <button onClick={() => setActiveTab('applications')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'applications' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>待接单 ({applications.length})</button>
            <button onClick={() => setActiveTab('finance')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'finance' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>收款/历史 ({financeOrders.length})</button>
            <button onClick={() => setActiveTab('jobs')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md whitespace-nowrap px-1 transition-all ${activeTab === 'jobs' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>审核帖子 ({pendingJobs.length})</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {errorMsg && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{errorMsg}</div>}

        {/* --- TAB 1: APPLICATIONS (GROUPED BY JOB) --- */}
        {activeTab === 'applications' && (
             Object.keys(groupedApps).length === 0 ? <p className="text-center text-gray-400 mt-10">暂无新申请</p> :
             Object.values(groupedApps).map(group => {
                 const job = group[0].jobs;
                 return (
                    <div key={job.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* Job Header */}
                        <div className="bg-blue-50 p-4 border-b border-blue-100 relative">
                             <div className="flex justify-between items-start pr-6">
                                <div>
                                    <h3 className="font-bold text-gray-800">{job.title}</h3>
                                    <p className="text-xs text-blue-600 mt-1">{job.price} · 每周{job.frequency}次</p>
                                </div>
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-bold">
                                    {group.length} 人申请
                                </span>
                             </div>
                             <div className="mt-2 text-xs text-gray-500">
                                家长: {job.contact_name} ({job.contact_phone})
                             </div>
                             {/* Delete Button (Corner) */}
                             <button 
                                onClick={() => handleDeleteJob(job.id)} 
                                className="absolute top-4 right-2 text-gray-400 hover:text-red-500 p-1"
                             >
                                <IconTrash className="w-4 h-4" />
                             </button>
                        </div>
                        
                        {/* Applicants List */}
                        <div className="divide-y divide-gray-100">
                            {group.map(order => (
                                <div key={order.id} className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <span className="font-bold text-gray-800 mr-2">{order.profile?.name || order.student_contact}</span>
                                            {order.status === OrderStatus.PARENT_APPROVED && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">已通过初审</span>}
                                        </div>
                                        <div className="text-xs text-gray-400">#{order.id}</div>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-3">
                                        {order.profile?.school} · {order.profile?.major} · {order.profile?.grade}
                                        {order.profile?.experience && <div className="mt-1 p-1 bg-gray-50 rounded text-gray-600">{order.profile.experience}</div>}
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button onClick={() => handleRejectOrder(order.id)} className="flex-1 py-1.5 bg-red-50 text-red-600 rounded text-xs font-bold">拒绝</button>
                                        {order.status === OrderStatus.APPLYING ? (
                                            <button onClick={() => handleApproveApplication(order.id)} className="flex-1 py-1.5 bg-black text-white rounded text-xs font-bold">允许支付</button>
                                        ) : (
                                            <button disabled className="flex-1 py-1.5 bg-gray-100 text-gray-400 rounded text-xs font-bold">等待支付...</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                 );
             })
        )}

        {/* --- TAB 2: FINANCE (Payment Pending & History) --- */}
        {activeTab === 'finance' && (
             financeOrders.length === 0 ? <p className="text-center text-gray-400 mt-10">暂无数据</p> :
             financeOrders.map(order => (
                <div key={order.id} className={`bg-white rounded-2xl shadow-sm p-5 border ${order.status === OrderStatus.FINAL_APPROVED ? 'border-green-100 bg-green-50/30' : 'border-gray-100'}`}>
                    <div className="flex justify-between items-center mb-4">
                        {order.status === OrderStatus.FINAL_APPROVED ? (
                            <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full">已完成 (接单成功)</span>
                        ) : (
                            <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full">待确认收款</span>
                        )}
                        <span className="text-xs text-gray-400">#{order.id}</span>
                    </div>
                    <div className="mb-4">
                        <div className="font-bold text-gray-800">{order.profile?.name || order.student_contact}</div>
                        <div className="text-sm text-gray-500">申请: {order.jobs?.title}</div>
                        <div className="text-xs text-gray-400 mt-1">学生电话: {order.student_contact}</div>
                    </div>
                    
                    {order.status === OrderStatus.PAYMENT_PENDING ? (
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => handleRejectOrder(order.id)} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">驳回</button>
                            <button onClick={() => handleConfirmPayment(order.id, order.job_id)} className="py-2 bg-green-500 text-white rounded-lg font-bold text-sm shadow-green-200 shadow-md">
                                确认收款
                            </button>
                        </div>
                    ) : (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                             <div className="flex justify-between items-center">
                                 <div className="flex gap-2">
                                    <button onClick={() => handleRelistJob(order.job_id)} className="text-xs bg-white border border-gray-300 px-3 py-1 rounded-full text-gray-600 hover:bg-gray-50">
                                        重新上架
                                    </button>
                                 </div>
                                 <button onClick={() => handleDeleteJob(order.job_id)} className="text-xs text-red-400 flex items-center gap-1 hover:text-red-600">
                                     <IconTrash className="w-3 h-3" /> 删除
                                 </button>
                             </div>
                        </div>
                    )}
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
                        <p className="text-sm text-gray-500">{job.grade} {job.subject} · {job.price} · 每周{job.frequency}次</p>
                        <p className="text-xs text-gray-400 mt-1">发布人: {job.contact_name} ({job.contact_phone})</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <button onClick={() => handleDeleteJob(job.id)} className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-red-100 hover:text-red-500">
                             <IconTrash className="w-5 h-5" />
                        </button>
                        <div className="grid grid-cols-2 gap-3 flex-1">
                            <button onClick={() => handleJobAction(job.id, 'rejected')} className="py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm">拒绝</button>
                            <button onClick={() => handleJobAction(job.id, 'published')} className="py-2 bg-blue-600 text-white rounded-lg font-bold text-sm">上架</button>
                        </div>
                    </div>
                </div>
             ))
        )}
      </div>
    </div>
  );
};
