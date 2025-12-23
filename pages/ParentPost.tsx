
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { IconArrowLeft, IconCheck, IconPlus, IconTrash, IconRefresh } from '../components/Icons';
import { CreateJobParams, Job } from '../types';

const PARENT_PHONE_KEY = 'tutor_match_parent_contact';

const SUGGESTED_GRADES = [
  '小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三'
];

const SUGGESTED_SUBJECTS = [
  '全科作业辅导',
  '数学', '英语', '语文',
  '物理', '化学', '生物',
  '历史', '地理', '政治',
  '科学', '编程', '钢琴', '美术'
];

type ViewState = 'login' | 'dashboard' | 'form';

export const ParentPost: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('login');
  
  // Parent Identity
  const [parentPhone, setParentPhone] = useState('');
  
  // Dashboard Data
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form State
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [formData, setFormData] = useState<CreateJobParams>({
    title: '',
    grade: '',
    subject: '',
    price: '',
    frequency: 1,
    address: '',
    contact_name: '',
    contact_phone: ''
  });

  // --- Initialization ---
  useEffect(() => {
    if (!isConfigured()) {
      alert("请先联系管理员配置数据库连接");
      navigate('/');
      return;
    }

    const cachedPhone = localStorage.getItem(PARENT_PHONE_KEY);
    if (cachedPhone) {
      setParentPhone(cachedPhone);
      setFormData(prev => ({ ...prev, contact_phone: cachedPhone }));
      setView('dashboard');
    }
  }, [navigate]);

  // --- Fetch Logic ---
  const fetchMyJobs = useCallback(async () => {
    if (!parentPhone) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('contact_phone', parentPhone)
      .order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else setMyJobs(data || []);
    setLoadingList(false);
  }, [parentPhone]);

  // --- Realtime Subscription ---
  useEffect(() => {
    if (view === 'dashboard' && parentPhone) {
      fetchMyJobs();

      const channel = supabase.channel('parent_jobs')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'jobs', filter: `contact_phone=eq.${parentPhone}` }, 
          () => fetchMyJobs()
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [view, parentPhone, fetchMyJobs]);

  // --- Handlers ---
  const handleLogin = () => {
    if (!/^\d{11}$/.test(parentPhone)) return alert("请输入11位手机号");
    localStorage.setItem(PARENT_PHONE_KEY, parentPhone);
    setFormData(prev => ({ ...prev, contact_phone: parentPhone }));
    setView('dashboard');
  };

  const handleLogout = () => {
    if(confirm("确定要更换手机号吗？")) {
        localStorage.removeItem(PARENT_PHONE_KEY);
        setParentPhone('');
        setView('login');
    }
  };

  const handleDelete = async (id: number) => {
    if(!confirm("确定要删除这条需求吗？")) return;
    await supabase.from('jobs').delete().eq('id', id);
    fetchMyJobs();
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.contact_phone || !formData.price) return alert("请填写完整信息");
    if (!/^\d{11}$/.test(formData.contact_phone)) return alert("手机号必须是 11 位数字");

    setLoadingSubmit(true);
    try {
      const { error } = await supabase.from('jobs').insert([{
        ...formData,
        is_active: false,
        status: 'pending'
      }]);

      if (error) throw error;

      alert("发布成功！请等待管理员审核。");
      // Reset form (except phone)
      setFormData({
        title: '', grade: '', subject: '', price: '', frequency: 1, address: '', contact_name: '', contact_phone: parentPhone
      });
      setView('dashboard');
    } catch (err: any) {
      alert("发布失败: " + err.message);
    } finally {
      setLoadingSubmit(false);
    }
  };

  // --- Helper: Status Badge ---
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'published': return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">已发布 (找老师中)</span>;
      case 'taken': return <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-bold">已解决</span>;
      case 'rejected': return <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold">审核未通过</span>;
      default: return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold">审核中</span>;
    }
  };

  // --- VIEW 1: LOGIN (Phone Entry) ---
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
         <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center">
            <h2 className="text-xl font-bold mb-2">我是家长/学员</h2>
            <p className="text-gray-500 text-sm mb-6">输入手机号查看发布记录或发布新需求</p>
            <input 
              type="tel" 
              className="w-full border p-4 rounded-xl mb-4 text-center text-lg outline-none focus:ring-2 focus:ring-blue-500" 
              placeholder="请输入您的手机号" 
              value={parentPhone} 
              onChange={e => setParentPhone(e.target.value)} 
              maxLength={11}
            />
            <button onClick={handleLogin} className="w-full bg-black text-white font-bold py-4 rounded-xl shadow-lg">进入</button>
            <Link to="/" className="block mt-6 text-sm text-gray-400">返回学生端</Link>
         </div>
      </div>
    );
  }

  // --- VIEW 2: DASHBOARD (List) ---
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <header className="bg-white sticky top-0 z-10 border-b border-gray-100 px-4 h-16 flex items-center justify-between shadow-sm">
           <Link to="/" className="text-gray-600"><IconArrowLeft className="w-6 h-6"/></Link>
           <h1 className="text-lg font-bold">我的发布管理</h1>
           <button onClick={handleLogout} className="text-xs text-gray-400">切换账号</button>
        </header>

        <main className="p-4 max-w-lg mx-auto space-y-4">
           {/* Header Info */}
           <div className="flex justify-between items-center px-1">
              <div className="text-sm text-gray-500">
                当前账号: <span className="font-mono font-bold text-gray-800">{parentPhone}</span>
              </div>
              <button onClick={() => fetchMyJobs()} className="text-blue-600 p-1"><IconRefresh className="w-4 h-4"/></button>
           </div>

           {/* Job List */}
           {loadingList ? (
             <div className="text-center py-10 text-gray-400">加载中...</div>
           ) : myJobs.length === 0 ? (
             <div className="bg-white rounded-xl p-8 text-center border border-dashed border-gray-300">
                <p className="text-gray-400 mb-4">您还没有发布过需求</p>
                <button onClick={() => setView('form')} className="bg-black text-white px-6 py-2 rounded-lg font-bold text-sm">立即发布第一条</button>
             </div>
           ) : (
             <div className="space-y-3">
               {myJobs.map(job => (
                 <div key={job.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative">
                    <div className="flex justify-between items-start mb-2 pr-6">
                        <h3 className="font-bold text-gray-800 line-clamp-1">{job.title}</h3>
                        {getStatusBadge(job.status)}
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                        <p>{job.grade} {job.subject} · {job.price}</p>
                        <p className="text-gray-400">{new Date(job.created_at || '').toLocaleString()}</p>
                    </div>
                    
                    {/* Delete Button */}
                    <button onClick={() => handleDelete(job.id)} className="absolute bottom-4 right-4 text-gray-300 hover:text-red-500">
                        <IconTrash className="w-4 h-4" />
                    </button>
                 </div>
               ))}
               <div className="text-center text-xs text-gray-400 mt-4">状态实时更新中</div>
             </div>
           )}
        </main>

        {/* Floating Action Button */}
        <div className="fixed bottom-8 right-6">
            <button 
                onClick={() => setView('form')}
                className="bg-black text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-transform"
            >
                <IconPlus className="w-8 h-8" />
            </button>
        </div>
      </div>
    );
  }

  // --- VIEW 3: FORM (Create) ---
  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 h-16 flex items-center gap-3">
        <button onClick={() => setView('dashboard')} className="p-2 -ml-2 text-gray-600 hover:text-black">
          <IconArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">发布新需求</h1>
      </header>

      <main className="p-5 max-w-lg mx-auto space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">标题 *</label>
            <input 
              name="title"
              value={formData.title}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如：急找初二数学家教，周末上课"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">年级</label>
              <input 
                name="grade"
                list="grade-list"
                value={formData.grade}
                onChange={handleFormChange}
                className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                placeholder="选择或输入"
              />
              <datalist id="grade-list">
                {SUGGESTED_GRADES.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">科目</label>
              <input 
                name="subject"
                list="subject-list"
                value={formData.subject}
                onChange={handleFormChange}
                className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                placeholder="选择或输入"
              />
              <datalist id="subject-list">
                {SUGGESTED_SUBJECTS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">每周次数 *</label>
                <select 
                    name="frequency"
                    value={formData.frequency}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded-lg p-3 outline-none bg-white"
                >
                    {[1,2,3,4,5,6,7].map(num => (
                        <option key={num} value={num}>每周 {num} 次</option>
                    ))}
                </select>
             </div>
             <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">价格预算 *</label>
                <input 
                    name="price"
                    value={formData.price}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                    placeholder="例如：100"
                />
             </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">上课地点</label>
            <input 
              name="address"
              value={formData.address}
              onChange={handleFormChange}
              className="w-full border border-gray-300 rounded-lg p-3 outline-none"
              placeholder="例如：海淀区知春路附近"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-gray-800 mb-3">联系方式</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">称呼</label>
                <input 
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                  placeholder="例如：张女士"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">手机号 *</label>
                <input 
                  name="contact_phone"
                  value={formData.contact_phone}
                  readOnly
                  className="w-full border border-gray-300 rounded-lg p-3 outline-none bg-gray-100 text-gray-500"
                />
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loadingSubmit}
          className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition-colors shadow-lg disabled:opacity-50 mt-4"
        >
          {loadingSubmit ? '提交中...' : '提交需求'}
        </button>
      </main>
    </div>
  );
};
