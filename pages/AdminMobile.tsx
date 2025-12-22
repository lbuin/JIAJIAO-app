import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { Order, Job, OrderStatus } from '../types';
import { IconCheck, IconX, IconLock } from '../components/Icons';

export const AdminMobile: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [orders, setOrders] = useState<(Order & { jobs: Job })[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initial Fetch logic (only runs after auth)
  // Added isBackground param to prevent UI flashing on realtime updates
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isConfigured()) {
      setErrorMsg("请先在电脑端首页或后台配置数据库连接");
      return;
    }

    if (!isBackground) setLoading(true);
    
    const { data, error } = await supabase
      .from('orders')
      .select('*, jobs(*)')
      .eq('status', OrderStatus.PENDING)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMsg("获取数据失败: " + error.message);
    } else {
      setOrders(data as any || []);
    }
    
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
              
              {/* Card Info */}
              <div>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-gray-400">申请人手机/微信</span>
                  <span className="text-xs text-gray-300 font-mono">#{order.id}</span>
                </div>
                <div className="text-xl font-bold text-gray-900 font-mono tracking-wide mb-3 select-all">
                  {order.student_contact}
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="text-xs text-gray-500 block mb-1">关联职位</span>
                  <div className="text-sm font-medium text-gray-700 line-clamp-2">
                    {order.jobs?.title || "未知职位"}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                     {order.jobs?.grade} {order.jobs?.subject} · {order.jobs?.price}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-2">
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