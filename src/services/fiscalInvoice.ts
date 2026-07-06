export interface FiscalInvoiceRequest {
  invoiceId: string;
  taxId: string; // Patient's RFC/CUIT/tax identification
  clientName: string;
  amount: number;
  description: string;
}

export interface FiscalInvoiceResponse {
  fiscalId: string; // UUID/CAE from government
  qrCode: string;
  pdfUrl: string;
  appliedTax: number;
  totalWithTax: number;
}

export interface IFiscalAdapter {
  emitInvoice(req: FiscalInvoiceRequest): Promise<FiscalInvoiceResponse>;
}

// SAT Mexico Adapter (16% VAT)
export class MockSATAdapter implements IFiscalAdapter {
  async emitInvoice(req: FiscalInvoiceRequest): Promise<FiscalInvoiceResponse> {
    console.log(`[SAT ADAPTER] Emitting fiscal invoice for client: ${req.clientName}`);
    // Simulate short network delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    const appliedTax = Number((req.amount * 0.16).toFixed(2));
    const totalWithTax = Number((req.amount + appliedTax).toFixed(2));

    return {
      fiscalId: `SAT-CFDI-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      qrCode: `https://sat.gob.mx/consulta?uuid=${req.invoiceId}`,
      pdfUrl: `https://sat.gob.mx/cfdi/pdf/${req.invoiceId}`,
      appliedTax,
      totalWithTax,
    };
  }
}

// AFIP Argentina Adapter (21% VAT)
export class MockAFIPAdapter implements IFiscalAdapter {
  async emitInvoice(req: FiscalInvoiceRequest): Promise<FiscalInvoiceResponse> {
    console.log(`[AFIP ADAPTER] Emitting fiscal invoice for client: ${req.clientName}`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const appliedTax = Number((req.amount * 0.21).toFixed(2));
    const totalWithTax = Number((req.amount + appliedTax).toFixed(2));

    return {
      fiscalId: `AFIP-CAE-${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
      qrCode: `https://afip.gob.ar/consulta?cae=${req.invoiceId}`,
      pdfUrl: `https://afip.gob.ar/facturadigital/pdf/${req.invoiceId}`,
      appliedTax,
      totalWithTax,
    };
  }
}

// Coordinator class / Service using the Adapter Pattern
export class FiscalInvoiceService {
  private adapter: IFiscalAdapter;

  constructor(provider: 'SAT' | 'AFIP' | string) {
    if (provider === 'AFIP') {
      this.adapter = new MockAFIPAdapter();
    } else {
      // Default to SAT
      this.adapter = new MockSATAdapter();
    }
  }

  async emit(req: FiscalInvoiceRequest): Promise<FiscalInvoiceResponse> {
    return this.adapter.emitInvoice(req);
  }
}
