import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase, isConfigured, setupSupabase } from '../lib/supabaseClient';
import { Job, Order, OrderStatus, StudentProfile } from '../types';
import { JobCard } from '../components/JobCard';
import { IconX, IconArrowLeft, IconLock } from '../components/Icons';

const LOCAL_STORAGE_CONTACT_KEY = 'tutor_match_student_contact';

type Step = 'input_contact' | 'fill_profile' | 'show_qr';
type PaymentMethod = 'wechat' | 'alipay';

// --- 使用 jsDelivr CDN 加速 GitHub 图片，确保国内秒开 ---
// 格式: https://cdn.jsdelivr.net/gh/用户名/仓库名@分支名/文件路径
const WECHAT_QR = "https://cdn.jsdelivr.net/gh/lbuin/JIAJIAO-app@main/163d0a18aa6260eaa1cabf21c2443afa.jpg"; 
const ALIPAY_QR = "https://cdn.jsdelivr.net/gh/lbuin/JIAJIAO-app@main/39fa725bde6f1aaa2665d3fa68edd91f.jpg";      

export const StudentHome: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  
  // Identity state
  const [studentContact, setStudentContact] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_CONTACT_KEY) || '';
  });

  // Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>('input_contact');
  const [tempContact, setTempContact] = useState(studentContact);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');

  // Profile Form State
  const [profileForm, setProfileForm] = useState<Omit<StudentProfile, 'id' | 'created_at' | 'phone'>>({
    name: '',
    school: '',
    major: '',
    grade: '',
    experience: ''
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

      if (error) {
        if (error.message.includes('column "status" does not exist')) {
            const { data: fallbackData } = await supabase.from('jobs').select('*').eq('is_active', true);
            setJobs(fallbackData || []);
        } else {
            setErrorMsg(error.message);
        }
      } else {
        setJobs(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "连接数据库失败");
    }
  }, []);

  const fetchOrders = useCallback(async (contact: string) => {
    if (!contact) return;
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('student_contact', contact)
        .order('created_at', { ascending: false });
      setOrders(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleSaveConfig = async () => {
    if (!configUrl || !configKey) return alert("请输入配置");
    setupSupabase(configUrl, configKey);
    setConfigured(true);
    setLoading(true);
    await fetchJobs();
    if (studentContact) await fetchOrders(studentContact);
    setLoading(false);
  };

  const handleLogout = () => {
    if (confirm("确定要切换账号吗？")) {
      localStorage.removeItem(LOCAL_STORAGE_CONTACT_KEY);
      setStudentContact('');
      setOrders([]); // Clear orders from view
      window.location.reload(); // Reload to ensure clean state
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

  // --- Logic Updated for New Flow ---
  const getOrderStatus = (jobId: number) => {
    const order = orders.find(o => o.job_id === jobId);
    return order ? order.status : undefined;
  };

  const handleJobAction = (job: Job) => {
    const status = getOrderStatus(job.id);
    setSelectedJob(job);
    setTempContact(studentContact);

    // If approved by Admin/Parent, show payment QR immediately
    if (status === OrderStatus.PARENT_APPROVED) {
        setStep('show_qr');
    } else {
        // Otherwise start with contact/profile check to Apply
        setStep('input_contact');
    }
  };

  const checkProfileAndNext = async () => {
    if (!tempContact) return alert("请输入您的手机号");
    setLoading(true);
    try {
      const { data: profile, error } = await supabase.from('profiles').select('name').eq('phone', tempContact).maybeSingle();
      
      if (error && error.code === '42P01') {
          console.warn("Table missing, skipping.");
          submitApplication(); 
          return;
      }

      if (profile) {
        setStudentContact(tempContact);
        localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, tempContact);
        await submitApplication(tempContact);
      } else {
        setStudentContact(tempContact);
        localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, tempContact);
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
    
    // Check for existing order to prevent duplicates if user spams click
    const existing = orders.find(o => o.job_id === selectedJob.id && o.status !== OrderStatus.REJECTED);
    if (existing) {
        alert("您已申请过此职位，请等待审核。");
        setSelectedJob(null);
        return;
    }
    
    const { error } = await supabase.from('orders').insert([{
        job_id: selectedJob.id,
        student_contact: contact,
        status: OrderStatus.APPLYING 
    }]);

    if (error) {
        alert("申请失败: " + error.message);
    } else {
        alert("✅ 申请成功！\n\n平台将会审核您的简历并人工对接家长。\n如果匹配，我们将通知您进行付款。");
        setSelectedJob(null); // Close modal
        fetchOrders(contact);
    }
  };

  const handlePaymentComplete = async () => {
      if (!selectedJob || !studentContact) return;
      
      const order = orders.find(o => o.job_id === selectedJob.id);
      if (!order) return;

      setLoading(true);
      const { error } = await supabase
        .from('orders')
        .update({ status: OrderStatus.PAYMENT_PENDING })
        .eq('id', order.id);

      if (error) alert("更新失败: " + error.message);
      else {
          alert("已确认付款，请等待管理员放号。");
          setSelectedJob(null);
          fetchOrders(studentContact);
      }
      setLoading(false);
  };

  // Modified JobCard Wrapper to handle text
  const renderJobButton = (job: Job, status?: OrderStatus) => {
      if (status === OrderStatus.FINAL_APPROVED) {
        return (
            <div className="mt-4 bg-green-50 border border-green-100 rounded-lg p-3 animate-fade-in">
                <div className="flex items-center gap-2 text-green-700 font-bold mb-1">
                <IconLock className="w-4 h-4" /> <span>联系方式已解锁</span>
                </div>
                <p className="text-gray-800 text-sm"><span className="font-semibold">联系人:</span> {job.contact_name}</p>
                <p className="text-gray-800 text-lg font-mono"><span className="font-semibold text-sm font-sans">电话:</span> {job.contact_phone}</p>
            </div>
        );
      }

      let btnText = "立即接单 / 申请";
      let btnClass = "bg-black text-white hover:bg-gray-800";
      let disabled = false;

      if (status === OrderStatus.APPLYING) {
          btnText = "已申请，平台正在对接家长...";
          btnClass = "bg-yellow-100 text-yellow-800";
          disabled = true;
      } else if (status === OrderStatus.PARENT_APPROVED) {
          btnText = "申请通过！点击支付获取电话";
          btnClass = "bg-green-600 text-white animate-pulse shadow-lg shadow-green-200";
      } else if (status === OrderStatus.PAYMENT_PENDING) {
          btnText = "付款确认中，请稍候...";
          btnClass = "bg-blue-100 text-blue-800";
          disabled = true;
      } else if (status === OrderStatus.REJECTED) {
          btnText = "不合适 (已结束)";
          btnClass = "bg-gray-100 text-gray-400";
          disabled = true;
      }

      return (
        <button
            onClick={() => handleJobAction(job)}
            disabled={disabled}
            className={`w-full mt-4 py-3 rounded-xl font-bold text-sm transition-all ${btnClass}`}
        >
            {btnText}
        </button>
      );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">家教信息平台</h1>
          <div className="flex gap-2 items-center">
             {studentContact ? (
                <div className="flex items-center bg-gray-100 rounded-full pl-3 pr-1 py-1">
                    <span className="text-xs text-gray-500 mr-2">{studentContact.slice(-4)}</span>
                    <button onClick={handleLogout} className="bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full p-1 w-5 h-5 flex items-center justify-center text-[10px]">
                        <IconX className="w-3 h-3" />
                    </button>
                </div>
             ) : (
                <span className="text-xs text-gray-400">未登录</span>
             )}
             <Link to="/post" className="bg-black text-white text-xs px-3 py-1.5 rounded-full font-bold hover:bg-gray-800 transition-colors">我是家长</Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {(!configured || errorMsg) && (
             <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
               <p className="font-bold mb-2">
                 {!configured ? '需要配置 Supabase' : `错误: ${errorMsg}`}
               </p>
               <div className="bg-white p-3 rounded border border-red-100 mt-2">
                 <p className="text-xs text-gray-500 mb-2">Supabase 凭据</p>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input 
                      className="border p-2 rounded text-sm" 
                      placeholder="Supabase URL" 
                      value={configUrl} 
                      onChange={e => setConfigUrl(e.target.value)} 
                    />
                    <input 
                      className="border p-2 rounded text-sm" 
                      type="password" 
                      placeholder="Anon Key" 
                      value={configKey} 
                      onChange={e => setConfigKey(e.target.value)} 
                    />
                 </div>
                 <button onClick={handleSaveConfig} className="mt-2 text-xs bg-red-600 text-white px-3 py-1 rounded">保存并重试</button>
               </div>
             </div>
        )}
        
        {configured && loading && !errorMsg ? <div className="text-center text-gray-400 py-10">加载中...</div> : 
         jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-800 line-clamp-2">{job.title}</h3>
                    <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded">{job.subject}</span>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                    <p><span className="font-medium">年级:</span> {job.grade}</p>
                    <p><span className="font-medium">价格:</span> {job.price}</p>
                    <p><span className="font-medium">地址:</span> {job.address}</p>
                </div>
                {renderJobButton(job, getOrderStatus(job.id))}
            </div>
         ))
        }
        
        {configured && !loading && jobs.length === 0 && <div className="text-center text-gray-500 py-10">暂无需求</div>}
        
        <div className="mt-12 text-center">
            <Link to="/my-secret-admin-888" className="text-xs text-gray-300 hover:text-gray-500">管理员入口</Link>
        </div>
      </main>

      {/* MODAL */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 relative">
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
                   
                   {/* Payment Tabs */}
                   <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                        <button 
                            onClick={() => setPaymentMethod('wechat')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${paymentMethod === 'wechat' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}
                        >
                            微信支付
                        </button>
                        <button 
                            onClick={() => setPaymentMethod('alipay')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${paymentMethod === 'alipay' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                        >
                            支付宝
                        </button>
                   </div>

                   {/* QR Code Display */}
                   <div className="bg-white border border-gray-100 p-4 rounded-xl inline-block shadow-sm">
                       {paymentMethod === 'wechat' ? (
                           <img src={WECHAT_QR} className="w-40 h-40 object-cover" alt="微信支付" />
                       ) : (
                           <img src={ALIPAY_QR} className="w-40 h-40 object-cover" alt="支付宝" />
                       )}
                   </div>

                   <p className="text-xs text-gray-500">扫码支付 ¥5.00 并点击下方按钮</p>
                   <button onClick={handlePaymentComplete} disabled={loading} className={`w-full text-white font-bold py-3 rounded-lg transition-colors ${paymentMethod === 'wechat' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                       我已{paymentMethod === 'wechat' ? '微信' : '支付宝'}支付
                   </button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};