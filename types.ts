export interface Job {
  id: number;
  title: string;
  grade: string;
  subject: string;
  price: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  manage_password?: string; // New field for parent login
  is_active: boolean;
  status?: 'pending' | 'published' | 'rejected';
  created_at?: string;
}

// Updated statuses for the new workflow
export enum OrderStatus {
  APPLYING = 'applying',               // Student applied, waiting for parent
  PARENT_APPROVED = 'parent_approved', // Parent said OK, waiting for payment
  REJECTED = 'rejected',               // Parent or Admin said No
  PAYMENT_PENDING = 'payment_pending', // Student paid, waiting for Admin
  FINAL_APPROVED = 'final_approved',   // Admin released contact info
  
  // Keep old ones for backward compatibility if needed, though logic will shift
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
  manage_password?: string; // New
}