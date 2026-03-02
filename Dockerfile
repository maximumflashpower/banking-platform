FROM node:20.11.1-alpine

WORKDIR /app

# Instalación reproducible (usa lockfile)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm","run","dev"]
