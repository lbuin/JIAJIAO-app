import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabaseClient';
import { IconArrowLeft, IconCheck } from '../components/Icons';
import { CreateJobParams } from '../types';

export const ParentPost: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<CreateJobParams>({
    title: '',
    grade: '',
    subject: '',
    price: '',
    address: '',
    contact_name: '',
    contact_phone: ''
  });

  useEffect(() => {
    if (!isConfigured()) {
      alert("请先联系管理员配置数据库连接");
      navigate('/');
    }
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.title || !formData.contact_phone || !formData.price) {
      return alert("请填写完整信息");
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('jobs').insert([{
        ...formData,
        is_active: false, // Default to inactive until approved by admin
        status: 'pending' // Explicit pending status for admin review
      }]);

      if (error) {
        throw error;
      }

      setSuccess(true);
    } catch (err: any) {
      alert("发布失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-green-100 p-4 rounded-full mb-4">
          <IconCheck className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">提交成功！</h2>
        <p className="text-gray-600 mb-8 max-w-xs mx-auto">
          您的需求已收到。平台老师会尽快审核，并为您匹配合适的教员。
          <br/><br/>
          如果有合适的大学生申请，我们会通过电话联系您。
        </p>
        <div className="space-y-3 w-full max-w-xs">
            <Link to="/" className="block w-full bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors">
            返回首页
            </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 h-16 flex items-center gap-3">
        <Link to="/" className="p-2 -ml-2 text-gray-600 hover:text-black">
          <IconArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-lg font-bold text-gray-800">发布家教需求</h1>
      </header>

      <main className="p-5 max-w-lg mx-auto space-y-6">
        <div className="bg-blue-50 p-4 rounded-xl text-blue-800 text-sm">
          📝 家长您好，请填写您的要求。平台将为您人工筛选优质大学生教员。
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">标题 *</label>
            <input 
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如：急找初二数学家教，周末上课"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">年级</label>
              <input 
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                placeholder="例如：初二"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">科目</label>
              <input 
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                placeholder="例如：数学"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">价格预算 *</label>
            <input 
              name="price"
              value={formData.price}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-3 outline-none"
              placeholder="例如：100-150元/小时"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">上课地点</label>
            <input 
              name="address"
              value={formData.address}
              onChange={handleChange}
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
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                  placeholder="例如：张女士"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">手机号 *</label>
                <input 
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-3 outline-none"
                  placeholder="仅平台可见，用于联系您"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
                * 您的电话号码将被严格保密，仅用于管理员核实需求。
            </p>
          </div>
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition-colors shadow-lg disabled:opacity-50 mt-4"
        >
          {loading ? '提交中...' : '提交需求'}
        </button>
      </main>
    </div>
  );
};