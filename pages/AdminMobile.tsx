import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { Order, Job, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconCheck, IconX, IconLock } from '../components/Icons';

export const AdminMobile: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initial Fetch logic
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isConfigured()) {
      setErrorMsg("请先在电脑端首页或后台配置数据库连接");
      return;
    }

    if (!isBackground) setLoading(true);
    
    // 1. Fetch Orders
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*, jobs(*)')
      .eq('status', OrderStatus.PENDING)
      .order('created_at', { ascending: true });

    if (ordersError) {
      setErrorMsg("获取订单失败: " + ordersError.message);
      if (!isBackground) setLoading(false);
      return;
    }

    const rawOrders = ordersData as unknown as (Order & { jobs: Job })[];
    
    if (rawOrders.length === 0) {
      setOrders([]);
      if (!isBackground) setLoading(false);
      return;
    }

    // 2. Fetch Profiles for these orders (Client-side join to be robust)
    // Extract unique phone numbers
    const contacts = Array.from(new Set(rawOrders.map(o => o.student_contact)));
    
    let profilesMap: Record<string, StudentProfile> = {};

    if (contacts.length > 0) {
      try {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('phone', contacts);
          
        if (profilesData) {
          profilesData.forEach((p: StudentProfile) => {
            profilesMap[p.phone] = p;
          });
        }
      } catch (err) {
        console.error("Failed to fetch profiles associated with orders", err);
      }
    }

    // 3. Merge Data
    const mergedOrders: OrderWithDetails[] = rawOrders.map(order => ({
      ...order,
      profile: profilesMap[order.student_contact]
    }));

    setOrders(mergedOrders);
    
    if (!isBackground) setLoading(false);
  }, []);

  // Realtime Subscription
  useEffect(() => {
    if (!isAuthenticated || !isConfigured()) return;

    // Initial load
    fetchOrders();

    const channel = supabase
      .channel('admin_mobile_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('New change detected, refreshing list...', payload);
          // Refresh data silently (without full page loading spinner)
          fetchOrders(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, fetchOrders]);

  const handleLogin = () => {
    if (passwordInput === 'xk,131579') {
      setIsAuthenticated(true);
    } else {
      alert("密码错误");
      setPasswordInput('');
    }
  };

  const handleAction = async (orderId: number, status: OrderStatus) => {
    // Optimistic UI update: Remove from list immediately
    setOrders(prev => prev.filter(o => o.id !== orderId));

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      alert("操作失败，请刷新重试: " + error.message);
      fetchOrders(); // Revert/Refresh on error
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm text-center">
          <div className="bg-gray-100 p-4 rounded-full inline-flex mb-6">
             <IconLock className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-6">管理员验证</h2>
          
          <input
            type="password"
            className="w-full border border-gray-300 rounded-xl p-4 mb-4 text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg"
            placeholder="请输入访问密码"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          
          <button
            onClick={handleLogin}
            className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition-colors mb-4 text-lg"
          >
            进入后台
          </button>

          <button
             onClick={() => navigate('/')}
             className="text-gray-400 text-sm hover:text-gray-600 py-2"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* Mobile Header */}
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-800">待审核订单</h1>
            <div className="flex gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[10px] text-gray-400 scale-90">实时</span>
            </div>
        </div>
        <div className="flex gap-2">
             <button onClick={() => fetchOrders()} className="text-sm text-blue-600 font-medium">
                刷新
             </button>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full flex items-center">
            {orders.length}
            </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4">
                {errorMsg}
            </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 mt-10">加载中...</p>
        ) : orders.length === 0 && !errorMsg ? (
          <div className="text-center mt-20 text-gray-400">
            <div className="inline-block p-4 bg-gray-200 rounded-full mb-4">
                <IconCheck className="w-8 h-8 text-gray-500" />
            </div>
            <p>暂无待审核订单</p>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 flex flex-col gap-4 animate-fade-in">
              
              {/* Student Profile Section */}
              <div className="mb-4">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex flex-col">
                      {order.profile ? (
                        <>
                          <span className="text-lg font-bold text-gray-900">{order.profile.name}</span>
                          <span className="text-xs text-gray-500">{order.student_contact}</span>
                        </>
                      ) : (
                        <span className="text-lg font-bold text-gray-900">{order.student_contact}</span>
                      )}
                   </div>
                   <span className="text-xs text-gray-300 font-mono">#{order.id}</span>
                </div>

                {order.profile ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {order.profile.school}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10">
                      {order.profile.major}
                    </span>
                    {order.profile.grade && (
                       <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10">
                         {order.profile.grade}
                       </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic mt-1">
                    未填写详细简历信息
                  </div>
                )}
                
                {order.profile?.experience && (
                  <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="block text-xs text-gray-400 mb-1 font-semibold uppercase">经验</span>
                    {order.profile.experience}
                  </div>
                )}
              </div>
              
              {/* Job Summary */}
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="text-xs font-bold text-orange-800 bg-orange-200 px-1.5 py-0.5 rounded">申请职位</span>
                     <span className="text-xs text-orange-600 truncate flex-1">{order.jobs?.title}</span>
                  </div>
                  <div className="text-xs text-orange-800/70 pl-1">
                     {order.jobs?.grade} {order.jobs?.subject} · {order.jobs?.price}
                  </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => handleAction(order.id, OrderStatus.REJECTED)}
                  className="flex items-center justify-center gap-1 py-3 rounded-xl bg-red-50 text-red-600 font-bold active:bg-red-100 transition-colors touch-manipulation"
                >
                  <IconX className="w-5 h-5" />
                  拒绝
                </button>
                <button
                  onClick={() => handleAction(order.id, OrderStatus.APPROVED)}
                  className="flex items-center justify-center gap-1 py-3 rounded-xl bg-green-500 text-white font-bold shadow-lg shadow-green-200 active:bg-green-600 transition-colors touch-manipulation"
                >
                  <IconCheck className="w-5 h-5" />
                  通过
                </button>
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
};