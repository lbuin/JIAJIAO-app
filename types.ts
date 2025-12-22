export interface Job {
  id: number;
  title: string;
  grade: string;
  subject: string;
  price: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  is_active: boolean;
  created_at?: string;
}

export enum OrderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
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

// Helper type for Admin View
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
}