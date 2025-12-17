export interface Coupon {
  couponId: string;
  employeeId?: number;
  contractorId?: number;
  dateIssued: string;
  status: 'issued' | 'redeemed';
  redeemDate: string | null;
  redemptionCode: string;
  couponType: 'Breakfast' | 'Lunch/Dinner' | 'Snacks' | 'Beverage';
  slot?: number;
  
  // Guest pass support
  isGuestCoupon?: boolean;
  sharedByEmployeeId?: number;
  guestName?: string;
  guestCompany?: string;
}
