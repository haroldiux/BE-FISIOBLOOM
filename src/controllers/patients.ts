import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { storageService } from '../services/storage';
import { sanitizeXSS } from '../services/sanitize';

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

export const signConsent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const { id, serviceId, signatureData } = req.body;
    const tenantId = req.user!.tenantId;

    if (!serviceId || !signatureData) {
      res.status(400).json({ error: 'serviceId y signatureData son obligatorios.' });
      return;
    }

    // Check if consent already exists (idempotency for offline sync)
    if (id) {
      const existingConsent = await prisma.consentDocument.findFirst({
        where: { id: String(id), tenantId },
        include: {
          service: {
            select: {
              name: true,
            },
          },
        },
      });
      if (existingConsent) {
        res.status(200).json({
          message: 'Consent signed successfully.',
          consent: existingConsent,
        });
        return;
      }
    }

    // Verificar que el paciente existe
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    let finalServiceId = serviceId;
    const fallbackBranchId = req.user!.branchId || patient.branchId;
    if (serviceId === 'general') {
      let generalService = await prisma.service.findFirst({
        where: { name: 'Consentimiento General', tenantId },
      });
      if (!generalService) {
        if (!fallbackBranchId) {
          res.status(400).json({ error: 'No se pudo determinar la sucursal para crear el Consentimiento General.' });
          return;
        }
        generalService = await prisma.service.create({
          data: {
            id: `general-service-${tenantId}-${fallbackBranchId}`,
            name: 'Consentimiento General',
            category: 'ESTETICA',
            defaultDuration: 0,
            defaultPrice: 0,
            requiresConsent: true,
            tenantId,
            branchId: fallbackBranchId,
          },
        });
      }
      finalServiceId = generalService.id;
    } else if (serviceId === 'fallback-laser') {
      let laserService = await prisma.service.findFirst({
        where: { name: 'Depilación Láser', tenantId },
      });
      if (!laserService) {
        laserService = await prisma.service.findFirst({
          where: { name: { contains: 'Láser', mode: 'insensitive' }, tenantId },
        });
      }
      if (!laserService) {
        if (!fallbackBranchId) {
          res.status(400).json({ error: 'No se pudo determinar la sucursal para crear el servicio de Depilación Láser.' });
          return;
        }
        laserService = await prisma.service.create({
          data: {
            id: `laser-service-${tenantId}-${fallbackBranchId}`,
            name: 'Depilación Láser',
            category: 'ESTETICA',
            defaultDuration: 30,
            defaultPrice: 150,
            requiresConsent: true,
            tenantId,
            branchId: fallbackBranchId,
          },
        });
      }
      finalServiceId = laserService.id;
    } else {
      // Verificar que el servicio existe
      const service = await prisma.service.findFirst({
        where: { id: serviceId, tenantId },
      });

      if (!service) {
        res.status(404).json({ error: 'Servicio no encontrado.' });
        return;
      }
    }

    // Crear el documento de consentimiento
    const consent = await prisma.consentDocument.create({
      data: {
        id: id ? String(id) : undefined,
        patientId,
        serviceId: finalServiceId,
        signatureData,
        tenantId,
        branchId: patient.branchId,
      },
      include: {
        service: {
          select: {
            name: true,
          },
        },
      },
    });

    // Marcar consentSigned como true en el paciente
    await prisma.patient.update({
      where: { id: patientId, tenantId },
      data: { consentSigned: true },
    });

    res.status(201).json({
      message: 'Consent signed successfully.',
      consent,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred signing consent.' });
  }
};

export const getConsents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    const consents = await prisma.consentDocument.findMany({
      where: { patientId, tenantId },
      include: {
        service: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        signedAt: 'desc',
      },
    });

    res.json(consents);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching consent documents.' });
  }
};

export const getAllConsents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;

    const consents = await prisma.consentDocument.findMany({
      where: { tenantId },
      include: {
        patient: {
          select: {
            fullName: true,
            phone: true,
            email: true,
          },
        },
        service: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        signedAt: 'desc',
      },
    });

    res.json(consents);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching all consent documents.' });
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
