import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables immediately
dotenv.config();

import { tenantMiddleware } from './middlewares/tenant';
import { initRetouchDaemon } from './services/retouchDaemon';
import authRouter from './routes/auth';
import professionalsRouter from './routes/professionals';
import patientsRouter from './routes/patients';
import packagesRouter from './routes/packages';
import appointmentsRouter from './routes/appointments';
import productsRouter from './routes/products';
import servicesRouter from './routes/services';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import financeRouter from './routes/finance';
import couponsRouter from './routes/coupons';
import campaignsRouter from './routes/campaigns';
import reportsRouter from './routes/reports';
import branchesRouter from './routes/branches';
import notificationsRouter from './routes/notifications';
import whatsappRouter from './routes/whatsapp';
import saasRouter from './routes/saas';
import tenantRouter from './routes/tenant';
import publicRouter from './routes/public';
import attendanceRouter from './routes/attendance';

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Serve uploaded files statically (before tenant scoping)
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// SaaS Super-Admin routes (before tenant scoping)
app.use('/api/saas', saasRouter);

app.use(tenantMiddleware);

// Scoped Tenant Settings routes (after tenant scoping)
app.use('/api/tenant', tenantRouter);

// Public Patient Portal routes (after tenant scoping, whitelisted from auth in middleware)
app.use('/api/public', publicRouter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/professionals', professionalsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/products', productsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/finance', financeRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/attendance', attendanceRouter);

// Basic Route for Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'Backend server is running correctly.',
    timestamp: new Date().toISOString()
  });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    initRetouchDaemon();
  });
}

export { app };

