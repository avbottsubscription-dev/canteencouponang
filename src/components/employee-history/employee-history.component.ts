import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { Employee } from '../../models/user.model';
import { Coupon } from '../../models/coupon.model';

@Component({
  selector: 'app-employee-history',
  templateUrl: './employee-history.component.html',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeHistoryComponent {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  private employeeId = toSignal(this.route.paramMap.pipe(map(params => Number(params.get('id')))));

  employee = computed(() => {
    const id = this.employeeId();
    if (!id) return null;
    return this.dataService.employees().find(e => e.id === id);
  });

  employeeTransactions = computed(() => {
    const id = this.employeeId();
    if (!id) return [];
    return this.dataService.coupons()
      .filter(c => c.employeeId === id)
      .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());
  });

  stats = computed(() => {
    const transactions = this.employeeTransactions();
    const issued = transactions.length;
    const redeemed = transactions.filter(t => t.status === 'redeemed').length;
    return { issued, redeemed };
  });

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

  printPage() {
    window.print();
  }
}
