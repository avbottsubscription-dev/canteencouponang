import { Coupon } from './coupon.model';

export interface GuestCouponRequest {
  id: string;
  employeeId: number;
  employeeName: string;
  guestName: string;
  guestCompany: string;
  couponType: Coupon['couponType'];
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;      // ISO string
  decisionDate?: string;    // ISO string
  adminId?: number;         // employeeId of admin who decided
  rejectionReason?: string;
  generatedCouponId?: string;
}
