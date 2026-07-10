import { Router } from 'express';
import { getAll, create, getById, update, deletePatient, signConsent, getConsents, getAllConsents, uploadPhoto, getPhotos } from '../controllers/patients';
import { getPatientPackages } from '../controllers/packages';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', requireAuth, getAll);
router.get('/consents/all', requireAuth, getAllConsents);
router.post('/', requireAuth, create);
router.get('/:id', requireAuth, getById);
router.get('/:id/packages', requireAuth, getPatientPackages);
router.post('/:id/consent', requireAuth, signConsent);
router.get('/:id/consent', requireAuth, getConsents);
router.post('/:id/photos', requireAuth, uploadPhoto);
router.get('/:id/photos', requireAuth, getPhotos);
router.put('/:id', requireAuth, update);
router.delete('/:id', requireAuth, requireRole([Role.ADMIN]), deletePatient); // Only ADMIN can delete/deactivate

export default router;
