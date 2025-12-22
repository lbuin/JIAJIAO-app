import React, { useState } from 'react';
import { Job, OrderStatus } from '../types';
import { IconLock, IconUnlock, IconCheck } from './Icons';

interface JobCardProps {
  job: Job;
  orderStatus?: OrderStatus;
  onUnlockClick: (job: Job) => void;
}

export const JobCard: React.FC<JobCardProps> = ({ job, orderStatus, onUnlockClick }) => {
  const isUnlocked = orderStatus === OrderStatus.APPROVED;
  const isPending = orderStatus === OrderStatus.PENDING;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-gray-800 line-clamp-2">{job.title}</h3>
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
            {job.subject}
          </span>
        </div>
        
        <div className="space-y-1 text-sm text-gray-600 mb-4">
          <p><span className="font-medium">年级:</span> {job.grade}</p>
          <p><span className="font-medium">价格:</span> {job.price}</p>
          <p><span className="font-medium">地址:</span> {job.address}</p>
        </div>

        {isUnlocked ? (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-lg p-3">
             <div className="flex items-center gap-2 text-green-700 font-bold mb-1">
                <IconUnlock className="w-4 h-4" />
                <span>联系方式已解锁</span>
             </div>
             <p className="text-gray-800 text-sm"><span className="font-semibold">联系人:</span> {job.contact_name}</p>
             <p className="text-gray-800 text-lg font-mono"><span className="font-semibold text-sm font-sans">电话:</span> {job.contact_phone}</p>
          </div>
        ) : (
          <button
            onClick={() => onUnlockClick(job)}
            disabled={isPending}
            className={`w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
              isPending 
                ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            }`}
          >
            {isPending ? (
              <>
                <span>正在审核...</span>
              </>
            ) : (
              <>
                <IconLock className="w-4 h-4" />
                <span>获取联系方式</span>
              </>
            )}
          </button>
        )}
      </div>
      {isPending && (
         <div className="bg-yellow-50 px-5 py-2 text-xs text-yellow-700 border-t border-yellow-100">
           订单审核中，请耐心等待管理员确认。
         </div>
      )}
    </div>
  );
};