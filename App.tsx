
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import type { InvoiceDocument, LineItem, Customer, DocumentType, DocumentStatus, Template } from './types';
import { DocumentType as DocTypeEnum } from './types';
import { Logo } from './components/icons/Logo';

// Declare the QRCode global from the CDN script to inform TypeScript about its existence.
declare const QRCode: {
  toCanvas: (
    canvas: HTMLCanvasElement,
    text: string,
    options: Record<string, unknown>,
    callback: (error: Error | null) => void
  ) => void;
};
// Declare the jsQR global from the CDN script.
declare const jsQR: any;


// --- HELPER FUNCTIONS ---
const generateId = () => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) {
        // Ignore error and use fallback
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const getNextDocumentNumber = (docs: InvoiceDocument[], type: DocumentType): string => {
  const prefix = type === DocTypeEnum.Invoice ? 'INV' : 'REC';
  const year = new Date().getFullYear();
  const relevantDocs = docs.filter(d => d.number.startsWith(`${prefix}-${year}`));
  const maxNum = relevantDocs.reduce((max, doc) => {
    const parts = doc.number.split('-');
    const num = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`;
};
const createEmptyLineItem = (): LineItem => ({ id: generateId(), description: '', quantity: 1, unitPrice: 0 });
const createEmptyDocument = (docs: InvoiceDocument[], signatureUrl?: string): InvoiceDocument => ({
    id: generateId(),
    type: DocTypeEnum.Invoice,
    status: 'draft',
    template: 'modern',
    number: getNextDocumentNumber(docs, DocTypeEnum.Invoice),
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
    customer: { name: '', email: '', phone: '', address: '' },
    items: [createEmptyLineItem()],
    taxRate: 5,
    notes: 'Thank you for your business!',
    paymentMethod: 'Credit Card',
    signatureUrl,
});
const calculateTotals = (doc: InvoiceDocument) => {
    const subtotal = doc.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
    const taxAmount = subtotal * (doc.taxRate / 100);
    const grandTotal = subtotal + taxAmount;
    return { subtotal, taxAmount, grandTotal };
}
const toWords = (num: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const thousands = ['', 'Thousand', 'Million', 'Billion'];

  function numberToWords(n: number): string {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + numberToWords(n % 100) : '');
    return '';
  }

  if (num === 0) return 'Zero';
  let word = '';
  let i = 0;
  do {
    const part = num % 1000;
    if (part !== 0) {
      word = numberToWords(part) + ' ' + thousands[i] + ' ' + word;
    }
    i++;
    num = Math.floor(num / 1000);
  } while (num > 0);
  
  return word.trim();
};

const getAmountInWords = (amount: number) => {
    const wholePart = Math.floor(amount);
    const fractionalPart = Math.round((amount - wholePart) * 100);
    const words = `${toWords(wholePart)} Dollars and ${String(fractionalPart).padStart(2, '0')}/100`;
    return words;
}

// --- ICONS ---
const PlusCircle: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
);
const Trash2: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);
const Download: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
);
const Edit: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
);
const ArrowLeft: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
);
const UploadCloud: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 17.2a4.6 4.6 0 0 0-4.5-5.2A6.4 6.4 0 0 0 4 12.3a5 5 0 0 0 5 9.7h7a4.6 4.6 0 0 0 4-5.8Z"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
);
const Mail: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
);
const Loader: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
);
const Camera: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
);

// --- UI SUB-COMPONENTS ---
const TemplateSelector: React.FC<{
    selected: Template,
    onSelect: (template: Template) => void
}> = ({ selected, onSelect }) => {
    const templates: { id: Template; name: string; preview: React.ReactNode }[] = [
        {
            id: 'modern', name: 'Modern',
            preview: <div className="p-2 space-y-2"><div className="h-3 w-1/2 bg-cyan-400/80 rounded-sm"></div><div className="h-1.5 w-full bg-slate-500 rounded-sm"></div><div className="h-1.5 w-3/4 bg-slate-500 rounded-sm"></div><div className="pt-2"><div className="h-1.5 w-full bg-slate-500 rounded-sm"></div><div className="h-1.5 w-full mt-1 bg-slate-500 rounded-sm"></div></div></div>
        },
        {
            id: 'classic', name: 'Classic',
            preview: <div className="p-2 space-y-2 font-serif"><div className="h-3 w-1/2 bg-gray-500 rounded-sm"></div><div className="h-1.5 w-full bg-gray-400 rounded-sm"></div><div className="h-1.5 w-3/4 bg-gray-400 rounded-sm"></div><div className="pt-2"><div className="h-1.5 w-full bg-gray-400 rounded-sm"></div><div className="h-1.5 w-full mt-1 bg-gray-400 rounded-sm"></div></div></div>
        },
        {
            id: 'minimalist', name: 'Minimalist',
            preview: <div className="p-2 space-y-3"><div className="h-2 w-1/3 bg-gray-500/80 rounded-sm"></div><div className="h-1 w-full bg-slate-400 rounded-sm"></div><div className="h-1 w-3/4 bg-slate-400 rounded-sm"></div><div className="pt-2"><div className="h-1 w-full bg-slate-400 rounded-sm"></div><div className="h-1 w-full mt-1 bg-slate-400 rounded-sm"></div></div></div>
        }
    ];

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-200">Template</h2>
            <div className="flex justify-around gap-2">
                {templates.map(t => (
                    <div key={t.id} onClick={() => onSelect(t.id)} className="flex-1 cursor-pointer group">
                        <div className={`w-full h-28 bg-slate-800 rounded-lg overflow-hidden border-2 transition-colors ${selected === t.id ? 'border-cyan-400' : 'border-slate-700 group-hover:border-slate-600'}`}>
                            {t.preview}
                        </div>
                        <p className={`text-center text-sm mt-2 font-semibold transition-colors ${selected === t.id ? 'text-cyan-300' : 'text-slate-400 group-hover:text-white'}`}>{t.name}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface InvoiceFormProps {
    doc: InvoiceDocument;
    setDoc: React.Dispatch<React.SetStateAction<InvoiceDocument>>;
    onSaveDraft: () => void;
    onFinalize: (type: DocumentType) => void;
    signatureUrl?: string;
    onSignatureChange: (url: string) => void;
    logoUrl?: string;
    onLogoChange: (url: string) => void;
}
const InvoiceForm: React.FC<InvoiceFormProps> = ({ doc, setDoc, onSaveDraft, onFinalize, signatureUrl, onSignatureChange, logoUrl, onLogoChange }) => {
    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDoc(prev => ({...prev, customer: {...prev.customer, [e.target.name]: e.target.value}}));
    };
    const handleDocChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDoc(prev => ({...prev, [e.target.name]: e.target.value}));
    };
    const handleItemChange = (id: string, field: keyof LineItem, value: string | number) => {
        setDoc(prev => ({
            ...prev,
            items: prev.items.map(item => item.id === id ? {...item, [field]: value} : item)
        }));
    };
    const addItem = () => setDoc(prev => ({...prev, items: [...prev.items, createEmptyLineItem()]}));
    const removeItem = (id: string) => setDoc(prev => ({...prev, items: prev.items.filter(item => item.id !== id)}));
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                callback(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
             <TemplateSelector selected={doc.template} onSelect={template => setDoc(prev => ({...prev, template}))} />

             <div className="space-y-4">
                <h2 className="text-2xl font-bold text-slate-200">Company Logo</h2>
                <div className="flex items-center gap-4">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Company Logo" className="h-16 max-w-[128px] bg-white p-1 rounded object-contain" />
                    ) : (
                        <div className="w-32 h-16 bg-slate-800 border border-dashed border-slate-600 rounded flex items-center justify-center">
                           <Logo className="h-8 text-slate-400" />
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-3 rounded-md transition-colors text-center">
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, onLogoChange)} />
                            {logoUrl ? 'Change Logo' : 'Upload Logo'}
                        </label>
                         {logoUrl && <button onClick={() => onLogoChange('')} className="text-red-500 hover:text-red-400 text-sm font-semibold">Remove</button>}
                    </div>
                </div>
            </div>

             <div className="space-y-4">
                <h2 className="text-2xl font-bold text-slate-200">Signature</h2>
                <div className="flex items-center gap-4">
                    {signatureUrl ? (
                         <img src={signatureUrl} alt="Signature" className="h-16 bg-white p-1 rounded" />
                    ): (
                        <div className="w-32 h-16 bg-slate-800 border border-dashed border-slate-600 rounded flex items-center justify-center text-slate-500 text-sm">
                            No Signature
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-3 rounded-md transition-colors text-center">
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, onSignatureChange)} />
                            {signatureUrl ? 'Change Signature' : 'Upload Signature'}
                        </label>
                         {signatureUrl && <button onClick={() => onSignatureChange('')} className="text-red-500 hover:text-red-400 text-sm font-semibold">Remove</button>}
                    </div>
                </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-200">Customer Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" name="name" placeholder="Customer Name" value={doc.customer.name} onChange={handleCustomerChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                <input type="email" name="email" placeholder="Customer Email" value={doc.customer.email} onChange={handleCustomerChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                <input type="tel" name="phone" placeholder="Customer Phone" value={doc.customer.phone} onChange={handleCustomerChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                <input type="text" name="address" placeholder="Customer Address" value={doc.customer.address} onChange={handleCustomerChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full md:col-span-2" />
            </div>

            <h2 className="text-2xl font-bold text-slate-200">Document Details</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="date" name="date" value={doc.date} onChange={handleDocChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                <input type="date" name="dueDate" value={doc.dueDate} onChange={handleDocChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                <div className="flex items-center gap-2">
                    <input type="number" name="taxRate" value={doc.taxRate} onChange={e => setDoc({...doc, taxRate: parseFloat(e.target.value) || 0})} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full" />
                    <span className="text-slate-400">% Tax</span>
                </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-200">Line Items</h2>
            <div className="space-y-2">
                {doc.items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-[1fr_80px_120px_auto] gap-2 items-center">
                        <input type="text" placeholder="Description" value={item.description} onChange={e => handleItemChange(item.id, 'description', e.target.value)} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white" />
                        <input type="number" placeholder="Qty" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value, 10) || 0)} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white text-center" />
                        <input type="number" placeholder="Price" value={item.unitPrice} onChange={e => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white text-right" />
                        <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-400 p-2"><Trash2 className="w-5 h-5"/></button>
                    </div>
                ))}
                <button onClick={addItem} className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-semibold py-2">
                    <PlusCircle className="w-5 h-5"/> Add Item
                </button>
            </div>
            
             <h2 className="text-2xl font-bold text-slate-200">Notes & Payment</h2>
            <textarea name="notes" placeholder="Notes/Terms" value={doc.notes} onChange={handleDocChange} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full h-24" />
            <select name="paymentMethod" value={doc.paymentMethod} onChange={(e) => setDoc(prev => ({...prev, paymentMethod: e.target.value}))} className="bg-slate-800 border border-slate-700 rounded-md p-2 text-white w-full">
                <option>Credit Card</option>
                <option>Bank Transfer</option>
                <option>Cash</option>
                <option>PayPal</option>
            </select>
            
            <div className="flex flex-col gap-3 pt-4">
                <button onClick={onSaveDraft} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-md w-full transition-colors">Save as Draft</button>
                <div className="flex gap-3">
                   <button onClick={() => onFinalize(DocTypeEnum.Invoice)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md w-full transition-colors">Finalize as Invoice</button>
                   <button onClick={() => onFinalize(DocTypeEnum.Receipt)} className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md w-full transition-colors">Finalize as Receipt</button>
                </div>
            </div>
        </div>
    );
};


interface InvoicePreviewProps {
    doc: InvoiceDocument;
    logoUrl?: string;
}
const InvoicePreview: React.FC<InvoicePreviewProps> = ({ doc, logoUrl }) => {
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);
    const { subtotal, taxAmount, grandTotal } = useMemo(() => calculateTotals(doc), [doc]);
    const isOverdue = doc.status === 'unpaid' && doc.dueDate && new Date(doc.dueDate) < new Date();


    useEffect(() => {
        if (doc && qrCanvasRef.current && typeof QRCode !== 'undefined') {
            const qrData = JSON.stringify({
                type: doc.type,
                number: doc.number,
                date: doc.date,
                total: grandTotal,
                verificationUrl: `https://deepshiftai.com/verify/${doc.id}`
            });
            QRCode.toCanvas(qrCanvasRef.current, qrData, { width: 100, margin: 1 }, (error) => {
                if (error) console.error('QR Code generation failed:', error);
            });
        }
    }, [doc, grandTotal]);
    
    const templateClasses = {
        modern: {
            font: 'font-sans',
            headerBorder: 'border-b-2 border-gray-200',
            title: `text-5xl font-bold text-right ${doc.type === DocTypeEnum.Invoice ? 'text-cyan-600' : 'text-green-600'}`,
            tableHead: 'bg-gray-100 text-gray-500 uppercase text-sm',
            tableRowBorder: 'border-b border-gray-200',
            totalBorder: 'border-t-2 border-gray-300',
            footerBorder: 'border-t-2 border-gray-200',
        },
        classic: {
            font: 'font-serif',
            headerBorder: 'border-b-4 border-double border-gray-800',
            title: 'text-4xl font-semibold text-right uppercase tracking-widest text-gray-800',
            tableHead: 'bg-gray-200 text-gray-700 uppercase text-sm font-semibold border-b-2 border-gray-800',
            tableRowBorder: 'border border-gray-300',
            totalBorder: 'border-t-2 border-gray-800',
            footerBorder: 'border-t-4 border-double border-gray-800',
        },
        minimalist: {
            font: 'font-sans',
            headerBorder: 'border-b border-gray-300',
            title: 'text-3xl font-light text-right text-gray-700',
            tableHead: 'text-gray-500 uppercase text-xs tracking-wider border-b-2 border-gray-300',
            tableRowBorder: 'border-b border-gray-200',
            totalBorder: 'border-t border-gray-300',
            footerBorder: 'border-t border-gray-300',
        }
    }[doc.template || 'modern'];


    return (
        <div id="invoice-preview" className={`bg-white text-gray-800 p-8 w-[8.5in] min-h-[11in] mx-auto shadow-2xl relative ${templateClasses.font}`}>
            {doc.status === 'paid' && <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl font-bold text-green-500/20 transform -rotate-45 select-none z-0">PAID</div>}
            {isOverdue && <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl font-bold text-red-500/20 transform -rotate-45 select-none z-0">OVERDUE</div>}
            
            <header className={`flex justify-between items-start pb-6 ${templateClasses.headerBorder} relative z-10`}>
                <div>
                    {logoUrl ? (
                        <img src={logoUrl} alt="Company Logo" className="h-12 max-w-[200px] object-contain" />
                    ) : (
                        <Logo className="h-10 text-slate-800" />
                    )}
                    <p className="text-sm text-gray-500 mt-2">123 AI Avenue, Tech City, 10101</p>
                    <p className="text-sm text-gray-500">contact@deepshiftai.com</p>
                </div>
                <h1 className={templateClasses.title}>
                    {doc.type}
                </h1>
            </header>
            
            <section className="grid grid-cols-2 gap-8 my-8 relative z-10">
                <div>
                    <h2 className="text-sm font-semibold text-gray-500 mb-2">BILL TO</h2>
                    <p className="font-bold text-lg">{doc.customer.name || 'Customer Name'}</p>
                    <p>{doc.customer.address || 'Customer Address'}</p>
                    <p>{doc.customer.email || 'customer@email.com'}</p>
                    <p>{doc.customer.phone || '(123) 456-7890'}</p>
                </div>
                <div className="text-right">
                    <p><span className="font-semibold text-gray-500">{doc.type} #: </span>{doc.number}</p>
                    <p><span className="font-semibold text-gray-500">Date Issued: </span>{formatDate(doc.date)}</p>
                    {doc.type === DocTypeEnum.Invoice && doc.dueDate && <p><span className="font-semibold text-gray-500">Due Date: </span>{formatDate(doc.dueDate)}</p>}
                </div>
            </section>
            
            <section className="relative z-10">
                <table className="w-full text-left">
                    <thead className={templateClasses.tableHead}>
                        <tr>
                            <th className="p-3">Description</th>
                            <th className="p-3 w-24 text-center">Quantity</th>
                            <th className="p-3 w-32 text-right">Unit Price</th>
                            <th className="p-3 w-32 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {doc.items.map(item => (
                            <tr key={item.id} className={templateClasses.tableRowBorder}>
                                <td className={`p-3 ${doc.template === 'classic' ? templateClasses.tableRowBorder : ''}`}>{item.description}</td>
                                <td className={`p-3 text-center ${doc.template === 'classic' ? templateClasses.tableRowBorder : ''}`}>{item.quantity}</td>
                                <td className={`p-3 text-right ${doc.template === 'classic' ? templateClasses.tableRowBorder : ''}`}>{formatCurrency(item.unitPrice)}</td>
                                <td className={`p-3 text-right ${doc.template === 'classic' ? templateClasses.tableRowBorder : ''}`}>{formatCurrency(item.quantity * item.unitPrice)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
            
            <section className="flex justify-end mt-8 relative z-10">
                <div className="w-1/2">
                    <div className="flex justify-between py-2">
                        <span className="font-semibold text-gray-600">Subtotal</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                        <span className="font-semibold text-gray-600">Tax ({doc.taxRate}%)</span>
                        <span>{formatCurrency(taxAmount)}</span>
                    </div>
                    <div className={`flex justify-between py-3 mt-2 ${templateClasses.totalBorder}`}>
                        <span className="font-bold text-xl">Grand Total</span>
                        <span className="font-bold text-xl">{formatCurrency(grandTotal)}</span>
                    </div>
                    {doc.status !== 'draft' && <p className="text-right text-gray-500 text-sm mt-1">{getAmountInWords(grandTotal)}</p>}
                </div>
            </section>
            
            <footer className={`mt-16 pt-8 text-gray-500 text-sm absolute bottom-8 w-[calc(100%-4rem)] ${templateClasses.footerBorder}`}>
                <div className="flex justify-between items-end">
                    <div>
                        <h3 className="font-semibold mb-2">Notes</h3>
                        <p>{doc.notes}</p>
                        {doc.type === DocTypeEnum.Receipt && <p className="mt-2">Payment Method: {doc.paymentMethod}</p>}
                        {doc.signatureUrl && <img src={doc.signatureUrl} alt="Signature" className="max-h-16 mt-4" />}
                    </div>
                    <canvas ref={qrCanvasRef} className="w-[100px] h-[100px]"></canvas>
                </div>
                <p className="text-center mt-8">Thank you for choosing Deep Shift AI!</p>
            </footer>
        </div>
    );
};

// --- EDITOR VIEW ---
interface EditorViewProps {
    doc: InvoiceDocument;
    setDoc: React.Dispatch<React.SetStateAction<InvoiceDocument>>;
    onSaveDraft: () => void;
    onFinalize: (type: DocumentType) => void;
    onDownloadPdf: () => void;
    onGoToDashboard: () => void;
    isSaved: boolean;
    signatureUrl?: string;
    onSignatureChange: (url: string) => void;
    logoUrl?: string;
    onLogoChange: (url: string) => void;
}
const EditorView: React.FC<EditorViewProps> = ({ doc, setDoc, onSaveDraft, onFinalize, onDownloadPdf, onGoToDashboard, isSaved, signatureUrl, onSignatureChange, logoUrl, onLogoChange }) => {
    return (
        <div className="flex h-screen bg-slate-900 text-white">
            <aside className="w-[450px] flex-shrink-0 bg-slate-950/70 border-r border-slate-800 flex flex-col">
                <header className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <Logo className="h-8"/>
                    <button onClick={onGoToDashboard} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
                       <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto">
                    <InvoiceForm 
                        doc={doc} 
                        setDoc={setDoc} 
                        onSaveDraft={onSaveDraft} 
                        onFinalize={onFinalize} 
                        signatureUrl={signatureUrl} 
                        onSignatureChange={onSignatureChange} 
                        logoUrl={logoUrl} 
                        onLogoChange={onLogoChange} 
                    /> 
                </div>
                <footer className="p-4 border-t border-slate-800 flex flex-col gap-3">
                    <button onClick={onDownloadPdf} disabled={!isSaved} className="flex items-center justify-center gap-2 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <Download className="w-5 h-5"/> Download PDF
                    </button>
                </footer>
            </aside>
            <main className="flex-1 overflow-auto p-8 bg-slate-900">
                <div className="max-w-4xl mx-auto">
                    <InvoicePreview doc={doc} logoUrl={logoUrl} />
                </div>
            </main>
        </div>
    )
}

// --- DASHBOARD VIEW ---
interface DashboardViewProps {
    docs: InvoiceDocument[];
    onCreate: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onSendReminder: (id: string) => Promise<void>;
    generatingReminderFor: string | null;
    onScan: () => void;
}
const DashboardView: React.FC<DashboardViewProps> = ({ docs, onCreate, onEdit, onDelete, onSendReminder, generatingReminderFor, onScan }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [sortBy, setSortBy] = useState('date-desc');

    const getDisplayStatus = (doc: InvoiceDocument): { text: string; color: string; } => {
        const isOverdue = doc.status === 'unpaid' && doc.dueDate && new Date(doc.dueDate) < new Date();
        if (isOverdue) return { text: 'Overdue', color: 'bg-red-500/20 text-red-300' };
        switch(doc.status) {
            case 'paid': return { text: 'Paid', color: 'bg-green-500/20 text-green-300' };
            case 'unpaid': return { text: 'Unpaid', color: 'bg-orange-500/20 text-orange-300' };
            case 'draft': return { text: 'Draft', color: 'bg-slate-500/20 text-slate-300' };
            default: return { text: 'Unknown', color: 'bg-gray-500/20 text-gray-300' };
        }
    };

    const filteredAndSortedDocs = useMemo(() => {
        return docs
            .filter(doc => {
                const searchTermLower = searchTerm.toLowerCase();
                const matchesSearch = searchTerm ? 
                    doc.customer.name.toLowerCase().includes(searchTermLower) || 
                    doc.number.toLowerCase().includes(searchTermLower) : true;
                
                const displayStatus = getDisplayStatus(doc).text.toLowerCase();
                const matchesStatus = filterStatus === 'all' || displayStatus === filterStatus;

                const docDate = new Date(doc.date);
                const matchesDateStart = filterDateStart ? docDate >= new Date(filterDateStart) : true;
                const matchesDateEnd = filterDateEnd ? docDate <= new Date(filterDateEnd) : true;

                return matchesSearch && matchesStatus && matchesDateStart && matchesDateEnd;
            })
            .sort((a, b) => {
                const totalA = calculateTotals(a).grandTotal;
                const totalB = calculateTotals(b).grandTotal;
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();

                switch (sortBy) {
                    case 'date-asc': return dateA - dateB;
                    case 'amount-desc': return totalB - totalA;
                    case 'amount-asc': return totalA - totalB;
                    case 'date-desc':
                    default:
                         return dateB - dateA;
                }
            });
    }, [docs, searchTerm, filterStatus, filterDateStart, filterDateEnd, sortBy]);

    const metrics = useMemo(() => {
        const totalRevenue = docs
            .filter(d => d.status === 'paid')
            .reduce((sum, d) => sum + calculateTotals(d).grandTotal, 0);
        const outstandingBalance = docs
            .filter(d => d.status === 'unpaid')
            .reduce((sum, d) => sum + calculateTotals(d).grandTotal, 0);
        const drafts = docs.filter(d => d.status === 'draft').length;
        return { totalRevenue, outstandingBalance, drafts };
    }, [docs]);

    return (
        <div className="p-8 text-white max-w-7xl mx-auto">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Dashboard</h1>
                    <p className="text-slate-400">Manage all your invoices and receipts.</p>
                </div>
                 <div className="flex items-center gap-3">
                    <button onClick={onScan} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-md transition-colors flex items-center gap-2">
                       <Camera className="w-5 h-5" /> Scan to Verify
                    </button>
                    <button onClick={onCreate} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors flex items-center gap-2">
                       <PlusCircle className="w-5 h-5" /> Create New
                    </button>
                </div>
            </header>

             <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-950/70 p-6 rounded-lg border border-slate-800"><p className="text-sm text-slate-400">Total Revenue</p><p className="text-3xl font-bold text-green-400">{formatCurrency(metrics.totalRevenue)}</p></div>
                <div className="bg-slate-950/70 p-6 rounded-lg border border-slate-800"><p className="text-sm text-slate-400">Outstanding Balance</p><p className="text-3xl font-bold text-orange-400">{formatCurrency(metrics.outstandingBalance)}</p></div>
                <div className="bg-slate-950/70 p-6 rounded-lg border border-slate-800"><p className="text-sm text-slate-400">Drafts</p><p className="text-3xl font-bold">{metrics.drafts}</p></div>
            </section>


            <section className="bg-slate-950/70 p-4 rounded-lg border border-slate-800 mb-6 flex flex-wrap items-end gap-4">
                <div className="flex-grow min-w-[200px]"><label className="text-sm text-slate-400">Search</label><input type="search" placeholder="Customer or Doc #" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white mt-1"/></div>
                <div className="flex-grow"><label className="text-sm text-slate-400">Status</label><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white mt-1"><option value="all">All</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option><option value="draft">Draft</option></select></div>
                <div className="flex-grow"><label className="text-sm text-slate-400">Start Date</label><input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white mt-1"/></div>
                <div className="flex-grow"><label className="text-sm text-slate-400">End Date</label><input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white mt-1"/></div>
                <div className="flex-grow"><label className="text-sm text-slate-400">Sort By</label><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-white mt-1"><option value="date-desc">Date (Newest)</option><option value="date-asc">Date (Oldest)</option><option value="amount-desc">Amount (High-Low)</option><option value="amount-asc">Amount (Low-High)</option></select></div>
            </section>
            
            <section className="bg-slate-950/70 rounded-lg border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800 text-sm text-slate-300 uppercase">
                            <tr>
                                <th className="p-4">Status</th><th className="p-4">Number</th><th className="p-4">Customer</th>
                                <th className="p-4">Date</th><th className="p-4 text-right">Total</th><th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedDocs.length === 0 ? (
                                <tr><td colSpan={6} className="text-center p-8 text-slate-400">No matching documents found.</td></tr>
                            ) : (
                                filteredAndSortedDocs.map(doc => {
                                    const { text: statusText, color: statusColor } = getDisplayStatus(doc);
                                    return (
                                        <tr key={doc.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                                            <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor}`}>{statusText}</span></td>
                                            <td className="p-4 font-mono text-cyan-400">{doc.number}</td>
                                            <td className="p-4">{doc.customer.name}</td>
                                            <td className="p-4 text-slate-400">
                                                {formatDate(doc.date)}
                                                {doc.lastReminderSent && (
                                                    <p className="text-xs text-yellow-500 mt-1" title={`Reminder sent on ${formatDate(doc.lastReminderSent)}`}>
                                                        Reminder Sent
                                                    </p>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">{formatCurrency(calculateTotals(doc).grandTotal)}</td>
                                            <td className="p-4">
                                                <div className="flex justify-center items-center gap-2">
                                                    {statusText === 'Overdue' && (
                                                        <button 
                                                            onClick={() => onSendReminder(doc.id)} 
                                                            className="p-2 text-yellow-400 hover:text-yellow-300 disabled:text-slate-500 disabled:cursor-wait"
                                                            disabled={generatingReminderFor === doc.id}
                                                            aria-label={`Send reminder for invoice ${doc.number}`}
                                                            title="Send Reminder"
                                                        >
                                                            {generatingReminderFor === doc.id ? <Loader className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5"/>}
                                                        </button>
                                                    )}
                                                    <button onClick={() => onEdit(doc.id)} title="Edit" className="p-2 text-slate-400 hover:text-white"><Edit className="w-5 h-5"/></button>
                                                    <button onClick={() => onDelete(doc.id)} title="Delete" className="p-2 text-red-500 hover:text-red-400"><Trash2 className="w-5 h-5"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

        </div>
    );
}

// --- SCANNER VIEW ---
interface ScannerViewProps {
    onScan: (data: string) => void;
    onCancel: () => void;
}
const ScannerView: React.FC<ScannerViewProps> = ({ onScan, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>();
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    const tick = () => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) return;
            
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                }
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                }
                onScan(code.data);
                return;
            }
        }
        requestRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute("playsinline", "true"); // required for iOS
                    videoRef.current.play();
                    requestRef.current = requestAnimationFrame(tick);
                }
            } catch (err) {
                console.error("Camera access denied:", err);
                setError("Camera access is required to scan QR codes. Please enable it in your browser settings.");
            }
        };

        startCamera();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
            <video ref={videoRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-4">
                <p className="text-white text-lg font-semibold bg-black/50 px-4 py-2 rounded-lg mb-4">
                    Point your camera at a QR code
                </p>
                <div className="w-64 h-64 border-4 border-dashed border-white/50 rounded-lg relative">
                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-md"></div>
                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-md"></div>
                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-md"></div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-md"></div>
                </div>
                {error && <p className="text-red-400 mt-4 bg-black/50 p-4 rounded-lg text-center max-w-md">{error}</p>}
            </div>

            <button 
                onClick={onCancel} 
                className="absolute bottom-10 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors z-20"
            >
                Cancel
            </button>
        </div>
    );
};

// --- VERIFICATION MODAL ---
const CheckCircle: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
);
const XCircle: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
);
interface VerificationModalProps {
    result: InvoiceDocument | 'not_found';
    onClose: () => void;
}
const VerificationModal: React.FC<VerificationModalProps> = ({ result, onClose }) => {
    const isSuccess = result !== 'not_found';
    const doc = isSuccess ? result as InvoiceDocument : null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose} aria-modal="true" role="dialog">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className={`p-6 rounded-t-xl flex flex-col items-center text-center ${isSuccess ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {isSuccess ? <CheckCircle className="w-16 h-16 text-green-400 mb-4" /> : <XCircle className="w-16 h-16 text-red-400 mb-4" />}
                    <h2 className={`text-2xl font-bold ${isSuccess ? 'text-green-300' : 'text-red-300'}`}>
                        {isSuccess ? 'Document Verified' : 'Verification Failed'}
                    </h2>
                    <p className="text-slate-400 mt-1">
                        {isSuccess ? 'This document is authentic and found in our records.' : 'This document could not be found. It may be invalid or deleted.'}
                    </p>
                </div>
                
                {doc && (
                    <div className="p-6 space-y-3">
                        <div className="flex justify-between items-center text-lg"><span className="text-slate-400">Number:</span> <span className="font-mono text-cyan-400">{doc.number}</span></div>
                        <div className="flex justify-between items-center text-lg"><span className="text-slate-400">Customer:</span> <span className="font-semibold">{doc.customer.name}</span></div>
                        <div className="flex justify-between items-center text-lg"><span className="text-slate-400">Date:</span> <span>{formatDate(doc.date)}</span></div>
                        <div className="flex justify-between items-center text-lg"><span className="text-slate-400">Total:</span> <span className="font-bold text-xl">{formatCurrency(calculateTotals(doc).grandTotal)}</span></div>
                         <div className="flex justify-between items-center text-lg"><span className="text-slate-400">Status:</span> <span className={`px-2 py-1 rounded-full text-sm font-semibold ${
                                doc.status === 'paid' ? 'bg-green-500/20 text-green-300' : 
                                doc.status === 'unpaid' ? 'bg-orange-500/20 text-orange-300' :
                                'bg-slate-500/20 text-slate-300'
                            }`}>{doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}</span></div>
                    </div>
                )}

                <div className="p-4 bg-slate-900/50 rounded-b-xl">
                    <button onClick={onClose} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-md transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    const initialDocs = useMemo<InvoiceDocument[]>(() => {
        try {
            const savedData = localStorage.getItem('deepshift-invoice-docs');
            if (savedData) {
                const parsed = JSON.parse(savedData);
                if (Array.isArray(parsed)) {
                     // Data migration for old documents
                    return parsed.map(doc => ({
                        ...doc,
                        status: doc.status || (doc.type === DocTypeEnum.Receipt ? 'paid' : 'unpaid'),
                        template: doc.template || 'modern'
                    }));
                }
            }
        } catch (error) {
            console.error("Failed to load or parse documents from localStorage", error);
        }
        return [];
    }, []);

    const [documents, setDocuments] = useState<InvoiceDocument[]>(initialDocs);
    const [signatureUrl, setSignatureUrl] = useState<string>(() => {
        try { return localStorage.getItem('deepshift-signature') || ''; }
        catch (e) { return '' }
    });
    const [logoUrl, setLogoUrl] = useState<string>(() => {
        try { return localStorage.getItem('deepshift-logo') || ''; }
        catch (e) { return '' }
    });
    const [currentDoc, setCurrentDoc] = useState<InvoiceDocument>(() => createEmptyDocument(initialDocs, signatureUrl));
    const [view, setView] = useState<'dashboard' | 'editor' | 'scanner'>('dashboard');
    const [isSaved, setIsSaved] = useState(false);
    const [generatingReminderFor, setGeneratingReminderFor] = useState<string | null>(null);
    const [verificationResult, setVerificationResult] = useState<InvoiceDocument | 'not_found' | null>(null);

    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

    // Save documents to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('deepshift-invoice-docs', JSON.stringify(documents));
        } catch (error) {
            console.error("Failed to save documents to localStorage", error);
        }
    }, [documents]);

    // Save signature to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('deepshift-signature', signatureUrl);
            setCurrentDoc(prev => ({...prev, signatureUrl}));
        } catch (error) {
            console.error("Failed to save signature to localStorage", error);
        }
    }, [signatureUrl]);

    // Save logo to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('deepshift-logo', logoUrl);
        } catch (error) {
            console.error("Failed to save logo to localStorage", error);
        }
    }, [logoUrl]);


    const saveDocument = (doc: InvoiceDocument) => {
        const isUpdate = documents.some(d => d.id === doc.id);
        if (isUpdate) {
            setDocuments(prev => prev.map(d => d.id === doc.id ? doc : d));
        } else {
            setDocuments(prev => [doc, ...prev]);
        }
        setCurrentDoc(doc);
        setIsSaved(true);
    }

    const handleSaveDraft = () => {
        saveDocument({ ...currentDoc, status: 'draft' });
    };

    const handleFinalize = (type: DocumentType) => {
        const isUpdate = documents.some(d => d.id === currentDoc.id);
        const newDoc: InvoiceDocument = {
            ...currentDoc,
            type,
            status: type === DocTypeEnum.Receipt ? 'paid' : 'unpaid',
            number: isUpdate ? currentDoc.number : getNextDocumentNumber(documents, type),
        };
        saveDocument(newDoc);
    };

    const handleCreateNew = () => {
        setCurrentDoc(createEmptyDocument(documents, signatureUrl));
        setIsSaved(false);
        setView('editor');
    }
    
    const handleEdit = (id: string) => {
        const doc = documents.find(d => d.id === id);
        if (doc) {
            setCurrentDoc(doc);
            setIsSaved(true);
            setView('editor');
        }
    }
    
    const handleDeleteHistory = (id: string) => {
        const docToDelete = documents.find(doc => doc.id === id);
        if (!docToDelete) return;

        if (window.confirm(`Are you sure you want to delete ${docToDelete.type} ${docToDelete.number}? This action cannot be undone.`)) {
            setDocuments(docs => docs.filter(d => d.id !== id));
            if (currentDoc.id === id) {
                setView('dashboard');
            }
        }
    }

    const handleSendReminder = async (id: string) => {
        const doc = documents.find(d => d.id === id);
        if (!doc || !doc.dueDate) return;

        const isOverdue = new Date(doc.dueDate) < new Date();
        if (!isOverdue) {
            alert("This invoice is not overdue yet.");
            return;
        }

        setGeneratingReminderFor(id);
        try {
            const prompt = `
                Generate a polite but firm reminder email for an overdue invoice.
                
                My company name: Deep Shift AI
                Customer Name: ${doc.customer.name}
                Invoice Number: ${doc.number}
                Invoice Amount: ${formatCurrency(calculateTotals(doc).grandTotal)}
                Due Date: ${formatDate(doc.dueDate)}

                The email should be professional and prompt the customer to make a payment as soon as possible.
                Keep it concise. Start with "Subject: Overdue Invoice Reminder: ${doc.number}".
                Do not include a sign-off like "Sincerely" or my company name at the very end, just the email body including the subject line.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const emailBody = response.text;
            
            if (window.confirm(`--- Generated Email ---\n\n${emailBody}\n\nDo you want to send this reminder to ${doc.customer.email}?`)) {
                // Mock sending email
                alert(`Reminder email has been sent to ${doc.customer.email}.`);
                
                // Update the document with the reminder date
                const updatedDoc = { ...doc, lastReminderSent: new Date().toISOString().split('T')[0] };
                setDocuments(prev => prev.map(d => d.id === id ? updatedDoc : d));
            }

        } catch (error) {
            console.error("Failed to generate reminder email:", error);
            alert("An error occurred while generating the reminder email. Please try again.");
        } finally {
            setGeneratingReminderFor(null);
        }
    };

    const handleDownloadPdf = useCallback(() => {
        // @ts-ignore html2pdf is loaded from CDN
        const element = document.getElementById('invoice-preview');
        const opt = {
          margin: [0.2, 0, 0.5, 0], // top, left, bottom, right
          filename: `${currentDoc.number}.pdf`,
          image: { type: 'jpeg', quality: 1 },
          html2canvas: { scale: 4, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        // @ts-ignore
        html2pdf().from(element).set(opt).save();
    }, [currentDoc.number]);

    const handleScan = (data: string) => {
        setView('dashboard'); // Go back to dashboard to show modal
        try {
            const parsedData = JSON.parse(data);
            if (parsedData && parsedData.verificationUrl) {
                const id = parsedData.verificationUrl.split('/').pop();
                const foundDoc = documents.find(d => d.id === id);
                setVerificationResult(foundDoc || 'not_found');
            } else {
                setVerificationResult('not_found');
            }
        } catch (error) {
            console.error("Failed to parse QR code data:", error);
            setVerificationResult('not_found');
        }
    };

    if (view === 'scanner') {
        return <ScannerView onScan={handleScan} onCancel={() => setView('dashboard')} />;
    }

    if (view === 'dashboard') {
        return (
            <>
                <DashboardView 
                    docs={documents} 
                    onCreate={handleCreateNew} 
                    onEdit={handleEdit} 
                    onDelete={handleDeleteHistory}
                    onSendReminder={handleSendReminder}
                    generatingReminderFor={generatingReminderFor}
                    onScan={() => setView('scanner')}
                />
                {verificationResult && (
                    <VerificationModal result={verificationResult} onClose={() => setVerificationResult(null)} />
                )}
            </>
        );
    }
    
    return <EditorView 
        doc={currentDoc} 
        setDoc={setCurrentDoc} 
        onSaveDraft={handleSaveDraft}
        onFinalize={handleFinalize}
        onDownloadPdf={handleDownloadPdf}
        onGoToDashboard={() => setView('dashboard')}
        isSaved={isSaved}
        signatureUrl={signatureUrl}
        onSignatureChange={setSignatureUrl}
        logoUrl={logoUrl}
        onLogoChange={setLogoUrl}
    />;
}
