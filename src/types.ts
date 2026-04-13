export interface Haircut {
  id: string;
  name: string;
  price: number;
  duration: number;
  image: string;
  description: string;
}

export interface Appointment {
  id: string;
  customerName: string;
  customerEmail?: string;
  haircutId: string;
  startTime: string;
  status: 'waiting' | 'in-service' | 'completed' | 'cancelled';
  uid: string;
}
