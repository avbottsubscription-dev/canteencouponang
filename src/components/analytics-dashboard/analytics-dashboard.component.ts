import { Component, ChangeDetectionStrategy, inject, signal, computed, ElementRef, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data.service';
import { Coupon } from '../../models/coupon.model';
import { Employee } from '../../models/user.model';

// Declare Chart.js global to use the library from the script tag
declare var Chart: any;

@Component({
  selector: 'app-analytics-dashboard',
  templateUrl: './analytics-dashboard.component.html',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardComponent implements AfterViewInit, OnDestroy {
  private dataService = inject(DataService);
  private elementRef = inject(ElementRef);

  activeFilter = signal<'7' | '30' | '90'>('30');

  private redemptionChart: any;
  private departmentChart: any;
  private mealTypeChart: any;

  private employeesMap = computed(() => {
    const map = new Map<number, Employee>();
    this.dataService.employees().forEach(emp => map.set(emp.id, emp));
    return map;
  });

  private filteredRedeemedCoupons = computed(() => {
    const days = parseInt(this.activeFilter(), 10);
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - days);
    cutOffDate.setHours(0, 0, 0, 0);

    return this.dataService.coupons().filter(c => 
      c.status === 'redeemed' && c.redeemDate && new Date(c.redeemDate) >= cutOffDate
    );
  });

  private redemptionTrendsData = computed(() => {
    const coupons = this.filteredRedeemedCoupons();
    const days = parseInt(this.activeFilter(), 10);
    const dateMap = new Map<string, number>();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
      dateMap.set(dateString, 0);
    }
    
    coupons.forEach(coupon => {
      const dateString = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(coupon.redeemDate!));
      if (dateMap.has(dateString)) {
        dateMap.set(dateString, dateMap.get(dateString)! + 1);
      }
    });
    
    const sortedEntries = Array.from(dateMap.entries()).reverse();
    const labels = sortedEntries.map(entry => entry[0]);
    const data = sortedEntries.map(entry => entry[1]);
    
    return { labels, data };
  });

  private departmentalUsageData = computed(() => {
    const coupons = this.filteredRedeemedCoupons();
    const empMap = this.employeesMap();
    const deptMap = new Map<string, number>();

    coupons.forEach(coupon => {
      if(coupon.employeeId) {
        const employee = empMap.get(coupon.employeeId);
        const department = employee?.department || 'Unknown';
        deptMap.set(department, (deptMap.get(department) || 0) + 1);
      }
    });

    const sortedDepts = Array.from(deptMap.entries()).sort((a, b) => b[1] - a[1]);
    const labels = sortedDepts.map(entry => entry[0]);
    const data = sortedDepts.map(entry => entry[1]);

    return { labels, data };
  });

  private mealTypePopularityData = computed(() => {
    const coupons = this.filteredRedeemedCoupons();
    const mealMap = new Map<Coupon['couponType'], number>();

    coupons.forEach(coupon => {
      mealMap.set(coupon.couponType, (mealMap.get(coupon.couponType) || 0) + 1);
    });

    const sortedMeals = Array.from(mealMap.entries()).sort((a, b) => b[1] - a[1]);
    const labels = sortedMeals.map(entry => entry[0]);
    const data = sortedMeals.map(entry => entry[1]);

    return { labels, data };
  });

  constructor() {
    effect(() => {
      if (this.redemptionChart) {
        const { labels, data } = this.redemptionTrendsData();
        this.redemptionChart.data.labels = labels;
        this.redemptionChart.data.datasets[0].data = data;
        this.redemptionChart.update();
      }
      if (this.departmentChart) {
        const { labels, data } = this.departmentalUsageData();
        this.departmentChart.data.labels = labels;
        this.departmentChart.data.datasets[0].data = data;
        this.departmentChart.update();
      }
      if (this.mealTypeChart) {
        const { labels, data } = this.mealTypePopularityData();
        this.mealTypeChart.data.labels = labels;
        this.mealTypeChart.data.datasets[0].data = data;
        this.mealTypeChart.update();
      }
    });
  }

  ngAfterViewInit(): void {
    this.createRedemptionChart();
    this.createDepartmentChart();
    this.createMealTypeChart();
  }
  
  ngOnDestroy(): void {
    this.redemptionChart?.destroy();
    this.departmentChart?.destroy();
    this.mealTypeChart?.destroy();
  }

  setFilter(days: '7' | '30' | '90') {
    this.activeFilter.set(days);
  }

  private createRedemptionChart() {
    const canvas = this.elementRef.nativeElement.querySelector('#redemptionTrendChart');
    if (canvas) {
      const { labels, data } = this.redemptionTrendsData();
      this.redemptionChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Coupons Redeemed',
            data: data,
            borderColor: 'rgb(79, 70, 229)',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
            }
          }
        }
      });
    }
  }
  
  private createDepartmentChart() {
    const canvas = this.elementRef.nativeElement.querySelector('#departmentUsageChart');
    if (canvas) {
      const { labels, data } = this.departmentalUsageData();
      this.departmentChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            label: 'Redemptions',
            data: data,
            backgroundColor: [
              '#4f46e5', '#7c3aed', '#db2777', '#f59e0b', '#10b981', '#3b82f6',
              '#6366f1', '#a78bfa', '#f9a8d4', '#fcd34d', '#6ee7b7', '#93c5fd'
            ],
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
            }
          }
        }
      });
    }
  }

  private createMealTypeChart() {
    const canvas = this.elementRef.nativeElement.querySelector('#mealTypeChart');
    if (canvas) {
      const { labels, data } = this.mealTypePopularityData();
      this.mealTypeChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Coupons Redeemed',
            data: data,
            backgroundColor: ['#f59e0b', '#3b82f6', '#7c3aed', '#10b981'],
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            }
          },
          scales: {
            y: {
              beginAtZero: true,
            }
          }
        }
      });
    }
  }
}
