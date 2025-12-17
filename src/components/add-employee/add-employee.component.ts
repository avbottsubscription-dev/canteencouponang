import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, Validators, FormGroup, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { Employee } from '../../models/user.model';

@Component({
  selector: 'app-add-employee',
  templateUrl: './add-employee.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class AddEmployeeComponent {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private router: Router = inject(Router);
  private route = inject(ActivatedRoute);

  isSuperAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user && 'employeeId' in user && user.employeeId === 'admin01';
  });
  pageTitle = signal('Add New Employee');
  isAddDepartmentModalOpen = signal(false);

  departments = signal<string[]>([
    'HR & Admin', 'Operations', 'SCM', 'PPC', 'Production', 'Stores', 
    'IT', 'Security', 'Housekeeping', 'Sales', 'Finance', 'Quality'
  ]);
  contractors = this.dataService.contractorBusinessNames;

  private allRoles: Employee['role'][] = ['employee', 'contractual employee', 'admin', 'canteen manager'];
  filteredRoles = signal<Employee['role'][]>([]);

  addEmployeeForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.email]),
    employeeId: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    department: new FormControl('', [Validators.required]),
    role: new FormControl<Employee['role']>('employee', [Validators.required]),
    contractor: new FormControl('')
  });

  newDepartmentForm = new FormGroup({
    name: new FormControl('', [Validators.required])
  });

  constructor() {
    this.route.data.subscribe(data => {
      const type = data['type'];
      let initialRole: Employee['role'] = 'employee';

      if (type === 'admin-canteen') {
        this.pageTitle.set('Add Admin / Canteen Manager');
        this.filteredRoles.set(this.allRoles.filter(r => r === 'admin' || (this.isSuperAdmin() && r === 'canteen manager')));
        initialRole = 'admin';
        this.addEmployeeForm.patchValue({ role: initialRole });
        this.addEmployeeForm.controls.role.enable();
      } else if (type === 'employee' || type === 'contractual') {
        this.pageTitle.set(type === 'employee' ? 'Add New Employee' : 'Add New Contractual Employee');
        this.filteredRoles.set([type === 'contractual' ? 'contractual employee' : 'employee']);
        initialRole = type === 'contractual' ? 'contractual employee' : 'employee';
        this.addEmployeeForm.patchValue({ role: initialRole });
        this.addEmployeeForm.controls.role.disable();
      } else {
        this.pageTitle.set('Add New Employee');
        this.filteredRoles.set(this.allRoles.filter(r => r === 'employee' || r === 'contractual employee'));
        initialRole = 'employee';
        this.addEmployeeForm.patchValue({ role: initialRole });
        this.addEmployeeForm.controls.role.enable();
      }
      this.updateValidatorsForRole(initialRole);
    });

    this.addEmployeeForm.get('role')?.valueChanges.subscribe(role => {
      if (role) this.updateValidatorsForRole(role);
    });
  }

  private updateValidatorsForRole(role: Employee['role']) {
    const departmentControl = this.addEmployeeForm.get('department');
    const emailControl = this.addEmployeeForm.get('email');
    const contractorControl = this.addEmployeeForm.get('contractor');

    if (role === 'employee') {
      departmentControl?.setValidators([Validators.required]);
    } else {
      departmentControl?.clearValidators();
      departmentControl?.setValue('');
    }
    departmentControl?.updateValueAndValidity();

    if (role === 'contractual employee') {
      emailControl?.clearValidators();
      emailControl?.setValue('');
      contractorControl?.setValidators([Validators.required]);
    } else {
      emailControl?.setValidators([Validators.email]);
      contractorControl?.clearValidators();
      contractorControl?.setValue('');
    }
    emailControl?.updateValueAndValidity();
    contractorControl?.updateValueAndValidity();
  }

  handleAddEmployee() {
    if (this.addEmployeeForm.valid) {
      const formValue = this.addEmployeeForm.getRawValue();
      const employeeData: Omit<Employee, 'id' | 'status'> = {
        name: formValue.name!,
        employeeId: formValue.employeeId!,
        password: formValue.password!,
        role: formValue.role!,
      };

      if (formValue.role !== 'contractual employee') {
        employeeData.email = formValue.email || undefined;
      }
      if (formValue.role === 'employee') {
        employeeData.department = formValue.department!;
      }
      if (formValue.role === 'contractual employee') {
        employeeData.contractor = formValue.contractor!;
      }
      
      this.dataService.addEmployee(employeeData);
      this.router.navigate(['/admin/employees']);
    }
  }
  
  openAddDepartmentModal() {
    this.newDepartmentForm.reset();
    this.isAddDepartmentModalOpen.set(true);
  }
  
  closeAddDepartmentModal() {
    this.isAddDepartmentModalOpen.set(false);
  }

  handleAddNewDepartment() {
    if (this.newDepartmentForm.valid) {
      const newDepartmentName = this.newDepartmentForm.value.name!;
      this.departments.update(deps => [...deps, newDepartmentName].sort());
      this.addEmployeeForm.patchValue({ department: newDepartmentName });
      this.closeAddDepartmentModal();
    }
  }

  cancel() {
    this.router.navigate(['/admin/employees']);
  }
}
