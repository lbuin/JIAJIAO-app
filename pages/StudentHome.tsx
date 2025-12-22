
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isConfigured, setupSupabase } from '../lib/supabaseClient';
import { Job, Order, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconX, IconLock, IconHome, IconClipboard, IconUserPlus } from '../components/Icons';

const LOCAL_STORAGE_CONTACT_KEY = 'tutor_match_student_contact';

type Step = 'input_contact' | 'fill_profile' | 'show_qr';
type PaymentMethod = 'wechat' | 'alipay';
type Tab = 'market' | 'orders';

const WECHAT_QR = "/wechat-pay.jpg"; 
const ALIPAY_QR = "/alipay.jpg";      
const CUSTOMER_SERVICE_QQ = "1400470321";

export const StudentHome: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('market');

  // Identity
  const [studentContact, setStudentContact] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_CONTACT_KEY) || '';
  });

  // Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>('input_contact');
  const [tempContact, setTempContact] = useState(studentContact);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
  const [calculatedFee, setCalculatedFee] = useState<{ hours: number, amount: number, note: string }>({ hours: 0, amount: 0, note: '' });

  // Profile Form
  const [profileForm, setProfileForm] = useState<Omit<StudentProfile, 'id' | 'created_at' | 'phone'>>({
    name: '', school: '', major: '', grade: '', experience: ''
  });

  useEffect(() => {
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
        .eq('status', 'published') 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);

    } catch (err: any) {
      setErrorMsg(err.message || "连接数据库失败");
    }
  }, []);

  const fetchOrders = useCallback(async (contact: string) => {
    if (!contact) return;
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, jobs(*)') 
        .eq('student_contact', contact)
        .order('created_at', { ascending: false });
      
      setOrders((data as any) || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleLogout = () => {
    if (confirm("确定要切换账号吗？")) {
      localStorage.removeItem(LOCAL_STORAGE_CONTACT_KEY);
      setStudentContact('');
      setOrders([]);
      window.location.reload();
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) { setLoading(false); return; }
      setLoading(true);
      await fetchJobs();
      if (studentContact) await fetchOrders(studentContact);
      setLoading(false);
    };
    init();

    if (isConfigured() && studentContact) {
      const channel = supabase.channel('student_realtime')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'orders', filter: `student_contact=eq.${studentContact}` }, 
          () => fetchOrders(studentContact)
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [studentContact, fetchJobs, fetchOrders, configured]);

  // --- Fee Calculation ---
  const calculateInfoFee = (job: Job) => {
    const hourlyPrice = parseFloat(job.price.replace(/[^\d.]/g, ''));
    if (isNaN(hourlyPrice)) return { hours: 0, amount: 0, note: '价格格式错误' };
    
    const freq = job.frequency || 1; 
    const grade = job.grade || '';
    let hoursToCharge = 0;

    if (grade.includes('高中')) {
        if (freq === 1) hoursToCharge = 3;
        else if (freq === 2) hoursToCharge = 3.5;
        else if (freq === 3) hoursToCharge = 4;
        else if (freq >= 4) hoursToCharge = 5.5;
    } else if (grade.includes('初中')) {
        if (freq === 1) hoursToCharge = 3;
        else if (freq === 2) hoursToCharge = 4;
        else if (freq === 3) hoursToCharge = 5;
        else if (freq >= 4 && freq < 5) hoursToCharge = 6;
        else if (freq >= 5) hoursToCharge = 7;
    } else {
        const map = [0, 3, 4, 5, 6, 7, 8];
        if (freq < map.length) hoursToCharge = map[freq];
        else hoursToCharge = 8;
    }
    return {
        hours: hoursToCharge,
        amount: hoursToCharge * hourlyPrice,
        note: `${job.grade} - 每周${freq}次`
    };
  };

  const handleJobAction = (job: Job) => {
    const order = orders.find(o => o.job_id === job.id);
    const status = order?.status;

    setSelectedJob(job);
    setTempContact(studentContact);
    setCalculatedFee(calculateInfoFee(job));

    if (status === OrderStatus.PARENT_APPROVED) {
        setStep('show_qr');
    } else {
        setStep('input_contact');
    }
  };

  const checkProfileAndNext = async () => {
    if (!tempContact) return alert("请输入您的手机号");
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('name').eq('phone', tempContact).maybeSingle();
      setStudentContact(tempContact);
      localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, tempContact);

      if (profile) {
        await submitApplication(tempContact);
      } else {
        setStep('fill_profile');
      }
    } catch (err) {
      console.error(err);
      setStep('fill_profile');
    }
    setLoading(false);
  };

  const handleProfileSubmit = async () => {
    if (!profileForm.name || !profileForm.school) return alert("请填写必填项");
    setLoading(true);
    try {
      await supabase.from('profiles').upsert([{ phone: tempContact, ...profileForm }], { onConflict: 'phone' });
      await submitApplication(tempContact);
    } catch (err: any) {
      alert("错误: " + err.message);
    }
    setLoading(false);
  };

  const submitApplication = async (contact = studentContact) => {
    if (!selectedJob) return;
    const existing = orders.find(o => o.job_id === selectedJob.id && o.status !== OrderStatus.REJECTED);
    if (existing) {
        alert("已申请过此职位，请查看'我的订单'。");
        setSelectedJob(null);
        return;
    }
    const { error } = await supabase.from('orders').insert([{
        job_id: selectedJob.id,
        student_contact: contact,
        status: OrderStatus.APPLYING 
    }]);

    if (error) alert("申请失败: " + error.message);
    else {
        alert("✅ 申请成功！请等待审核。");
        setSelectedJob(null);
        fetchOrders(contact);
        // Optional: switch tab to orders to show feedback
        // setActiveTab('orders'); 
    }
  };

  const handlePaymentComplete = async () => {
      if (!selectedJob || !studentContact) return;
      const order = orders.find(o => o.job_id === selectedJob.id);
      if (!order) return;

      setLoading(true);
      const { error } = await supabase.from('orders').update({ status: OrderStatus.PAYMENT_PENDING }).eq('id', order.id);
      if (error) alert(error.message);
      else {
          alert("已确认付款，请等待放号。");
          setSelectedJob(null);
          fetchOrders(studentContact);
      }
      setLoading(false);
  };

  // Reusable Component for Job Content
  const JobContent = ({ job, orderStatus }: { job: Job, orderStatus?: OrderStatus }) => {
     const isCompleted = orderStatus === OrderStatus.FINAL_APPROVED;
     
     return (
        <div className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${isCompleted ? 'border-green-200 bg-green-50/20' : 'border-gray-100'}`}>
            <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-800 line-clamp-2">{job.title}</h3>
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded">{job.subject}</span>
            </div>
            <div className="space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">年级:</span> {job.grade}</p>
                <p><span className="font-medium">价格:</span> {job.price}</p>
                <p><span className="font-medium">次数:</span> 每周 {job.frequency || 1} 次</p>
                <p><span className="font-medium">地址:</span> {job.address}</p>
            </div>
            
            {/* Context Button */}
            {isCompleted ? (
                 <div className="mt-4 bg-white border border-green-200 rounded-lg p-3 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2 text-green-700 font-bold mb-1">
                        <IconLock className="w-4 h-4" /> <span>已获取联系方式</span>
                    </div>
                    <p className="text-gray-800 text-sm"><span className="font-semibold">联系人:</span> {job.contact_name}</p>
                    <p className="text-gray-800 text-lg font-mono"><span className="font-semibold text-sm font-sans">电话:</span> {job.contact_phone}</p>
                </div>
            ) : (
                renderActionButton(job, orderStatus)
            )}
        </div>
     );
  };

  const renderActionButton = (job: Job, status?: OrderStatus) => {
      let btnText = "立即接单 / 申请";
      let btnClass = "bg-black text-white hover:bg-gray-800";
      let disabled = false;

      if (status === OrderStatus.APPLYING) {
          btnText = "已申请，平台对接中...";
          btnClass = "bg-yellow-100 text-yellow-800";
          disabled = true;
      } else if (status === OrderStatus.PARENT_APPROVED) {
          btnText = "申请通过！点击支付获取电话";
          btnClass = "bg-green-600 text-white animate-pulse shadow-green-200 shadow-lg";
      } else if (status === OrderStatus.PAYMENT_PENDING) {
          btnText = `付款确认中... (客服QQ: ${CUSTOMER_SERVICE_QQ})`;
          btnClass = "bg-blue-100 text-blue-800";
          disabled = true;
      } else if (status === OrderStatus.REJECTED) {
          btnText = "不合适 (已结束)";
          btnClass = "bg-gray-100 text-gray-400";
          disabled = true;
      }

      return (
        <button onClick={() => handleJobAction(job)} disabled={disabled} className={`w-full mt-4 py-3 rounded-xl font-bold text-sm transition-all ${btnClass}`}>
            {btnText}
        </button>
      );
  };

  // Filter logic
  const appliedJobIds = new Set(orders.map(o => o.job_id));
  const marketplaceJobs = jobs.filter(j => !appliedJobIds.has(j.id));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">合工大家教平台</h1>
          <div className="flex gap-2 items-center">
             {studentContact ? (
                <div className="flex items-center bg-gray-100 rounded-full pl-3 pr-1 py-1">
                    <span className="text-xs text-gray-500 mr-2">{studentContact.slice(-4)}</span>
                    <button onClick={handleLogout} className="bg-gray-200 hover:bg-gray-300 rounded-full p-1 w-5 h-5 flex items-center justify-center"><IconX className="w-3 h-3" /></button>
                </div>
             ) : <span className="text-xs text-gray-400">未登录</span>}
             {/* "I am parent" link removed from here */}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {(!configured || errorMsg) && <div className="text-red-500 text-center text-sm">{errorMsg || "需配置数据库"}</div>}
        
        {/* --- TAB 1: MARKETPLACE --- */}
        {activeTab === 'market' && (
            <section className="animate-fade-in">
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1 uppercase tracking-wider flex justify-between items-center">
                    <span>最新家教需求</span>
                    <span className="text-xs font-normal text-gray-400">{marketplaceJobs.length} 个职位</span>
                </h2>
                
                {configured && loading && !errorMsg ? <div className="text-center text-gray-400 py-10">加载中...</div> : (
                    <div className="space-y-4">
                        {marketplaceJobs.map(job => (
                            <JobContent key={job.id} job={job} />
                        ))}
                        {marketplaceJobs.length === 0 && <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-dashed border-gray-200">暂无更多新需求</div>}
                    </div>
                )}
                
                 <div className="mt-12 text-center">
                    <Link to="/my-secret-admin-888" className="text-xs text-gray-300 hover:text-gray-500">管理员入口</Link>
                </div>
            </section>
        )}

        {/* --- TAB 2: MY ORDERS --- */}
        {activeTab === 'orders' && (
            <section className="animate-fade-in">
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1 uppercase tracking-wider">我的申请 / 订单</h2>
                
                {!studentContact ? (
                    <div className="text-center py-20 text-gray-500 bg-white rounded-xl border border-dashed">
                        <p>请输入手机号或申请一个职位来查看订单</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                        暂无申请记录，快去“找家教”看看吧
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map(order => {
                            if (!order.jobs) return null; 
                            return (
                                <div key={order.id} className="relative">
                                    {order.jobs.status === 'taken' && (
                                        <div className="absolute -top-2 -right-2 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded-full z-10 shadow-sm">
                                            已接单 (仅自己可见)
                                        </div>
                                    )}
                                    <JobContent job={order.jobs} orderStatus={order.status} />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* CUSTOMER SERVICE SECTION (Visible only in Orders tab now to reduce clutter on home) */}
                <div className="mt-8 bg-white rounded-xl p-4 shadow-sm border border-blue-100 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="font-bold text-gray-800 text-sm">需要帮助？</span>
                        <span className="text-xs text-gray-500 mt-1">审核催单 / 支付问题 / 咨询</span>
                    </div>
                    <div className="text-right">
                        <a href={`mqqwpa://im/chat?chat_type=wpa&uin=${CUSTOMER_SERVICE_QQ}&version=1&src_type=web`} className="text-blue-600 font-bold font-mono text-lg block select-all">
                            {CUSTOMER_SERVICE_QQ}
                        </a>
                        <span className="text-[10px] text-gray-400">点击复制客服 QQ</span>
                    </div>
                </div>
            </section>
        )}
      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-2xl mx-auto flex">
            {/* 1. Find Tutor (Home) */}
            <button 
                onClick={() => setActiveTab('market')}
                className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all ${activeTab === 'market' ? 'text-black' : 'text-gray-400'}`}
            >
                <IconHome className={`w-6 h-6 ${activeTab === 'market' ? 'fill-gray-100' : ''}`} />
                <span className="text-[10px] font-bold">找家教</span>
            </button>
            
            {/* 2. Find Teacher (Parent Entrance) */}
            <button 
                onClick={() => navigate('/post')}
                className="flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-gray-400 hover:text-blue-600"
            >
                <IconUserPlus className="w-6 h-6" />
                <span className="text-[10px] font-bold">找老师</span>
            </button>

            {/* 3. My Orders */}
            <button 
                onClick={() => setActiveTab('orders')}
                className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative ${activeTab === 'orders' ? 'text-black' : 'text-gray-400'}`}
            >
                <IconClipboard className={`w-6 h-6 ${activeTab === 'orders' ? 'fill-gray-100' : ''}`} />
                <span className="text-[10px] font-bold">我的订单</span>
                {orders.length > 0 && (
                    <span className="absolute top-2 right-[30%] w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                )}
            </button>
        </div>
      </div>

      {/* MODAL (Content unchanged) */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 relative animate-scale-up">
            <button onClick={() => setSelectedJob(null)} className="absolute top-4 right-4 text-gray-400"><IconX/></button>
            <h3 className="font-bold text-lg text-gray-800 mb-4">
                {step === 'input_contact' ? '申请接单' : step === 'fill_profile' ? '完善简历' : '支付信息费'}
            </h3>

            {step === 'input_contact' && (
                <div className="space-y-4">
                   <p className="text-sm text-gray-600">请输入手机号。匹配成功后，您才需要支付信息费。</p>
                   <input type="text" placeholder="手机号码" className="w-full border p-3 rounded-lg outline-none" value={tempContact} onChange={e=>setTempContact(e.target.value)}/>
                   <button onClick={checkProfileAndNext} disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">下一步</button>
                </div>
            )}
            {step === 'fill_profile' && (
                <div className="space-y-3">
                   <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">完善简历让管理员更快为您匹配。</p>
                   <input className="w-full border p-2 rounded text-sm" placeholder="姓名 *" value={profileForm.name} onChange={e=>setProfileForm({...profileForm, name:e.target.value})} />
                   <input className="w-full border p-2 rounded text-sm" placeholder="学校 *" value={profileForm.school} onChange={e=>setProfileForm({...profileForm, school:e.target.value})} />
                   <input className="w-full border p-2 rounded text-sm" placeholder="专业" value={profileForm.major} onChange={e=>setProfileForm({...profileForm, major:e.target.value})} />
                   <input className="w-full border p-2 rounded text-sm" placeholder="年级" value={profileForm.grade} onChange={e=>setProfileForm({...profileForm, grade:e.target.value})} />
                   <textarea className="w-full border p-2 rounded text-sm h-20" placeholder="简单经验介绍..." value={profileForm.experience} onChange={e=>setProfileForm({...profileForm, experience:e.target.value})} />
                   <button onClick={handleProfileSubmit} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">提交申请</button>
                </div>
            )}
            {step === 'show_qr' && (
                <div className="text-center space-y-4">
                   <p className="text-sm text-green-700 font-bold">匹配成功！请支付信息费</p>
                   <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-left mb-2">
                        <div className="text-xs text-gray-500 mb-1">计费标准: {calculatedFee.note}</div>
                        <div className="flex justify-between items-end">
                            <span className="text-sm font-bold text-gray-700">应付金额:</span>
                            <span className="text-xl font-bold text-blue-700">¥ {calculatedFee.amount}</span>
                        </div>
                   </div>
                   <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                        <button onClick={() => setPaymentMethod('wechat')} className={`flex-1 py-1.5 text-xs font-bold rounded ${paymentMethod === 'wechat' ? 'bg-white text-green-600 shadow' : 'text-gray-500'}`}>微信支付</button>
                        <button onClick={() => setPaymentMethod('alipay')} className={`flex-1 py-1.5 text-xs font-bold rounded ${paymentMethod === 'alipay' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>支付宝</button>
                   </div>
                   <div className="bg-white border border-gray-100 p-4 rounded-xl inline-block shadow-sm">
                       <img src={paymentMethod === 'wechat' ? WECHAT_QR : ALIPAY_QR} className="w-40 h-40 object-cover" />
                   </div>
                   <button onClick={handlePaymentComplete} disabled={loading} className={`w-full text-white font-bold py-3 rounded-lg ${paymentMethod === 'wechat' ? 'bg-green-600' : 'bg-blue-600'}`}>我已支付</button>
                   <p className="text-xs text-gray-400 mt-2">支付遇到问题？请联系客服 QQ: <span className="text-gray-600 font-bold select-all">{CUSTOMER_SERVICE_QQ}</span></p>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
