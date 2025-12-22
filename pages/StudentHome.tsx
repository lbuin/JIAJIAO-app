import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase, isConfigured, setupSupabase } from '../lib/supabaseClient';
import { Job, Order, OrderStatus, StudentProfile } from '../types';
import { JobCard } from '../components/JobCard';
import { IconX, IconArrowLeft, IconLock } from '../components/Icons';

const LOCAL_STORAGE_CONTACT_KEY = 'tutor_match_student_contact';

type Step = 'input_contact' | 'fill_profile' | 'show_qr';

export const StudentHome: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Configuration State for Error Handling
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [configured, setConfigured] = useState(false);
  
  // Identity state
  const [studentContact, setStudentContact] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_CONTACT_KEY) || '';
  });

  // Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>('input_contact');
  const [tempContact, setTempContact] = useState(studentContact);

  // Profile Form State
  const [profileForm, setProfileForm] = useState<Omit<StudentProfile, 'id' | 'created_at' | 'phone'>>({
    name: '',
    school: '',
    major: '',
    grade: '',
    experience: ''
  });
  const [existingProfileName, setExistingProfileName] = useState<string | null>(null);

  useEffect(() => {
    // Pre-fill config inputs from localStorage if available
    setConfigUrl(localStorage.getItem('VITE_SUPABASE_URL') || '');
    setConfigKey(localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '');
    setConfigured(isConfigured());
  }, []);

  const fetchJobs = useCallback(async () => {
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching jobs:', error.message);
        setErrorMsg(error.message);
      } else {
        setJobs(data || []);
      }
    } catch (err: any) {
      console.error('Network/Unexpected error:', err);
      setErrorMsg(err.message || "连接数据库失败");
    }
  }, []);

  const fetchOrders = useCallback(async (contact: string) => {
    if (!contact) return;
    try {
      // CRITICAL FIX: Order by created_at descending so .find() always hits the latest attempt
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('student_contact', contact)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error.message);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  }, []);

  const handleSaveConfig = async () => {
    const url = configUrl.trim();
    const key = configKey.trim();

    if (!url || !key) return alert("请输入 URL 和 Key");

    try {
      new URL(url);
    } catch (e) {
      return alert("URL 格式无效。请输入以 https:// 开头的有效地址");
    }

    // Update the client instance without reloading
    setupSupabase(url, key);
    setConfigured(true);
    
    // Trigger a refresh
    setLoading(true);
    await fetchJobs();
    if (studentContact) {
      await fetchOrders(studentContact);
    }
    setLoading(false);
  };

  // Initial Load & Realtime Subscription
  useEffect(() => {
    const init = async () => {
      // If credentials are missing, stop here and let the UI show the config form
      if (!isConfigured()) {
        setLoading(false);
        return; 
      }

      setLoading(true);
      await fetchJobs();
      if (studentContact) {
        await fetchOrders(studentContact);
      }
      setLoading(false);
    };
    init();

    // Subscribe to changes in Orders if we have a contact
    if (isConfigured() && studentContact) {
      const channel = supabase
        .channel('student_orders')
        .on(
          'postgres_changes',
          {
            event: '*', 
            schema: 'public', 
            table: 'orders',
            filter: `student_contact=eq.${studentContact}`
          },
          (payload) => {
            console.log('Realtime update:', payload);
            fetchOrders(studentContact);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [studentContact, fetchJobs, fetchOrders, configured]);

  const handleUnlockClick = (job: Job) => {
    setTempContact(studentContact); 
    setStep('input_contact');
    setSelectedJob(job);
    setExistingProfileName(null);
  };

  const checkProfileAndNext = async () => {
    if (!tempContact) return alert("请输入您的手机号");
    
    setLoading(true);
    try {
      // Use maybeSingle to avoid errors on 0 rows
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('phone', tempContact)
        .maybeSingle();

      if (error) {
        // If table profiles doesn't exist (code 42P01), skip resume logic
        if (error.code === '42P01') {
            console.warn("Profiles table missing, skipping check.");
            setStep('show_qr');
        } else {
            console.error("Error checking profile:", error);
            // Default to fill profile if we can't verify existence? 
            // Or skip to QR to avoid blocking payment? 
            // Let's assume new user if error (except connection issues).
            setStep('fill_profile');
        }
      } else if (profile) {
        // Exists
        setExistingProfileName(profile.name);
        setStep('show_qr');
      } else {
        // Does not exist
        setStep('fill_profile');
      }
      
      // Update global contact state
      setStudentContact(tempContact);
      localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, tempContact);

    } catch (err) {
      console.error(err);
      setStep('show_qr');
    }
    setLoading(false);
  };

  const handleProfileSubmit = async () => {
    // Validate
    if (!profileForm.name || !profileForm.school || !profileForm.major) {
      return alert("请填写带 * 的必填项");
    }

    setLoading(true);
    try {
      // Use upsert to handle duplicate keys (if user exists but check failed, or double submit)
      const { error } = await supabase.from('profiles').upsert([
        {
          phone: tempContact,
          ...profileForm
        }
      ], { onConflict: 'phone' });

      if (error) {
        // If table is missing, don't block user, let them pay
        if (error.code === '42P01') {
             console.warn("Profiles table missing during save, skipping.");
             setStep('show_qr');
        } else {
             alert("保存简历失败: " + error.message);
        }
      } else {
        // Success
        setStep('show_qr');
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  const handlePaymentComplete = async () => {
    if (!selectedJob || !studentContact) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('orders').insert([
        {
          job_id: selectedJob.id,
          student_contact: studentContact,
          status: OrderStatus.PENDING,
        }
      ]);

      if (error) {
        alert("创建订单失败: " + error.message);
      } else {
        await fetchOrders(studentContact);
        setSelectedJob(null);
      }
    } catch (err: any) {
      alert("网络错误: " + err.message);
    }
    setLoading(false);
  };

  const getOrderStatus = (jobId: number) => {
    const order = orders.find(o => o.job_id === jobId);
    return order ? order.status : undefined;
  };

  // Conditions
  const isMissingTables = errorMsg && (errorMsg.includes('Could not find the table') || errorMsg.includes('does not exist'));
  const showConfigForm = !configured || (errorMsg && !isMissingTables);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">家教信息平台</h1>
          {studentContact && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              用户: {studentContact}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {showConfigForm && (
          <div className="bg-white border border-red-200 rounded-xl shadow-lg p-6 max-w-lg mx-auto animate-fade-in">
            <div className="text-center mb-6">
               <h3 className={`font-bold text-xl mb-2 ${!configured ? 'text-gray-800' : 'text-red-700'}`}>
                 {!configured ? '欢迎使用' : '连接失败'}
               </h3>
               <p className="text-gray-600">
                  {!configured 
                    ? "请先配置 Supabase 数据库连接。" 
                    : errorMsg?.includes('fetch') 
                        ? "无法连接到 Supabase。您的 URL 可能不正确或缺失。" 
                        : errorMsg}
               </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                <h4 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">数据库配置</h4>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Supabase URL</label>
                    <input 
                      className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="https://your-project.supabase.co"
                      value={configUrl}
                      onChange={e => setConfigUrl(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Supabase Anon Key</label>
                    <input 
                      type="password"
                      className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                      value={configKey}
                      onChange={e => setConfigKey(e.target.value)}
                    />
                </div>
                <button 
                  onClick={handleSaveConfig} 
                  className={`w-full text-white font-bold py-2 rounded transition-colors ${!configured ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  保存并连接
                </button>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-4">
              凭据将保存在本地存储中（仅供演示）。
            </p>
          </div>
        )}

        {isMissingTables && (
          <div className="text-center py-20 px-6">
             <div className="bg-white rounded-full p-4 inline-flex mb-4 shadow-sm">
               <IconX className="text-gray-400 w-8 h-8" />
             </div>
             <h2 className="text-xl font-bold text-gray-700 mb-2">平台维护中</h2>
             <p className="text-gray-500 max-w-sm mx-auto">
               数据库尚未初始化。请联系管理员进行系统表配置。
             </p>
          </div>
        )}

        {configured && loading && !errorMsg ? (
          <div className="text-center text-gray-400 py-10">正在加载...</div>
        ) : (
          !isMissingTables && jobs.map(job => (
            <JobCard 
              key={job.id} 
              job={job} 
              orderStatus={getOrderStatus(job.id)}
              onUnlockClick={handleUnlockClick}
            />
          ))
        )}
        
        {configured && !loading && !errorMsg && !isMissingTables && jobs.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            暂无需求。
          </div>
        )}

        {/* Admin Footer Link */}
        <div className="mt-12 mb-6 flex justify-center opacity-50 hover:opacity-100 transition-opacity">
            <Link 
                to="/my-secret-admin-888" 
                className="flex items-center gap-2 text-xs text-gray-300 hover:text-gray-500 transition-colors px-4 py-2 rounded-full hover:bg-gray-100"
            >
                <IconLock className="w-3 h-3" />
                <span>管理员入口</span>
            </Link>
        </div>

      </main>

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-fade-in my-auto">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">
                {step === 'input_contact' ? '身份验证' : 
                 step === 'fill_profile' ? '完善简历' : '确认支付'}
              </h3>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600">
                <IconX />
              </button>
            </div>
            
            <div className="p-6">
              {step === 'input_contact' && (
                <div className="space-y-4">
                   <p className="text-sm text-gray-600">请输入手机号，以便我们核实身份。</p>
                   <input 
                      type="text" 
                      placeholder="手机号码"
                      className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-lg tracking-wide"
                      value={tempContact}
                      onChange={(e) => setTempContact(e.target.value)}
                   />
                   <button 
                     onClick={checkProfileAndNext}
                     disabled={loading}
                     className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                   >
                     {loading ? '查询中...' : '下一步'}
                   </button>
                </div>
              )}

              {step === 'fill_profile' && (
                <div className="space-y-3">
                   <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded mb-2">
                     初次使用，请简单完善您的家教简历，以便家长更好地了解您。
                   </p>
                   <div>
                     <label className="text-xs font-bold text-gray-700">姓名 *</label>
                     <input className="w-full border p-2 rounded mt-1 text-sm" placeholder="真实姓名"
                       value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                     <div>
                       <label className="text-xs font-bold text-gray-700">在读学校 *</label>
                       <input className="w-full border p-2 rounded mt-1 text-sm" placeholder="如: 北大"
                         value={profileForm.school} onChange={e => setProfileForm({...profileForm, school: e.target.value})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-700">专业 *</label>
                       <input className="w-full border p-2 rounded mt-1 text-sm" placeholder="如: 数学"
                         value={profileForm.major} onChange={e => setProfileForm({...profileForm, major: e.target.value})} />
                     </div>
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-700">年级</label>
                     <input className="w-full border p-2 rounded mt-1 text-sm" placeholder="如: 本科大三 / 研一"
                       value={profileForm.grade} onChange={e => setProfileForm({...profileForm, grade: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-700">家教经验</label>
                     <textarea className="w-full border p-2 rounded mt-1 text-sm h-20" placeholder="简述之前的家教经历..."
                       value={profileForm.experience} onChange={e => setProfileForm({...profileForm, experience: e.target.value})} />
                   </div>
                   
                   <button 
                     onClick={handleProfileSubmit}
                     disabled={loading}
                     className="w-full bg-black text-white font-semibold py-3 rounded-lg hover:bg-gray-800 mt-2 disabled:opacity-50"
                   >
                     {loading ? '保存中...' : '保存并继续'}
                   </button>
                </div>
              )}

              {step === 'show_qr' && (
                <div className="text-center space-y-5">
                   {existingProfileName && (
                     <div className="bg-green-50 text-green-700 p-2 rounded text-sm mb-2">
                       欢迎回来，{existingProfileName}同学
                     </div>
                   )}
                   <div className="bg-blue-50 p-4 rounded-xl inline-block">
                     <img 
                       src="https://picsum.photos/200/200?grayscale" 
                       alt="Payment QR" 
                       className="w-48 h-48 rounded-lg object-cover mix-blend-multiply" 
                     />
                   </div>
                   <div>
                     <p className="font-bold text-gray-800">扫码支付: ¥5.00</p>
                     <p className="text-xs text-gray-500 mt-1">订单: {selectedJob.title}</p>
                   </div>
                   <button 
                     onClick={handlePaymentComplete}
                     disabled={loading}
                     className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 shadow-lg shadow-green-200 disabled:opacity-50"
                   >
                     {loading ? '处理中...' : '我已付款'}
                   </button>
                   
                   <button 
                     onClick={() => setStep('input_contact')}
                     className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-2 py-2"
                   >
                     <div className="inline-flex items-center gap-1">
                       <IconArrowLeft className="w-3 h-3" />
                       <span>更换手机号</span>
                     </div>
                   </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};