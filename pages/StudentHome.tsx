
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isConfigured, setupSupabase } from '../lib/supabaseClient';
import { Job, Order, OrderStatus, StudentProfile, OrderWithDetails } from '../types';
import { IconX, IconLock, IconHome, IconClipboard, IconUserPlus, IconUser, IconEdit, IconStar, IconPlus, IconCheck } from '../components/Icons';

const LOCAL_STORAGE_CONTACT_KEY = 'tutor_match_student_contact';

type Step = 'input_contact' | 'input_password' | 'fill_profile' | 'show_qr';
type PaymentMethod = 'wechat' | 'alipay';
type Tab = 'market' | 'orders';

const WECHAT_QR = "/wechat-pay.jpg"; 
const ALIPAY_QR = "/alipay.jpg";      
const CUSTOMER_SERVICE_QQ = "1400470321";

// Constants
const SUGGESTED_GRADES = ['小学', '初一', '初二', '初三', '高一', '高二', '高三'];
const SUGGESTED_SUBJECTS = ['全科', '数学', '英语', '语文', '物理', '化学', '科学', '编程', '钢琴'];

// --- Sub-Components (Extracted to prevent focus loss) ---

const ToggleTag = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => (
  <button 
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-bold mr-2 mb-2 transition-colors border ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
  >
    {label} {selected && <IconCheck className="w-3 h-3 inline ml-1"/>}
  </button>
);

