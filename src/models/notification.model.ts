export type NotificationType = 'new_coupon' | 'system' | 'guest_pass_request';

export interface AppNotification {
  id: string;
  employeeId: number;          // receiver (admin किंवा normal employee)
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;           // ISO string for date

  // Extra metadata for linking
  relatedRequestId?: string;   // GuestCouponRequest.id
  requesterEmployeeId?: number;
  relatedCouponId?: string;    // Coupon.couponId
}
