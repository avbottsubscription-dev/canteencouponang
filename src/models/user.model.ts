// NOTE: Filename is user.model.ts but this now defines the Employee model.
export interface Employee {
  id: number;
  name: string;
  email?: string;
  employeeId: string;
  password: string;
  role: 'admin' | 'contractual employee' | 'employee' | 'canteen manager';
  department?: string;
  status: 'active' | 'deactivated';
  contractor?: string;
}