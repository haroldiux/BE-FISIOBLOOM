import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getWhatsAppStatus, getWhatsAppLogs, sendTestReminder, handleWhatsAppWebhook } from '../controllers/whatsapp';

const router = Router();

// Webhook endpoint (public, no auth)
router.post('/webhook', handleWhatsAppWebhook);

// GET /api/whatsapp/status
router.get('/status', requireAuth, getWhatsAppStatus);

// GET /api/whatsapp/logs
router.get('/logs', requireAuth, getWhatsAppLogs);

// POST /api/whatsapp/test
router.post('/test', requireAuth, sendTestReminder);

export default router;
