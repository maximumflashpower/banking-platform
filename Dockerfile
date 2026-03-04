FROM node:20.11.1-alpine

WORKDIR /app

# "nc" is used by docker-compose startup command (wait-for-db)
RUN apk add --no-cache netcat-openbsd

# Instalación reproducible (usa lockfile)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Install gateway-api dependencies (monorepo subpackage)
RUN npm ci --prefix services/gateway-api

EXPOSE 3000
CMD ["npm","run","dev"]
