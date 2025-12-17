import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink]
})
export class HistoryComponent {
  private dataService = inject(DataService);

  activeTab = signal<'employees' | 'guest'>('employees');
  searchTerm = signal('');

  employees = computed(() => 
    this.dataService.employees().filter(e => e.role === 'employee' || e.role === 'contractual employee')
    .sort((a,b) => a.name.localeCompare(b.name))
  );

  filteredEmployees = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) {
        return this.employees();
    }
    return this.employees().filter(employee =>
        employee.name.toLowerCase().includes(term) ||
        employee.employeeId.toLowerCase().includes(term) ||
        (employee.department && employee.department.toLowerCase().includes(term)) ||
        (employee.contractor && employee.contractor.toLowerCase().includes(term))
    );
  });
  
  employeesMap = computed(() => {
    const map = new Map<number, string>();
    this.dataService.employees().forEach(emp => map.set(emp.id, emp.name));
    return map;
  });

  guestCoupons = computed(() => {
    return this.dataService.coupons()
        .filter(c => c.isGuestCoupon)
        .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  });

  filteredGuestCoupons = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const empMap = this.employeesMap();
    if (!term) return this.guestCoupons();

    return this.guestCoupons().filter(coupon => {
        const employeeName = coupon.sharedByEmployeeId ? empMap.get(coupon.sharedByEmployeeId)?.toLowerCase() : '';
        return coupon.couponId.toLowerCase().includes(term) ||
               coupon.couponType.toLowerCase().includes(term) ||
               coupon.redemptionCode.toLowerCase().includes(term) ||
               coupon.status.toLowerCase().includes(term) ||
               (employeeName && employeeName.includes(term));
    });
  });

  updateSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  formatDateTime(isoString: string | null): string {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  getStatusClass(status: 'issued' | 'redeemed'): string {
    if (status === 'redeemed') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    }
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
  }
}