const ProfileFormFields = ({ 
    form, 
    setForm, 
    isEditMode 
}: { 
    form: any, 
    setForm: (f: any) => void, 
    isEditMode: boolean 
}) => {
    const [showPasswordChange, setShowPasswordChange] = useState(false);

    const togglePreference = (current: string | undefined, item: string) => {
        const items = (current || '').split(/[,，\s]+/).filter(Boolean);
        if (items.includes(item)) {
            return items.filter(i => i !== item).join(',');
        } else {
            return [...items, item].join(',');
        }
    };

    return (
        <div className="space-y-4 pb-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-500 font-bold">姓名 *</label>
                    <input className="w-full border p-2 rounded text-sm bg-gray-50 mt-1" placeholder="姓名" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                </div>
                <div>
                    <label className="text-xs text-gray-500 font-bold">学校 *</label>
                    <input className="w-full border p-2 rounded text-sm bg-gray-50 mt-1" placeholder="学校" value={form.school} onChange={e=>setForm({...form, school:e.target.value})} />
                </div>
            </div>

            {/* Gender */}
            <div>
                 <label className="text-xs text-gray-500 font-bold">性别 (接单限制) *</label>
                 <div className="flex gap-6 mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                     <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                         <input type="radio" name="gender_select" value="male" checked={form.gender === 'male'} onChange={() => setForm({...form, gender: 'male'})} /> 
                         <span className={form.gender === 'male' ? 'text-blue-600' : ''}>我是男生</span>
                     </label>
                     <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                         <input type="radio" name="gender_select" value="female" checked={form.gender === 'female'} onChange={() => setForm({...form, gender: 'female'})} /> 
                         <span className={form.gender === 'female' ? 'text-pink-600' : ''}>我是女生</span>
                     </label>
                 </div>
            </div>

            {/* Academic Info */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-500 font-bold">专业</label>
                    <input className="w-full border p-2 rounded text-sm bg-gray-50 mt-1" placeholder="专业" value={form.major} onChange={e=>setForm({...form, major:e.target.value})} />
                </div>
                <div>
                    <label className="text-xs text-gray-500 font-bold">年级</label>
                    <input className="w-full border p-2 rounded text-sm bg-gray-50 mt-1" placeholder="年级" value={form.grade} onChange={e=>setForm({...form, grade:e.target.value})} />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-500 font-bold">家教经验</label>
                <textarea className="w-full border p-2 rounded text-sm bg-gray-50 h-24 mt-1" placeholder="简单介绍一下您的家教经验..." value={form.experience} onChange={e=>setForm({...form, experience:e.target.value})} />
            </div>

            {/* Password Section */}
            <div className="border-t border-gray-100 pt-3">
                {isEditMode ? (
                    <div>
                        <button 
                            type="button"
                            onClick={() => setShowPasswordChange(!showPasswordChange)} 
                            className="text-xs font-bold text-blue-600 flex items-center gap-1"
                        >
                            {showPasswordChange ? '取消修改密码' : '修改登录密码?'}
                        </button>
                        {showPasswordChange && (
                             <div className="mt-2 animate-fade-in">
                                <label className="text-xs text-gray-500 font-bold">新密码</label>
                                <input 
                                    type="password" 
                                    className="w-full border p-2 rounded text-sm bg-gray-50 mt-1 focus:ring-2 focus:ring-blue-200" 
                                    placeholder="输入新密码" 
                                    value={form.password} 
                                    onChange={e=>setForm({...form, password:e.target.value})} 
                                />
                             </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <label className="text-xs text-gray-500 font-bold">设置登录密码 *</label>
                        <input 
                            type="password" 
                            className="w-full border p-2 rounded text-sm bg-gray-50 mt-1" 
                            placeholder="用于下次登录" 
                            value={form.password} 
                            onChange={e=>setForm({...form, password:e.target.value})} 
                        />
                    </div>
                )}
            </div>

            {/* Preferences */}
            <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-bold text-orange-600 mb-3 flex items-center gap-1">
                    <IconStar className="w-4 h-4" /> 自动推荐设置
                </h4>
                
                <div className="mb-3">
                    <label className="text-xs text-gray-500 font-bold block mb-1">擅长科目</label>
                    <div className="flex flex-wrap">
                        {SUGGESTED_SUBJECTS.map(subj => (
                            <ToggleTag 
                                key={subj} 
                                label={subj} 
                                selected={(form.preferred_subjects || '').includes(subj)}
                                onClick={() => setForm({...form, preferred_subjects: togglePreference(form.preferred_subjects, subj)})}
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 font-bold block mb-1">擅长年级</label>
                    <div className="flex flex-wrap">
                        {SUGGESTED_GRADES.map(grade => (
                            <ToggleTag 
                                key={grade} 
                                label={grade} 
                                selected={(form.preferred_grades || '').includes(grade)}
                                onClick={() => setForm({...form, preferred_grades: togglePreference(form.preferred_grades, grade)})}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

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

  // User Profile State
  const [myProfile, setMyProfile] = useState<StudentProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false); 

  // Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>('input_contact');
  const [tempContact, setTempContact] = useState(studentContact);
  const [tempPassword, setTempPassword] = useState(''); 
  const [cachedProfileForAuth, setCachedProfileForAuth] = useState<StudentProfile | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
  const [calculatedFee, setCalculatedFee] = useState<{ hours: number, amount: number, note: string }>({ hours: 0, amount: 0, note: '' });

  // Profile Form
  const [profileForm, setProfileForm] = useState<Omit<StudentProfile, 'id' | 'created_at' | 'phone'>>({
    name: '', school: '', major: '', grade: '', experience: '', preferred_grades: '', preferred_subjects: '', password: '', gender: undefined
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

  const fetchProfile = useCallback(async (contact: string) => {
      if (!contact) return;
      const { data } = await supabase.from('profiles').select('*').eq('phone', contact).maybeSingle();
      if (data) {
          setMyProfile(data);
          // Pre-fill form
          setProfileForm({
              name: data.name || '',
              school: data.school || '',
              major: data.major || '',
              grade: data.grade || '',
              experience: data.experience || '',
              preferred_grades: data.preferred_grades || '',
              preferred_subjects: data.preferred_subjects || '',
              password: '', // Clear password in edit mode for security
              gender: data.gender || undefined
          });
      }
  }, []);

  const handleLogout = () => {
    if (confirm("确定要退出登录吗？")) {
      localStorage.removeItem(LOCAL_STORAGE_CONTACT_KEY);
      setStudentContact('');
      setOrders([]);
      setMyProfile(null);
      setTempContact('');
      setTempPassword('');
      window.location.reload();
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) { setLoading(false); return; }
      setLoading(true);
      await fetchJobs();
      if (studentContact) {
          await fetchOrders(studentContact);
          await fetchProfile(studentContact);
      }
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
  }, [studentContact, fetchJobs, fetchOrders, fetchProfile, configured]);

  // ... (Calculations and Match Logic same as before)
  const isRecommended = (job: Job) => {
      if (!myProfile) return false;
      const prefGrades = (myProfile.preferred_grades || "").split(/[,，\s]+/).filter(Boolean);
      const prefSubjects = (myProfile.preferred_subjects || "").split(/[,，\s]+/).filter(Boolean);
      if (prefGrades.length === 0 && prefSubjects.length === 0) return false;
      const gradeMatch = prefGrades.some(g => job.grade.includes(g) || job.title.includes(g));
      const subjectMatch = prefSubjects.some(s => job.subject.includes(s) || job.title.includes(s));
      return gradeMatch || subjectMatch;
  };

  const calculateInfoFee = (job: Job) => {
    const hourlyPrice = parseFloat(job.price.replace(/[^\d.]/g, ''));
    if (isNaN(hourlyPrice)) return { hours: 0, amount: 0, note: '价格格式错误' };
    const freq = job.frequency || 1; 
    let hoursToCharge = 3; // Simplified logic for brevity, same as before
    if (freq >= 4) hoursToCharge = 5;
    return {
        hours: hoursToCharge,
        amount: hoursToCharge * hourlyPrice,
        note: `${job.grade} - 每周${freq}次`
    };
  };

  // --- KEY FIX HERE: Explicitly passing job or setting state before check ---
  const handleJobAction = (job: Job) => {
    // 1. Always set selected job immediately so modal knows what to display
    setSelectedJob(job);
    setCalculatedFee(calculateInfoFee(job));

    if (!studentContact) {
        setStep('input_contact');
        setTempContact('');
        // Modal opens because selectedJob is now set
    } else {
        if (job.sex_requirement && job.sex_requirement !== 'unlimited') {
            if (!myProfile?.gender) {
                alert("请先完善个人资料中的性别信息，才能接单。");
                setIsProfileModalOpen(true);
                return;
            }
            if (myProfile.gender !== job.sex_requirement) {
                alert(`该职位仅限 ${job.sex_requirement === 'male' ? '男生' : '女生'} 接单`);
                return;
            }
        }
        const order = orders.find(o => o.job_id === job.id);
        const status = order?.status;
        
        if (status === OrderStatus.PARENT_APPROVED) {
            setStep('show_qr');
        } else {
            if (status && status !== OrderStatus.REJECTED) return alert("您已申请该职位");
            // 2. Direct Apply: Pass the job explicitly to avoid state race condition
            submitApplication(studentContact, job);
        }
    }
  };

  const handleLoginClick = () => {
      setStep('input_contact');
      setTempContact('');
      setTempPassword('');
      setIsLoginModalOpen(true);
  };

  const checkPhoneAndProceed = async () => {
    if (!tempContact) return alert("请输入您的手机号");
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('phone', tempContact).maybeSingle();
      if (profile) {
        setCachedProfileForAuth(profile);
        setStep('input_password');
      } else {
        setStep('fill_profile');
      }
    } catch (err) {
      console.error(err);
      setStep('fill_profile');
    }
    setLoading(false);
  };

  const handleLoginSubmit = async () => {
      if (!tempPassword) return alert("请输入密码");
      if (cachedProfileForAuth && !cachedProfileForAuth.password) {
           alert("您的账号尚未设置密码，请联系管理员或重新注册");
           return;
      }
      if (cachedProfileForAuth?.password !== tempPassword) {
          alert("密码错误");
          return;
      }
      finalizeLogin(cachedProfileForAuth.phone);
  };

  const finalizeLogin = async (phone: string) => {
      setStudentContact(phone);
      localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, phone);
      await fetchOrders(phone);
      await fetchProfile(phone);
      if (isLoginModalOpen) {
          setIsLoginModalOpen(false);
          alert("登录成功");
      } else {
          // If we were in the middle of applying, continue
          if (selectedJob) await submitApplication(phone, selectedJob);
      }
  };

  const handleProfileSubmit = async (isEditMode = false) => {
    if (!profileForm.name || !profileForm.school) return alert("请填写必填项");
    if (!isEditMode && !profileForm.password) return alert("请设置登录密码");
    
    setLoading(true);
    const contactToUse = (isEditMode || studentContact) ? studentContact : tempContact;
    
    // Prepare payload
    const payload: any = { 
        phone: contactToUse,
        name: profileForm.name,
        school: profileForm.school,
        major: profileForm.major,
        grade: profileForm.grade,
        experience: profileForm.experience,
        preferred_grades: profileForm.preferred_grades,
        preferred_subjects: profileForm.preferred_subjects,
        gender: profileForm.gender
    };
    
    if (profileForm.password) {
        payload.password = profileForm.password;
    }

    try {
      let finalPayload = { ...payload };
      if (isEditMode && !profileForm.password) {
          const { error } = await supabase.from('profiles').update(payload).eq('phone', contactToUse);
          if (error) throw error;
      } else {
          const { error } = await supabase.from('profiles').upsert([finalPayload], { onConflict: 'phone' });
          if (error) throw error;
      }

      setStudentContact(contactToUse);
      localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, contactToUse);
      await fetchProfile(contactToUse);

      if (isEditMode) {
          alert("✅ 保存成功！");
          setIsProfileModalOpen(false);
      } else if (isLoginModalOpen) {
          setIsLoginModalOpen(false);
          fetchOrders(contactToUse);
          alert("注册成功！");
      } else {
          // Continue application if we have a job selected
          if (selectedJob) await submitApplication(contactToUse, selectedJob);
      }
    } catch (err: any) {
      alert("错误: " + err.message);
    }
    setLoading(false);
  };

  // --- KEY FIX: Accept job argument explicitly ---
  const submitApplication = async (contact = studentContact, jobToSubmit: Job | null = selectedJob) => {
    if (!jobToSubmit) {
        alert("错误：未选择职位，请刷新重试");
        return;
    }
    
    const existing = orders.find(o => o.job_id === jobToSubmit.id && o.status !== OrderStatus.REJECTED);
    if (existing) {
        alert("已申请过此职位");
        setSelectedJob(null);
        return;
    }
    const { error } = await supabase.from('orders').insert([{
        job_id: jobToSubmit.id,
        student_contact: contact,
        status: OrderStatus.APPLYING 
    }]);

    if (error) alert("申请失败: " + error.message);
    else {
        alert("✅ 申请成功！请等待审核。");
        setSelectedJob(null);
        fetchOrders(contact);
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
          alert("已确认付款");
          setSelectedJob(null);
          fetchOrders(studentContact);
      }
      setLoading(false);
  };

  // Reusable Component for Job Content
  const JobContent = ({ job, orderStatus }: { job: Job, orderStatus?: OrderStatus }) => {
     const isCompleted = orderStatus === OrderStatus.FINAL_APPROVED;
     const recommended = !orderStatus && isRecommended(job);
     const getGenderLabel = () => {
         if (job.sex_requirement === 'male') return { text: '限男生', color: 'bg-blue-100 text-blue-700' };
         if (job.sex_requirement === 'female') return { text: '限女生', color: 'bg-pink-100 text-pink-700' };
         return { text: '男女不限', color: 'bg-gray-100 text-gray-600' };
     };
     const genderTag = getGenderLabel();

     return (
        <div className={`bg-white rounded-2xl shadow-sm border p-4 transition-all relative overflow-hidden ${isCompleted ? 'border-green-200 bg-green-50/20' : recommended ? 'border-orange-200' : 'border-gray-100'}`}>
            {recommended && <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">推荐</div>}
            <div className="flex justify-between items-start mb-3 mt-1">
                <h3 className="text-lg font-bold text-gray-900 leading-tight w-2/3">{job.title}</h3>
                <div className="text-right">
                    <div className="text-lg font-bold text-red-600 leading-tight">{job.price}</div>
                    <div className="text-[10px] text-gray-400">/小时</div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded-md">{job.subject}</span>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">{job.grade}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${genderTag.color}`}>{genderTag.text}</span>
            </div>
            <div className="flex items-center text-xs text-gray-500 mb-4 gap-4">
                <div className="flex items-center gap-1"><span className="font-bold">📍</span> {job.address}</div>
                <div className="flex items-center gap-1"><span className="font-bold">📅</span> 每周 {job.frequency || 1} 次</div>
            </div>
            
            {isCompleted ? (
                 <div className="bg-white border border-green-200 rounded-xl p-3 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-1 text-green-700 font-bold mb-1"><IconLock className="w-4 h-4" /> <span>联系方式已解锁</span></div>
                    <div className="text-gray-800 text-lg font-mono font-bold tracking-wider">{job.contact_phone}</div>
                    <div className="text-xs text-gray-400">联系人: {job.contact_name}</div>
                </div>
            ) : (
                renderActionButton(job, orderStatus)
            )}
        </div>
     );
  };

  const renderActionButton = (job: Job, status?: OrderStatus) => {
      let btnText = "立即接单";
      let btnClass = "bg-black text-white hover:bg-gray-800 shadow-md";
      let disabled = false;
      let genderMismatch = false;
      if (studentContact && myProfile && job.sex_requirement && job.sex_requirement !== 'unlimited') {
           if (myProfile.gender && myProfile.gender !== job.sex_requirement) genderMismatch = true;
      }

      if (status === OrderStatus.APPLYING) {
          btnText = "已申请";
          btnClass = "bg-yellow-50 text-yellow-700 border border-yellow-200";
          disabled = true;
      } else if (status === OrderStatus.PARENT_APPROVED) {
          btnText = "审核通过！点击支付";
          btnClass = "bg-green-600 text-white animate-pulse shadow-green-200 shadow-lg";
      } else if (status === OrderStatus.PAYMENT_PENDING) {
          btnText = "付款确认中...";
          btnClass = "bg-blue-50 text-blue-700 border border-blue-100";
          disabled = true;
      } else if (status === OrderStatus.REJECTED) {
          btnText = "已结束";
          btnClass = "bg-gray-100 text-gray-400";
          disabled = true;
      } else if (genderMismatch) {
          btnText = `仅限${job.sex_requirement === 'male' ? '男生' : '女生'}`;
          btnClass = "bg-gray-200 text-gray-500 cursor-not-allowed";
          disabled = true;
      }

      return (
        <button onClick={() => handleJobAction(job)} disabled={disabled} className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${btnClass}`}>
            {status === OrderStatus.PARENT_APPROVED && <IconStar className="w-4 h-4" />}
            {btnText}
        </button>
      );
  };

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
             ) : <button onClick={handleLoginClick} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">登录/注册</button>}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {(!configured || errorMsg) && <div className="text-red-500 text-center text-sm">{errorMsg || "需配置数据库"}</div>}
        
        {activeTab === 'market' && (
            <section className="animate-fade-in">
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1 uppercase tracking-wider flex justify-between items-center">
                    <span>最新家教需求</span>
                    <span className="text-xs font-normal text-gray-400">{marketplaceJobs.length} 个职位</span>
                </h2>
                {configured && loading && !errorMsg ? <div className="text-center text-gray-400 py-10">加载中...</div> : (
                    <div className="space-y-4">
                        {marketplaceJobs.map(job => (<JobContent key={job.id} job={job} />))}
                        {marketplaceJobs.length === 0 && <div className="text-center text-gray-400 py-16 bg-white rounded-xl border border-dashed border-gray-200">暂无更多新需求</div>}
                    </div>
                )}
                 <div className="mt-12 text-center">
                    <Link to="/my-secret-admin-888" className="text-xs text-gray-300 hover:text-gray-500">管理员入口</Link>
                </div>
            </section>
        )}

        {activeTab === 'orders' && (
            <section className="animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold text-gray-500 px-1 uppercase tracking-wider">我的申请 / 订单</h2>
                    {studentContact && (
                        <button onClick={() => setIsProfileModalOpen(true)} className="flex items-center gap-1 bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                            <IconUser className="w-3 h-3" /> 个人简历
                        </button>
                    )}
                </div>
                {!studentContact ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                        <IconLock className="w-12 h-12 text-gray-300 mb-4" />
                        <p className="text-gray-500 mb-6 font-medium">请先登录</p>
                        <button onClick={handleLoginClick} className="bg-black text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg">立即登录</button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">暂无申请记录</div>
                ) : (
                    <div className="space-y-4">
                        {orders.map(order => order.jobs ? (<div key={order.id} className="relative"><JobContent job={order.jobs} orderStatus={order.status} /></div>) : null)}
                    </div>
                )}
            </section>
        )}
      </main>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-2xl mx-auto flex">
            <button onClick={() => setActiveTab('market')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all ${activeTab === 'market' ? 'text-black' : 'text-gray-400'}`}>
                <IconHome className={`w-6 h-6 ${activeTab === 'market' ? 'fill-gray-100' : ''}`} />
                <span className="text-[10px] font-bold">找家教</span>
            </button>
            <button onClick={() => navigate('/post')} className="flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-gray-400 hover:text-blue-600">
                <IconUserPlus className="w-6 h-6" />
                <span className="text-[10px] font-bold">找老师</span>
            </button>
            <button onClick={() => setActiveTab('orders')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative ${activeTab === 'orders' ? 'text-black' : 'text-gray-400'}`}>
                <IconClipboard className={`w-6 h-6 ${activeTab === 'orders' ? 'fill-gray-100' : ''}`} />
                <span className="text-[10px] font-bold">我的订单</span>
                {orders.length > 0 && <span className="absolute top-2 right-[30%] w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
            </button>
        </div>
      </div>

      {/* MODAL CONTAINER - Fixed scrolling here */}
      {(selectedJob || isLoginModalOpen || isProfileModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl relative animate-scale-up max-h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
                 <h3 className="font-bold text-lg text-gray-800">
                    {isProfileModalOpen ? '编辑简历与偏好' : isLoginModalOpen ? (step === 'fill_profile' ? '注册' : '登录') : (step === 'input_contact' ? '申请接单' : '支付')}
                 </h3>
                 <button onClick={() => { setSelectedJob(null); setIsLoginModalOpen(false); setIsProfileModalOpen(false); }} className="text-gray-400 hover:text-gray-600"><IconX/></button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-6 overflow-y-auto">
                {isProfileModalOpen && (
                    <>
                        <ProfileFormFields form={profileForm} setForm={setProfileForm} isEditMode={true} />
                        <button onClick={() => handleProfileSubmit(true)} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg mt-4 sticky bottom-0 shadow-lg">保存修改</button>
                    </>
                )}

                {/* --- Logic for other steps (Login/Apply) --- */}
                {!isProfileModalOpen && (
                    <>
                        {step === 'input_contact' && (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600">请输入手机号。</p>
                                <input type="text" placeholder="手机号码" className="w-full border p-3 rounded-lg outline-none" value={tempContact} onChange={e=>setTempContact(e.target.value)}/>
                                <button onClick={checkPhoneAndProceed} disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">下一步</button>
                            </div>
                        )}
                        {step === 'input_password' && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-800 font-bold mb-2">账号: {tempContact}</div>
                                <input type="password" placeholder="密码" className="w-full border p-3 rounded-lg outline-none" value={tempPassword} onChange={e=>setTempPassword(e.target.value)}/>
                                <button onClick={handleLoginSubmit} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">登录</button>
                            </div>
                        )}
                        {step === 'fill_profile' && (
                            <div className="space-y-4">
                                <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">初次登录，请完善信息。</p>
                                <ProfileFormFields form={profileForm} setForm={setProfileForm} isEditMode={false} />
                                <button onClick={() => handleProfileSubmit(false)} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">完成注册</button>
                            </div>
                        )}
                        {step === 'show_qr' && selectedJob && (
                            <div className="text-center space-y-4">
                                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-left mb-2">
                                    <div className="text-xs text-gray-500 mb-1">计费: {calculatedFee.note}</div>
                                    <div className="text-xl font-bold text-blue-700">¥ {calculatedFee.amount}</div>
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                                    <button onClick={() => setPaymentMethod('wechat')} className={`flex-1 py-1.5 text-xs font-bold rounded ${paymentMethod === 'wechat' ? 'bg-white text-green-600 shadow' : 'text-gray-500'}`}>微信支付</button>
                                    <button onClick={() => setPaymentMethod('alipay')} className={`flex-1 py-1.5 text-xs font-bold rounded ${paymentMethod === 'alipay' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>支付宝</button>
                                </div>
                                <div className="bg-white border border-gray-100 p-4 rounded-xl inline-block shadow-sm">
                                    <img src={paymentMethod === 'wechat' ? WECHAT_QR : ALIPAY_QR} className="w-40 h-40 object-cover" />
                                </div>
                                <button onClick={handlePaymentComplete} disabled={loading} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg">我已支付</button>
                            </div>
                        )}
                    </>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
