import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { storageService } from '../services/storage';
import { sanitizeXSS } from '../services/sanitize';

// El frontend ya exige teléfono de 8 dígitos y email @gmail.com (ver
// sanitizePhone/validación en PatientScreen.tsx), pero esas reglas nunca se
// revalidaban acá — cualquiera con acceso directo a la API podía guardar un
// teléfono de 3 dígitos o un email de otro dominio. Espejo server-side de la
// misma regla, para no depender solo de la validación del cliente.
function validatePatientContactFields(phone: string | undefined, email: string | null | undefined): string | null {
  if (phone !== undefined && !/^\d{8}$/.test(phone)) {
    return 'El teléfono debe tener exactamente 8 dígitos.';
  }
  if (email && !email.toLowerCase().endsWith('@gmail.com')) {
    return 'El correo debe terminar en @gmail.com.';
  }
  return null;
}

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, bookingSearch } = req.query;
    const isReceptionist = req.user?.role === Role.RECEPTIONIST;
    const tenantId = req.user!.tenantId;

    const whereClause: any = {
      isActive: true,
      tenantId,
      AND: [] as any[],
    };

    // Fisioterapia y Estética son especialidades distintas con carteras de
    // pacientes separadas: un fisio no debe ver pacientes que solo son de la
    // esteticista, y viceversa. Se considera "de la especialidad" a un
    // paciente si fue registrado por alguien de esa especialidad o si tiene
    // al menos una cita de un servicio/profesional de esa especialidad.
    if (req.user?.role === Role.PHYSIO || req.user?.role === Role.AESTHETICIAN) {
      const specialtyCategories =
        req.user.role === Role.PHYSIO ? ['FISIOTERAPIA'] : ['FACIAL', 'CORPORAL', 'ESTETICA'];

      whereClause.AND.push({
        OR: [
          { createdBy: { role: req.user.role } },
          { appointments: { some: { professional: { role: req.user.role } } } },
          { appointments: { some: { service: { category: { in: specialtyCategories } } } } },
        ],
      });
    }

    if (search) {
      const searchStr = search as string;
      whereClause.AND.push({ OR: [
        { fullName: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { email: { contains: searchStr, mode: 'insensitive' } },
      ] });
    }

    if (whereClause.AND.length === 0) {
      delete whereClause.AND;
    }

    const patients = await prisma.patient.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        consentSigned: true,
        createdAt: true,
        updatedAt: true,
        // No exponer historial médico en una búsqueda de agendamiento (solo se necesita
        // identificar al paciente por nombre/teléfono), ni tampoco a recepción.
        medicalHistory: !isReceptionist && bookingSearch !== 'true',
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    res.json(patients);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching patients.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, fullName, phone, email, consentSigned, medicalHistory } = req.body;
    const isReceptionist = req.user?.role === Role.RECEPTIONIST;
    const tenantId = req.user!.tenantId;

    if (!fullName || !phone) {
      res.status(400).json({ error: 'fullName y phone son obligatorios.' });
      return;
    }

    const contactError = validatePatientContactFields(phone, email);
    if (contactError) {
      res.status(400).json({ error: contactError });
      return;
    }

    // Check if patient already exists (idempotency for offline sync)
    if (id) {
      const existingPatient = await prisma.patient.findFirst({
        where: { id: String(id), tenantId },
      });
      if (existingPatient) {
        res.status(200).json({
          message: 'Patient already registered.',
          patient: existingPatient,
        });
        return;
      }
    }

    // Evitar duplicados: si ya existe un paciente activo con ese teléfono en la
    // clínica, se devuelve el existente en vez de crear uno nuevo. Esto puede pasar
    // cuando un profesional no encuentra a un paciente ya existente en su vista
    // acotada y trata de registrarlo "de nuevo".
    const duplicatePatient = await prisma.patient.findFirst({
      where: { phone: sanitizeXSS(phone), tenantId, isActive: true },
    });
    if (duplicatePatient) {
      res.status(200).json({
        message: 'Patient already registered.',
        patient: duplicatePatient,
      });
      return;
    }

    const patientData: any = {
      id: id ? String(id) : undefined,
      fullName: sanitizeXSS(fullName),
      phone: sanitizeXSS(phone),
      email: email ? sanitizeXSS(email) : null,
      consentSigned: consentSigned !== undefined ? Boolean(consentSigned) : false,
      tenantId,
      createdById: req.user?.id,
    };

    // Receptionists cannot register medical history
    if (!isReceptionist && medicalHistory !== undefined) {
      patientData.medicalHistory = medicalHistory ? sanitizeXSS(medicalHistory) : null;
    }

    const newPatient = await prisma.patient.create({
      data: patientData,
    });

    res.status(201).json({
      message: 'Patient registered successfully.',
      patient: newPatient,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred registering patient.' });
  }
};

