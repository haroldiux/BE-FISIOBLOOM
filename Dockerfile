FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar el esquema de Prisma y generarlo antes de compilar
COPY prisma ./prisma/
COPY prisma.config.js ./
RUN npx prisma generate

# Copiar código fuente y compilar
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Imagen de producción final limpia y optimizada
FROM node:20-alpine AS runner

WORKDIR /app

# Copiar dependencias de producción y binario de Prisma
COPY package*.json ./
RUN npm install --only=production

# Copiar el cliente Prisma generado y los compilados de compilación
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
