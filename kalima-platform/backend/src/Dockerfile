# ---- Build Stage ----
FROM node:current-alpine3.23 AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --force

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY src/ ./src/

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ---- Production Stage ----
FROM node:current-alpine3.23 AS production

WORKDIR /app

# Required for server-rendered e-booklet page preview images and Arabic print text.
RUN apk add --no-cache poppler-utils fontconfig font-noto font-noto-arabic font-noto-kufi-arabic font-noto-naskh-arabic

# Bundled print-template fonts (OFL — Alexandria, Aref Ruqaa). Installed into the
# system font path so Pango/sharp can resolve them by family name, then cached.
COPY src/assets/fonts/print/ /usr/share/fonts/kalima/
RUN fc-cache -f

# Copy node_modules from builder — keeps the Prisma CLI available for migrations
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy Prisma config + migrations so `prisma migrate deploy` can resolve them at runtime
COPY prisma.config.ts ./
COPY src/apps/store-api/prisma/schema.prisma ./src/apps/store-api/prisma/schema.prisma
COPY src/apps/store-api/prisma/migrations ./src/apps/store-api/prisma/migrations

# Copy entrypoint script that handles failed migrations automatically
COPY src/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5000

CMD ["./docker-entrypoint.sh"]
