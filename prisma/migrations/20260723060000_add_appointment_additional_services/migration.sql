-- Permite elegir más de un servicio/tratamiento en la misma cita (ej. "esto y esto").
-- El campo serviceId sigue siendo el servicio principal; estos son los adicionales.
ALTER TABLE "Appointment" ADD COLUMN "additionalServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
