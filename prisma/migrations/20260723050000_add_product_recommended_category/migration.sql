-- Permite marcar un producto como sugerido/complementario para una categoría
-- de servicio en particular (ej. cremas para Fisioterapia, sérums para Facial),
-- para poder ofrecerlo como upsell al momento de cobrar.
ALTER TABLE "Product" ADD COLUMN "recommendedCategory" "ServiceCategory";
