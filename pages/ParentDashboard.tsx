import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Job, Order, OrderStatus, StudentProfile } from '../types';
import { IconArrowLeft, IconCheck, IconX, IconLock } from '../components/Icons';

interface JobWithCandidates extends Job {
  candidates: (Order & { profile?: StudentProfile })[];
}

export const ParentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Login State
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Dashboard State
  const [myJobs, setMyJobs] = useState<JobWithCandidates[]>([]);

  const handleLogin = async () => {
    if (!phone || !password) return alert("请输入手机号和密码");
    setLoading(true);

    try {
      // 1. Find jobs owned by this parent
      const { data: jobsData, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('contact_phone', phone)
        .eq('manage_password', password)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!jobsData || jobsData.length === 0) {
        alert("未找到记录，请检查手机号或密码是否正确");
        setLoading(false);
        return;
      }

      // 2. Fetch candidates for these jobs
      const jobIds = jobsData.map(j => j.id);
      
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false });

      const rawOrders = ordersData || [];

      // 3. Fetch profiles for these orders
      const contacts = Array.from(new Set(rawOrders.map(o => o.student_contact)));
      let profilesMap: Record<string, StudentProfile> = {};
      
      if (contacts.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('phone', contacts);
        profilesData?.forEach((p: StudentProfile) => profilesMap[p.phone] = p);
      }

      // 4. Merge Data
      const mergedJobs: JobWithCandidates[] = jobsData.map(job => {
        const jobOrders = rawOrders
          .filter(o => o.job_id === job.id)
          .map(o => ({
            ...o,
            profile: profilesMap[o.student_contact]
          }));
        return { ...job, candidates: jobOrders };
      });

      setMyJobs(mergedJobs);
      setIsAuthenticated(true);
    } catch (err: any) {
      alert("登录失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateAction = async (jobId: number, orderId: number, newStatus: OrderStatus) => {
    // Optimistic Update
    setMyJobs(prev => prev.map(job => {
      if (job.id !== jobId) return job;
      return {
        ...job,
        candidates: job.candidates.map(c => c.id === orderId ? { ...c, status: newStatus } : c)
      };
    }));

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      alert("操作失败: " + error.message);
      // In a real app, revert state here
    }
  };

  // --- RENDER LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800">家长管理后台</h2>
            <p className="text-sm text-gray-500 mt-2">查看申请您家教职位的学生</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">手机号</label>
              <input 
                className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="发布时填写的手机号"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">管理密码</label>
              <input 
                type="password"
                className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="发布时设置的密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button 
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 mt-2"
            >
              {loading ? '登录中...' : '登录查看'}
            </button>
            <Link to="/" className="block text-center text-sm text-gray-400 mt-4 hover:text-gray-600">返回首页</Link>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER DASHBOARD ---
  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-20 flex items-center gap-3">
        <button onClick={() => setIsAuthenticated(false)} className="text-gray-500">
           <IconArrowLeft />
        </button>
        <h1 className="text-lg font-bold">我的家教需求 ({myJobs.length})</h1>
      </div>

      <div className="p-4 space-y-6">
        {myJobs.map(job => (
          <div key={job.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-gray-50/50">
               <h3 className="font-bold text-gray-800">{job.title}</h3>
               <p className="text-xs text-gray-500 mt-1">{job.grade} {job.subject} · {job.price}</p>
            </div>

            <div className="p-4">
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                 申请记录 ({job.candidates.length})
               </h4>

               {job.candidates.length === 0 ? (
                 <p className="text-sm text-gray-400 italic">暂无学生申请</p>
               ) : (
                 <div className="space-y-4">
                   {job.candidates.map(order => (
                     <div key={order.id} className="border border-gray-100 rounded-xl p-3 hover:border-blue-100 transition-colors">
                       <div className="flex justify-between items-start mb-2">
                          <div>
                            {order.profile ? (
                                <>
                                    <div className="font-bold text-gray-800">{order.profile.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{order.profile.school} · {order.profile.major}</div>
                                </>
                            ) : (
                                <div className="font-bold text-gray-800">{order.student_contact}</div>
                            )}
                          </div>
                          <StatusBadge status={order.status} />
                       </div>

                       {order.profile?.experience && (
                         <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mb-3 line-clamp-3">
                            {order.profile.experience}
                         </div>
                       )}

                       {/* Actions for Applying status */}
                       {order.status === OrderStatus.APPLYING && (
                         <div className="flex gap-2 mt-2">
                           <button 
                             onClick={() => handleCandidateAction(job.id, order.id, OrderStatus.REJECTED)}
                             className="flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg"
                           >
                             不合适
                           </button>
                           <button 
                             onClick={() => handleCandidateAction(job.id, order.id, OrderStatus.PARENT_APPROVED)}
                             className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg shadow-sm"
                           >
                             同意接触
                           </button>
                         </div>
                       )}
                       
                       {/* Info for other statuses */}
                       {order.status === OrderStatus.PARENT_APPROVED && (
                           <div className="text-xs text-center text-blue-600 bg-blue-50 py-1.5 rounded-lg mt-2">
                               等待学生支付...
                           </div>
                       )}
                       {order.status === OrderStatus.PAYMENT_PENDING && (
                           <div className="text-xs text-center text-orange-600 bg-orange-50 py-1.5 rounded-lg mt-2">
                               学生已支付，等待平台放号
                           </div>
                       )}
                       {order.status === OrderStatus.FINAL_APPROVED && (
                           <div className="text-xs text-center text-green-600 bg-green-50 py-1.5 rounded-lg mt-2 flex items-center justify-center gap-1">
                               <IconCheck className="w-3 h-3"/> 联系方式已发送给学生
                           </div>
                       )}

                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case OrderStatus.APPLYING: return <span className="text-[10px] font-bold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">待审核</span>;
        case OrderStatus.PARENT_APPROVED: return <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">已同意</span>;
        case OrderStatus.PAYMENT_PENDING: return <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">待放号</span>;
        case OrderStatus.FINAL_APPROVED: return <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">成交</span>;
        case OrderStatus.REJECTED: return <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">已拒绝</span>;
        default: return null;
    }
}