export const getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const patientWhere: any = { id: id as string, isActive: true, tenantId };
    // Misma separación por especialidad que en getAll: un fisio no debe poder
    // abrir la ficha de un paciente que solo es de la esteticista, y viceversa.
    if (req.user?.role === Role.PHYSIO || req.user?.role === Role.AESTHETICIAN) {
      const specialtyCategories =
        req.user.role === Role.PHYSIO ? ['FISIOTERAPIA'] : ['FACIAL', 'CORPORAL', 'ESTETICA'];

      patientWhere.OR = [
        { createdBy: { role: req.user.role } },
        { appointments: { some: { professional: { role: req.user.role } } } },
        { appointments: { some: { service: { category: { in: specialtyCategories } } } } },
      ];
    }

    const patient = await prisma.patient.findFirst({
      where: patientWhere,
      include: {
        treatmentPackages: {
          include: {
            lines: {
              include: {
                sessionDetails: {
                  include: {
                    appointment: {
                      include: {
                        professional: {
                          select: {
                            name: true,
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
          },
        },
        retouchSchedules: {
          include: {
            service: {
              select: {
                name: true,
              }
            }
          },
          orderBy: {
            scheduledDate: 'desc',
          }
        },
        appointments: {
          include: {
            sessionDetail: true,
            professional: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            dateTime: 'desc',
          },
        },
        consentDocuments: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            signedAt: 'desc',
          },
        },
      },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    res.json(patient);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching patient.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { fullName, phone, email, consentSigned, medicalHistory } = req.body;
    const isReceptionist = req.user?.role === Role.RECEPTIONIST;
    const tenantId = req.user!.tenantId;

    if (isReceptionist && medicalHistory !== undefined) {
      res.status(403).json({ error: 'Acceso denegado. Las recepcionistas no pueden editar el historial médico.' });
      return;
    }

    const patient = await prisma.patient.findFirst({
      where: { id: id as string, isActive: true, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    const contactError = validatePatientContactFields(phone, email);
    if (contactError) {
      res.status(400).json({ error: contactError });
      return;
    }

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = sanitizeXSS(fullName);
    if (phone !== undefined) updateData.phone = sanitizeXSS(phone);
    if (email !== undefined) updateData.email = email ? sanitizeXSS(email) : null;
    if (consentSigned !== undefined) updateData.consentSigned = Boolean(consentSigned);
    if (!isReceptionist && medicalHistory !== undefined) updateData.medicalHistory = medicalHistory ? sanitizeXSS(medicalHistory) : null;

    const updatedPatient = await prisma.patient.update({
      where: { id: id as string, tenantId },
      data: updateData,
    });

    res.json({
      message: 'Patient updated successfully.',
      patient: updatedPatient,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred updating patient.' });
  }
};

export const deletePatient = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const patient = await prisma.patient.findFirst({
      where: { id: id as string, isActive: true, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    // Soft delete to preserve records
    await prisma.patient.update({
      where: { id: id as string, tenantId },
      data: { isActive: false },
    });

    res.json({
      message: 'Patient deactivated successfully.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred deleting patient.' });
  }
};

export const uploadPhoto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const { id, photoData, type, notes } = req.body;
    const tenantId = req.user!.tenantId;

    if (!photoData) {
      res.status(400).json({ error: 'photoData (string en Base64) es obligatorio.' });
      return;
    }

    // Check if patient exists in this tenant
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado en esta clínica.' });
      return;
    }

    // Check if photo already exists (idempotency for offline sync)
    if (id) {
      const existingPhoto = await prisma.patientPhoto.findFirst({
        where: { id: String(id), tenantId },
      });
      if (existingPhoto) {
        res.status(200).json({
          message: 'Photo already uploaded.',
          photo: existingPhoto,
        });
        return;
      }
    }

    // Save Base64 image using storage service
    const fileUrl = await storageService.saveBase64(photoData, `${patientId}-${Date.now()}.png`);

    // Create registry in PatientPhoto
    const photo = await prisma.patientPhoto.create({
      data: {
        id: id ? String(id) : undefined,
        tenantId,
        patientId,
        url: fileUrl,
        type: type || 'EVOLUTION',
        notes: notes || null,
      },
    });

    res.status(201).json({
      message: 'Photo uploaded successfully.',
      photo,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred uploading photo.' });
  }
};

export const getPhotos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado en esta clínica.' });
      return;
    }

    const photos = await prisma.patientPhoto.findMany({
      where: { patientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(photos);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching photos.' });
  }
};
