import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as invoicesController from '../controllers/invoices';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/invoices/patient/:patientId — must be before /:id
router.get('/patient/:patientId', invoicesController.getPatientInvoices);

// GET /api/invoices?patientId=&from=&to=
router.get('/', invoicesController.getAll);

// GET /api/invoices/:id
router.get('/:id', invoicesController.getById);

// POST /api/invoices
router.post('/', requireRole([Role.RECEPTIONIST, Role.ADMIN, Role.SUPER_ADMIN]), invoicesController.create);

// PUT /api/invoices/:id
router.put('/:id', requireRole([Role.RECEPTIONIST, Role.ADMIN, Role.SUPER_ADMIN]), invoicesController.updateInvoice);

// DELETE /api/invoices/:id (Void invoice)
router.delete('/:id', requireRole([Role.ADMIN, Role.SUPER_ADMIN]), invoicesController.voidInvoice);

export default router;
