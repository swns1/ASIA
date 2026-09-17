# The admin portal as a static site: build with Vite, serve with Caddy.
#
# Build context is the REPOSITORY ROOT (deploy/railway/Caddyfile is outside
# this folder). The four API URLs are baked into the bundle at build time and
# the build refuses to run without them (vite.config.js). On Railway, set them
# as service variables; Railway passes them to the build for the ARGs below.
#   docker build -f frontend/admin-portal/Dockerfile \
#     --build-arg VITE_IDENTITY_API_URL=https://... (x4) .

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/admin-portal/package.json frontend/admin-portal/package-lock.json ./
RUN npm ci
COPY frontend/admin-portal/ ./

ARG VITE_IDENTITY_API_URL
ARG VITE_STUDENT_API_URL
ARG VITE_BILLING_API_URL
ARG VITE_ENROLLMENT_API_URL
ARG VITE_AUDIT_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY deploy/railway/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
