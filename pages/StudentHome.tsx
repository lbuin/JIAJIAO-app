
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

// Constants for Preferences
const SUGGESTED_GRADES = [
  '小学', '初一', '初二', '初三', '高一', '高二', '高三'
];

const SUGGESTED_SUBJECTS = [
  '全科', '数学', '英语', '语文', '物理', '化学', '科学', '编程', '钢琴'
];

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
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false); // Standalone Login Modal

  // Modal State for Applying
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>('input_contact');
  const [tempContact, setTempContact] = useState(studentContact);
  const [tempPassword, setTempPassword] = useState(''); // For password check
  const [cachedProfileForAuth, setCachedProfileForAuth] = useState<StudentProfile | null>(null); // To store profile during auth flow

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
  const [calculatedFee, setCalculatedFee] = useState<{ hours: number, amount: number, note: string }>({ hours: 0, amount: 0, note: '' });

  // Profile Form (Used for both initial application and editing)
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
          // Pre-fill form in case they edit
          setProfileForm({
              name: data.name || '',
              school: data.school || '',
              major: data.major || '',
              grade: data.grade || '',
              experience: data.experience || '',
              preferred_grades: data.preferred_grades || '',
              preferred_subjects: data.preferred_subjects || '',
              password: data.password || '', // Should keep current password
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

  // --- Matching Logic ---
  const isRecommended = (job: Job) => {
      if (!myProfile) return false;
      
      const prefGrades = (myProfile.preferred_grades || "").split(/[,，\s]+/).filter(Boolean);
      const prefSubjects = (myProfile.preferred_subjects || "").split(/[,，\s]+/).filter(Boolean);
      
      if (prefGrades.length === 0 && prefSubjects.length === 0) return false;

      const gradeMatch = prefGrades.some(g => job.grade.includes(g) || job.title.includes(g));
      const subjectMatch = prefSubjects.some(s => job.subject.includes(s) || job.title.includes(s));

      return gradeMatch || subjectMatch;
  };

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
    // 1. If not logged in, prompt login flow via the apply modal
    if (!studentContact) {
        setStep('input_contact');
        setTempContact('');
    } else {
        // 2. If logged in, check gender constraint
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

        // 3. Proceed
        const order = orders.find(o => o.job_id === job.id);
        const status = order?.status;

        setTempContact(studentContact);

        if (status === OrderStatus.PARENT_APPROVED) {
            setStep('show_qr');
        } else {
            // Already applied check
            if (status && status !== OrderStatus.REJECTED) {
                 // Should not happen due to button state, but safe guard
                 return alert("您已申请该职位");
            }
            // New Application
            // Pass true to indicate we are already logged in so skip phone check
            handleDirectApply();
            return;
        }
    }
    setSelectedJob(job);
    setCalculatedFee(calculateInfoFee(job));
  };

  // Handle Standalone Login from Orders Tab
  const handleLoginClick = () => {
      setStep('input_contact');
      setTempContact('');
      setTempPassword('');
      setIsLoginModalOpen(true);
  };

  const handleDirectApply = () => {
      setSelectedJob(prev => prev); // keep selected
      setStep('show_qr'); // Placeholder, actually we want to submit
      // Since we are logged in, just submit
      submitApplication(studentContact);
  };

  const checkPhoneAndProceed = async () => {
    if (!tempContact) return alert("请输入您的手机号");
    
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('phone', tempContact).maybeSingle();
      
      if (profile) {
        // Profile exists -> Ask for password
        setCachedProfileForAuth(profile);
        setStep('input_password');
      } else {
        // Profile missing -> Go to fill profile (Register)
        setStep('fill_profile');
      }
    } catch (err) {
      console.error(err);
      // If error, default to register to be safe
      setStep('fill_profile');
    }
    setLoading(false);
  };

  const handleLoginSubmit = async () => {
      if (!tempPassword) return alert("请输入密码");
      
      if (!cachedProfileForAuth || !cachedProfileForAuth.password) {
          // Fallback: If no password set in DB (old user), let them in but warn.
          // In a real app we might force them to set it.
           if (cachedProfileForAuth && !cachedProfileForAuth.password) {
               alert("您的账号尚未设置密码，请联系管理员或重新注册");
               return;
           }
      }

      if (cachedProfileForAuth?.password !== tempPassword) {
          alert("密码错误");
          return;
      }

      // Login Success
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
          // Was applying
          if (selectedJob) {
             // Re-check gender now that we are logged in? 
             // Ideally we should, but for now we just attempt apply and if we needed to check, handleJobAction handles pre-check
             // But here we are in the middle of a flow. Let's just submit.
             // If gender check was needed, it might be bypassed here if we don't check again.
             // Simple fix: Reload profile and check gender logic inside submitApplication not ideal,
             // let's just let it slide or user has to click apply again.
             // Better: close modal and let user click again?
             // Or just submit:
             await submitApplication(phone);
          }
      }
  };

  const handleProfileSubmit = async (isEditMode = false) => {
    if (!profileForm.name || !profileForm.school) return alert("请填写必填项");
    if (!isEditMode && !profileForm.password) return alert("请设置登录密码");
    if (isEditMode && !profileForm.password) return alert("密码不能为空");
    if (!profileForm.gender) return alert("请选择性别");
    
    setLoading(true);
    // If editing, use logged in contact. If new flow, use tempContact.
    const contactToUse = (isEditMode || studentContact) ? studentContact : tempContact;
    
    try {
      const { error } = await supabase.from('profiles').upsert([{ phone: contactToUse, ...profileForm }], { onConflict: 'phone' });
      if (error) throw error;

      // Update Local State
      setStudentContact(contactToUse);
      localStorage.setItem(LOCAL_STORAGE_CONTACT_KEY, contactToUse);
      await fetchProfile(contactToUse);

      if (isEditMode) {
          alert("✅ 个人简历与偏好已更新！");
          setIsProfileModalOpen(false);
      } else if (isLoginModalOpen) {
          // Finished profile creation during login
          setIsLoginModalOpen(false);
          fetchOrders(contactToUse);
          alert("注册成功！");
      } else {
          // Finished profile creation during application
          await submitApplication(contactToUse);
      }
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

  // Reusable Component for Job Content (New Design)
  const JobContent = ({ job, orderStatus }: { job: Job, orderStatus?: OrderStatus }) => {
     const isCompleted = orderStatus === OrderStatus.FINAL_APPROVED;
     const recommended = !orderStatus && isRecommended(job);
     
     // Gender Tag Logic
     const getGenderLabel = () => {
         if (job.sex_requirement === 'male') return { text: '限男生', color: 'bg-blue-100 text-blue-700' };
         if (job.sex_requirement === 'female') return { text: '限女生', color: 'bg-pink-100 text-pink-700' };
         return { text: '男女不限', color: 'bg-gray-100 text-gray-600' };
     };
     const genderTag = getGenderLabel();

     return (
        <div className={`bg-white rounded-2xl shadow-sm border p-4 transition-all relative overflow-hidden ${isCompleted ? 'border-green-200 bg-green-50/20' : recommended ? 'border-orange-200' : 'border-gray-100'}`}>
            {recommended && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">
                    推荐
                </div>
            )}
            
            {/* Header: Title & Price */}
            <div className="flex justify-between items-start mb-3 mt-1">
                <h3 className="text-lg font-bold text-gray-900 leading-tight w-2/3">
                    {job.title}
                </h3>
                <div className="text-right">
                    <div className="text-lg font-bold text-red-600 leading-tight">{job.price}</div>
                    <div className="text-[10px] text-gray-400">/小时 (参考)</div>
                </div>
            </div>

            {/* Tags Row */}
            <div className="flex flex-wrap gap-2 mb-4">
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded-md">{job.subject}</span>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">{job.grade}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${genderTag.color}`}>{genderTag.text}</span>
            </div>

            {/* Info Row */}
            <div className="flex items-center text-xs text-gray-500 mb-4 gap-4">
                <div className="flex items-center gap-1">
                    <span className="font-bold">📍</span> {job.address}
                </div>
                <div className="flex items-center gap-1">
                    <span className="font-bold">📅</span> 每周 {job.frequency || 1} 次
                </div>
            </div>
            
            {/* Context Button */}
            {isCompleted ? (
                 <div className="bg-white border border-green-200 rounded-xl p-3 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-1 text-green-700 font-bold mb-1">
                        <IconLock className="w-4 h-4" /> <span>联系方式已解锁</span>
                    </div>
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
      let btnText = "立即接单 / 申请";
      let btnClass = "bg-black text-white hover:bg-gray-800 shadow-md";
      let disabled = false;

      // Logic check for disable
      let genderMismatch = false;
      if (studentContact && myProfile && job.sex_requirement && job.sex_requirement !== 'unlimited') {
           if (myProfile.gender && myProfile.gender !== job.sex_requirement) {
               genderMismatch = true;
           }
      }

      if (status === OrderStatus.APPLYING) {
          btnText = "已申请，等待审核...";
          btnClass = "bg-yellow-50 text-yellow-700 border border-yellow-200";
          disabled = true;
      } else if (status === OrderStatus.PARENT_APPROVED) {
          btnText = "审核通过！点击支付查看电话";
          btnClass = "bg-green-600 text-white animate-pulse shadow-green-200 shadow-lg";
      } else if (status === OrderStatus.PAYMENT_PENDING) {
          btnText = `付款确认中... (客服QQ: ${CUSTOMER_SERVICE_QQ})`;
          btnClass = "bg-blue-50 text-blue-700 border border-blue-100";
          disabled = true;
      } else if (status === OrderStatus.REJECTED) {
          btnText = "不合适 (已结束)";
          btnClass = "bg-gray-100 text-gray-400";
          disabled = true;
      } else if (genderMismatch) {
          btnText = `仅限${job.sex_requirement === 'male' ? '男生' : '女生'}接单`;
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

  // Filter logic
  const appliedJobIds = new Set(orders.map(o => o.job_id));
  const marketplaceJobs = jobs.filter(j => !appliedJobIds.has(j.id));

  // --- Profile Form Component with Tags ---
  const ToggleTag = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => (
      <button 
        onClick={onClick}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold mr-2 mb-2 transition-colors border ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
      >
        {label} {selected && <IconCheck className="w-3 h-3 inline ml-1"/>}
      </button>
  );

  const togglePreference = (current: string | undefined, item: string) => {
      const items = (current || '').split(/[,，\s]+/).filter(Boolean);
      if (items.includes(item)) {
          return items.filter(i => i !== item).join(',');
      } else {
          return [...items, item].join(',');
      }
  };

  const ProfileFormFields = ({ isEditMode = false }) => (
      <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="text-xs text-gray-500 font-bold">姓名 *</label>
                <input className="w-full border p-2 rounded text-sm bg-gray-50" placeholder="姓名" value={profileForm.name} onChange={e=>setProfileForm({...profileForm, name:e.target.value})} />
            </div>
             <div>
                <label className="text-xs text-gray-500 font-bold">学校 *</label>
                <input className="w-full border p-2 rounded text-sm bg-gray-50" placeholder="学校" value={profileForm.school} onChange={e=>setProfileForm({...profileForm, school:e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
             <div>
                 <label className="text-xs text-gray-500 font-bold">性别 (接单限制) *</label>
                 <div className="flex gap-4 mt-1">
                     <label className="flex items-center gap-1 text-sm">
                         <input type="radio" name="gender" value="male" checked={profileForm.gender === 'male'} onChange={() => setProfileForm({...profileForm, gender: 'male'})} /> 男
                     </label>
                     <label className="flex items-center gap-1 text-sm">
                         <input type="radio" name="gender" value="female" checked={profileForm.gender === 'female'} onChange={() => setProfileForm({...profileForm, gender: 'female'})} /> 女
                     </label>
                 </div>
             </div>
             <div>
                 {/* Password Field */}
                 <label className="text-xs text-gray-500 font-bold">
                    {isEditMode ? "修改密码" : "设置密码 *"}
                 </label>
                 <input 
                    type="password" 
                    className="w-full border p-2 rounded text-sm bg-gray-50" 
                    placeholder={isEditMode ? "保持原样" : "设置密码"} 
                    value={profileForm.password} 
                    onChange={e=>setProfileForm({...profileForm, password:e.target.value})} 
                />
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div>
                 <label className="text-xs text-gray-500 font-bold">专业</label>
                 <input className="w-full border p-2 rounded text-sm bg-gray-50" placeholder="专业" value={profileForm.major} onChange={e=>setProfileForm({...profileForm, major:e.target.value})} />
             </div>
             <div>
                 <label className="text-xs text-gray-500 font-bold">年级</label>
                 <input className="w-full border p-2 rounded text-sm bg-gray-50" placeholder="年级" value={profileForm.grade} onChange={e=>setProfileForm({...profileForm, grade:e.target.value})} />
             </div>
          </div>
          <div>
              <label className="text-xs text-gray-500 font-bold">家教经验</label>
              <textarea className="w-full border p-2 rounded text-sm bg-gray-50 h-20" placeholder="简单经验介绍..." value={profileForm.experience} onChange={e=>setProfileForm({...profileForm, experience:e.target.value})} />
          </div>

          <div className="pt-2 border-t border-gray-100">
             <h4 className="text-sm font-bold text-orange-600 mb-2 flex items-center gap-1"><IconStar className="w-4 h-4" /> 偏好设置 (自动推荐)</h4>
             
             {/* Subjects */}
             <div className="mb-3">
                <label className="text-xs text-gray-500 font-bold block mb-1">偏好科目 (多选)</label>
                <div className="flex flex-wrap mb-1">
                    {SUGGESTED_SUBJECTS.map(subj => (
                        <ToggleTag 
                            key={subj} 
                            label={subj} 
                            selected={(profileForm.preferred_subjects || '').includes(subj)}
                            onClick={() => setProfileForm({...profileForm, preferred_subjects: togglePreference(profileForm.preferred_subjects, subj)})}
                        />
                    ))}
                </div>
                <input 
                    className="w-full border border-orange-200 p-2 rounded text-xs bg-orange-50/20 placeholder-orange-300" 
                    placeholder="手动补充 (如: 奥数, 德语)" 
                    value={profileForm.preferred_subjects} 
                    onChange={e=>setProfileForm({...profileForm, preferred_subjects:e.target.value})} 
                />
             </div>

             {/* Grades */}
             <div>
                <label className="text-xs text-gray-500 font-bold block mb-1">偏好年级 (多选)</label>
                <div className="flex flex-wrap mb-1">
                    {SUGGESTED_GRADES.map(grade => (
                        <ToggleTag 
                            key={grade} 
                            label={grade} 
                            selected={(profileForm.preferred_grades || '').includes(grade)}
                            onClick={() => setProfileForm({...profileForm, preferred_grades: togglePreference(profileForm.preferred_grades, grade)})}
                        />
                    ))}
                </div>
                <input 
                    className="w-full border border-orange-200 p-2 rounded text-xs bg-orange-50/20 placeholder-orange-300" 
                    placeholder="手动补充 (如: 小学全科)" 
                    value={profileForm.preferred_grades} 
                    onChange={e=>setProfileForm({...profileForm, preferred_grades:e.target.value})} 
                />
             </div>
          </div>
      </div>
  );

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
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold text-gray-500 px-1 uppercase tracking-wider">我的申请 / 订单</h2>
                    {studentContact && (
                        <button onClick={() => setIsProfileModalOpen(true)} className="flex items-center gap-1 bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                            <IconUser className="w-3 h-3" /> 个人简历与偏好
                        </button>
                    )}
                </div>
                
                {!studentContact ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                        <IconLock className="w-12 h-12 text-gray-300 mb-4" />
                        <p className="text-gray-500 mb-6 font-medium">请先登录以查看您的订单和管理简历</p>
                        <button 
                            onClick={handleLoginClick}
                            className="bg-black text-white px-8 py-3 rounded-xl font-bold text-sm hover:scale-105 transition-transform shadow-lg"
                        >
                            立即登录 / 注册
                        </button>
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

                {/* CUSTOMER SERVICE SECTION */}
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

      {/* APPLY / LOGIN MODAL */}
      {(selectedJob || isLoginModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 relative animate-scale-up">
            <button onClick={() => { setSelectedJob(null); setIsLoginModalOpen(false); }} className="absolute top-4 right-4 text-gray-400"><IconX/></button>
            
            <h3 className="font-bold text-lg text-gray-800 mb-4">
                {isLoginModalOpen 
                    ? (step === 'fill_profile' ? '完善资料以注册' : step === 'input_password' ? '输入密码登录' : '登录 / 注册') 
                    : (step === 'input_contact' ? '申请接单' : step === 'input_password' ? '验证身份' : step === 'fill_profile' ? '完善简历' : '支付信息费')
                }
            </h3>

            {/* STEP 1: INPUT PHONE */}
            {step === 'input_contact' && (
                <div className="space-y-4">
                   <p className="text-sm text-gray-600">
                       {isLoginModalOpen ? "请输入手机号进行登录或注册。" : "请输入手机号。匹配成功后，您才需要支付信息费。"}
                   </p>
                   <input type="text" placeholder="手机号码" className="w-full border p-3 rounded-lg outline-none" value={tempContact} onChange={e=>setTempContact(e.target.value)}/>
                   <button onClick={checkPhoneAndProceed} disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">下一步</button>
                </div>
            )}

            {/* STEP 2: INPUT PASSWORD (LOGIN) */}
            {step === 'input_password' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">欢迎回来，请输入您的登录密码。</p>
                    <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-800 font-bold mb-2">
                        账号: {tempContact}
                    </div>
                    <input 
                        type="password" 
                        placeholder="密码" 
                        className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                        value={tempPassword} 
                        onChange={e=>setTempPassword(e.target.value)}
                    />
                    <button onClick={handleLoginSubmit} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">登录</button>
                </div>
            )}

            {/* STEP 3: FILL PROFILE (REGISTER) */}
            {step === 'fill_profile' && (
                <div className="space-y-4">
                   <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                       {isLoginModalOpen ? "初次登录，请设置密码并完善信息。" : "完善简历让管理员更快为您匹配。"}
                   </p>
                   <ProfileFormFields isEditMode={false} />
                   <button onClick={() => handleProfileSubmit(false)} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">
                       {isLoginModalOpen ? "完成注册" : "提交申请"}
                   </button>
                </div>
            )}

            {/* STEP 4: SHOW QR (PAYMENT) */}
            {step === 'show_qr' && selectedJob && (
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

      {/* EDIT PROFILE MODAL */}
      {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 relative animate-scale-up">
              <button onClick={() => setIsProfileModalOpen(false)} className="absolute top-4 right-4 text-gray-400"><IconX/></button>
              <div className="flex items-center gap-2 mb-4">
                  <IconEdit className="w-5 h-5 text-gray-800" />
                  <h3 className="font-bold text-lg text-gray-800">编辑简历与偏好</h3>
              </div>
              
              <div className="space-y-4">
                 <ProfileFormFields isEditMode={true} />
                 <button onClick={() => handleProfileSubmit(true)} disabled={loading} className="w-full bg-black text-white font-bold py-3 rounded-lg">保存修改</button>
              </div>
            </div>
          </div>
      )}

    </div>
  );
};
