
export enum DocumentType {
  Invoice = 'INVOICE',
  Receipt = 'RECEIPT',
}

export type DocumentStatus = 'draft' | 'unpaid' | 'paid';
export type Template = 'modern' | 'classic' | 'minimalist';


export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Customer {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface InvoiceDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  template: Template;
  number: string;
  date: string; // ISO string format
  dueDate?: string;
  customer: Customer;
  items: LineItem[];
  taxRate: number;
  notes: string;
  paymentMethod?: string;
  signatureUrl?: string;
  lastReminderSent?: string; // ISO string format
}
