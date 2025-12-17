import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, Validators, FormGroup, FormControl } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Contractor } from '../../models/contractor.model';

@Component({
  selector: 'app-manage-contractors',
  templateUrl: './manage-contractors.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class ManageContractorsComponent {
  private dataService = inject(DataService);
  
  contractors = this.dataService.contractors;
  
  isAddModalOpen = signal(false);
  isEditModalOpen = signal(false);
  isDeleteModalOpen = signal(false);
  selectedContractorForAction = signal<Contractor | null>(null);
  statusMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  searchTerm = signal('');

  contractorForm: FormGroup;

  constructor() {
    this.contractorForm = new FormGroup({
      id: new FormControl<number | null>(null),
      name: new FormControl('', [Validators.required]),
      businessName: new FormControl('', [Validators.required]),
      contractorId: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    });
  }
  
  filteredContractors = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.contractors().filter(contractor => 
      contractor.name.toLowerCase().includes(term) ||
      contractor.businessName.toLowerCase().includes(term) ||
      contractor.contractorId.toLowerCase().includes(term)
    );
  });
  
  updateSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  // --- Modal and Action Logic ---
  openAddModal() {
    this.contractorForm.reset();
    this.contractorForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.isAddModalOpen.set(true);
  }

  openEditModal(contractor: Contractor) {
    this.selectedContractorForAction.set(contractor);
    this.contractorForm.patchValue(contractor);
    this.contractorForm.get('password')?.clearValidators();
    this.contractorForm.get('password')?.updateValueAndValidity();
    this.isEditModalOpen.set(true);
  }

  openDeleteModal(contractor: Contractor) {
    this.selectedContractorForAction.set(contractor);
    this.isDeleteModalOpen.set(true);
  }
  
  closeModals() {
    this.isAddModalOpen.set(false);
    this.isEditModalOpen.set(false);
    this.isDeleteModalOpen.set(false);
    this.selectedContractorForAction.set(null);
  }

  handleAddContractor() {
    if (this.contractorForm.valid) {
      const { name, businessName, contractorId, password } = this.contractorForm.value;
      this.dataService.addContractor({ name, businessName, contractorId, password });
      this.statusMessage.set({ type: 'success', text: 'Contractor added successfully.' });
      this.closeModals();
      setTimeout(() => this.statusMessage.set(null), 5000);
    }
  }

  handleUpdateContractor() {
    if (this.contractorForm.valid) {
      const formValue = this.contractorForm.value;
      const originalContractor = this.contractors().find(c => c.id === formValue.id);

      if (originalContractor) {
        const updatedContractor: Contractor = {
            ...originalContractor,
            name: formValue.name!,
            businessName: formValue.businessName!,
            contractorId: formValue.contractorId!,
        };
        // Only update password if a new one was entered
        if(formValue.password) {
            updatedContractor.password = formValue.password;
        }
        this.dataService.updateContractor(updatedContractor);
        this.statusMessage.set({ type: 'success', text: 'Contractor details updated successfully.' });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
      }
    }
  }
  
  confirmDelete() {
    const contractorToDelete = this.selectedContractorForAction();
    if (contractorToDelete) {
        this.dataService.deleteContractor(contractorToDelete.id);
        this.statusMessage.set({ type: 'success', text: `Contractor "${contractorToDelete.name}" has been deleted.` });
        this.closeModals();
        setTimeout(() => this.statusMessage.set(null), 5000);
    }
  }
}
