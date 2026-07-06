import { Router } from 'express';
import { getServices, getProfessionals, getSlots, createBooking } from '../controllers/public';

const router = Router();

// Endpoints públicos del portal de pacientes
router.get('/services', getServices);
router.get('/professionals', getProfessionals);
router.get('/slots', getSlots);
router.post('/bookings', createBooking);

export default router;
