import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, Validators, FormGroup, FormControl } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { Employee } from '../../models/user.model';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-employee-management',
  templateUrl: './employee-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink]
})
export class EmployeeManagementComponent {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  
  // FIX: Added a type guard to ensure the user is an Employee before accessing employeeId.
  isSuperAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user && 'employeeId' in user && user.employeeId === 'admin01';
  });
  employees = computed(() => this.dataService.employees().filter(e => e.employeeId !== 'admin01'));
  
  isEditModalOpen = signal(false);
  isDeleteModalOpen = signal(false);
  isDeactivateModalOpen = signal(false);
  isAddDepartmentModalOpen = signal(false);
  selectedEmployeeForAction = signal<Employee | null>(null);
  statusMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  searchTerm = signal('');
  sortConfig = signal<{ key: keyof Employee, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  departments = signal<string[]>([
    'HR & Admin', 'Operations', 'SCM', 'PPC', 'Production', 'Stores', 
    'IT', 'Security', 'Housekeeping', 'Sales', 'Finance', 'Quality'
  ]);
  contractors = this.dataService.contractorBusinessNames;
  editEmployeeForm: FormGroup;
  newDepartmentForm: FormGroup;

  constructor() {
    this.editEmployeeForm = new FormGroup({
      id: new FormControl(0, [Validators.required]),
      name: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.email]),
      employeeId: new FormControl('', [Validators.required]),
      department: new FormControl(''),
      role: new FormControl<Employee['role']>('employee', [Validators.required]),
      contractor: new FormControl(''),
    });

    this.newDepartmentForm = new FormGroup({
      name: new FormControl('', [Validators.required])
    });

    this.editEmployeeForm.get('role')?.valueChanges.subscribe(role => {
      const departmentControl = this.editEmployeeForm.get('department');
      const contractorControl = this.editEmployeeForm.get('contractor');
      if (role === 'employee') {
          departmentControl?.setValidators([Validators.required]);
      } else {
          departmentControl?.clearValidators();
          departmentControl?.setValue('');
      }
      departmentControl?.updateValueAndValidity();

      if (role === 'contractual employee') {
        contractorControl?.setValidators([Validators.required]);
      } else {
        contractorControl?.clearValidators();
        contractorControl?.setValue('');
      }
      contractorControl?.updateValueAndValidity();
    });
  }
  
  filteredAndSortedEmployees = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const { key, direction } = this.sortConfig();

    let filtered = this.employees().filter(employee => 
      employee.name.toLowerCase().includes(term) ||
      (employee.email && employee.email.toLowerCase().includes(term)) ||
      (employee.employeeId && employee.employeeId.toLowerCase().includes(term)) ||
      (employee.department && employee.department.toLowerCase().includes(term)) ||
      (employee.contractor && employee.contractor.toLowerCase().includes(term))
    );

    return filtered.sort((a, b) => {
      const valA = a[key] || '';
      const valB = b[key] || '';
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  });
  
  updateSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setSort(key: keyof Employee) {
    if (this.sortConfig().key === key) {
      this.sortConfig.update(config => ({...config, direction: config.direction === 'asc' ? 'desc' : 'asc' }));
    } else {
      this.sortConfig.set({ key, direction: 'asc' });
    }
  }

  // --- Modal and Action Logic ---

  openEditModal(employee: Employee) {
    this.selectedEmployeeForAction.set(employee);
    this.editEmployeeForm.patchValue({
      id: employee.id,
      name: employee.name,
      email: employee.email || '',
      employeeId: employee.employeeId,
      department: employee.department || '',
      role: employee.role,
      contractor: employee.contractor || ''
    });
    this.isEditModalOpen.set(true);
  }

  openDeleteModal(employee: Employee) {
    this.selectedEmployeeForAction.set(employee);
    this.isDeleteModalOpen.set(true);
  }
  
  openDeactivateModal(employee: Employee) {
    this.selectedEmployeeForAction.set(employee);
    this.isDeactivateModalOpen.set(true);
  }

  closeModals() {
    this.isEditModalOpen.set(false);
    this.isDeleteModalOpen.set(false);
    this.isDeactivateModalOpen.set(false);
    this.isAddDepartmentModalOpen.set(false);
    this.selectedEmployeeForAction.set(null);
  }

  handleUpdateEmployee() {
    if (this.editEmployeeForm.valid) {
      const formValue = this.editEmployeeForm.value;
      const originalEmployee = this.employees().find(e => e.id === formValue.id);

      if (originalEmployee) {
        const updatedEmployee: Employee = {
            ...originalEmployee,
            name: formValue.name!,
            employeeId: formValue.employeeId!,
            role: formValue.role!,
            email: formValue.email || undefined,
            department: formValue.role === 'employee' ? formValue.department! : undefined,
            contractor: formValue.role === 'contractual employee' ? formValue.contractor! : undefined,
        };
        this.dataService.updateEmployee(updatedEmployee);
        this.statusMessage.set({ type: 'success', text: 'Employee details updated successfully.' });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
      }
    }
  }
  
  confirmDelete() {
    const employeeToDelete = this.selectedEmployeeForAction();
    if (employeeToDelete) {
        this.dataService.deleteEmployee(employeeToDelete.id);
        this.statusMessage.set({ type: 'success', text: `Employee "${employeeToDelete.name}" has been deleted.` });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
    }
  }

  confirmToggleStatus() {
    const employee = this.selectedEmployeeForAction();
    if (employee) {
      this.dataService.toggleEmployeeStatus(employee.id);
      const action = employee.status === 'active' ? 'deactivated' : 'reactivated';
      this.statusMessage.set({ type: 'success', text: `Employee "${employee.name}" has been ${action}.` });
      this.closeModals();
      setTimeout(() => this.statusMessage.set(null), 5000);
    }
  }

  openAddDepartmentModal() {
    this.newDepartmentForm.reset();
    this.isAddDepartmentModalOpen.set(true);
  }

  handleAddNewDepartment() {
    if (this.newDepartmentForm.valid) {
      const newDepartmentName = this.newDepartmentForm.value.name!;
      this.departments.update(deps => [...deps, newDepartmentName].sort());
      this.editEmployeeForm.patchValue({ department: newDepartmentName });
      this.isAddDepartmentModalOpen.set(false);
    }
  }
}
