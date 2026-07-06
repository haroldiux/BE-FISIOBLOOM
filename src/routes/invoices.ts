import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
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
router.post('/', invoicesController.create);

export default router;
