# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

# ---- Web application ----
FROM base AS web
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]

# ---- Background worker ----
# OCR dependencies live only in this image: the web tier never rasterises a PDF,
# so shipping tesseract there would be dead weight and extra attack surface.
FROM base AS worker
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-ben tesseract-ocr-eng poppler-utils \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json /app/tsconfig.json ./
CMD ["npm", "run", "worker"]
