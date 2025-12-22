export interface Job {
  id: number;
  title: string;
  grade: string;
  subject: string;
  price: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  manage_password?: string; // Optional/Deprecated
  is_active: boolean;
  status?: 'pending' | 'published' | 'rejected';
  created_at?: string;
}

export enum OrderStatus {
  APPLYING = 'applying',               // Student applied, waiting for Admin to check with Parent
  PARENT_APPROVED = 'parent_approved', // Admin confirmed with Parent, allowed Student to pay
  REJECTED = 'rejected',               // Admin rejected
  PAYMENT_PENDING = 'payment_pending', // Student paid, waiting for Admin to release info
  FINAL_APPROVED = 'final_approved',   // Admin released contact info
  
  PENDING = 'pending', 
  APPROVED = 'approved',
}

export interface Order {
  id: number;
  job_id: number;
  student_contact: string;
  status: OrderStatus;
  created_at: string;
}

export interface StudentProfile {
  id?: number;
  phone: string;
  name: string;
  school: string;
  major: string;
  grade: string;
  experience: string;
  created_at?: string;
}

export interface OrderWithDetails extends Order {
  jobs: Job;
  profile?: StudentProfile;
}

export interface CreateJobParams {
  title: string;
  grade: string;
  subject: string;
  price: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  // manage_password removed
}