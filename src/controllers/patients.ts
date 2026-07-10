import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { storageService } from '../services/storage';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;
    const isReceptionist = req.user?.role === Role.RECEPTIONIST;
    const tenantId = req.user!.tenantId;

    const whereClause: any = {
      isActive: true,
      tenantId,
    };

    if (search) {
      const searchStr = search as string;
      whereClause.OR = [
        { fullName: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { email: { contains: searchStr, mode: 'insensitive' } },
      ];
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
        // Only include medicalHistory if NOT a receptionist
        medicalHistory: !isReceptionist,
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
      res.status(400).json({ error: 'fullName and phone are required.' });
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

    const patientData: any = {
      id: id ? String(id) : undefined,
      fullName,
      phone,
      email: email || null,
      consentSigned: consentSigned !== undefined ? Boolean(consentSigned) : false,
      tenantId,
    };

    // Receptionists cannot register medical history
    if (!isReceptionist && medicalHistory !== undefined) {
      patientData.medicalHistory = medicalHistory;
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
    const isReceptionist = req.user?.role === Role.RECEPTIONIST;
    const tenantId = req.user!.tenantId;

    const patient = await prisma.patient.findFirst({
      where: { id: id as string, isActive: true, tenantId },
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
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    // Security sanitization for RECEPTIONIST
    if (isReceptionist) {
      // Hide medicalHistory
      patient.medicalHistory = null;

      // Hide details from sessionDetail inside appointments
      patient.appointments = patient.appointments.map((appt) => {
        if (appt.sessionDetail) {
          appt.sessionDetail = {
            id: appt.sessionDetail.id,
            appointmentId: appt.sessionDetail.appointmentId,
            packageLineId: appt.sessionDetail.packageLineId,
            createdAt: appt.sessionDetail.createdAt,
            updatedAt: appt.sessionDetail.updatedAt,
            evolutionNotes: null,
            measurements: null,
          } as any;
        }
        return appt;
      });
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
      res.status(403).json({ error: 'Access denied. Receptionists cannot view or update medical records.' });
      return;
    }

    const patient = await prisma.patient.findFirst({
      where: { id: id as string, isActive: true, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email || null;
    if (consentSigned !== undefined) updateData.consentSigned = Boolean(consentSigned);
    if (!isReceptionist && medicalHistory !== undefined) updateData.medicalHistory = medicalHistory;

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
      res.status(404).json({ error: 'Patient not found.' });
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
      res.status(400).json({ error: 'serviceId and signatureData are required.' });
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
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    let finalServiceId = serviceId;
    if (serviceId === 'general') {
      let generalService = await prisma.service.findFirst({
        where: { name: 'Consentimiento General', tenantId },
      });
      if (!generalService) {
        generalService = await prisma.service.create({
          data: {
            id: `general-service-${tenantId}`,
            name: 'Consentimiento General',
            category: 'ESTETICA',
            defaultDuration: 0,
            defaultPrice: 0,
            requiresConsent: true,
            tenantId,
          },
        });
      }
      finalServiceId = generalService.id;
    } else {
      // Verificar que el servicio existe
      const service = await prisma.service.findFirst({
        where: { id: serviceId, tenantId },
      });

      if (!service) {
        res.status(404).json({ error: 'Service not found.' });
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
      res.status(404).json({ error: 'Patient not found.' });
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
      res.status(400).json({ error: 'photoData (Base64 string) is required.' });
      return;
    }

    // Check if patient exists in this tenant
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found in this clinic.' });
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
      res.status(404).json({ error: 'Patient not found in this clinic.' });
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
