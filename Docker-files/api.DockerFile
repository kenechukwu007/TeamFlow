FROM node:24.21.0-alpine3.24 AS build

LABEL "Project"="Containerizing APi TeamFlow app"
LABEL "Author"="William"

WORKDIR /teamflow
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci
COPY apps/api ./apps/api
RUN npm run build -w @teamflow/api

FROM node:24.21.0-alpine3.24 AS runtime

WORKDIR /teamflow
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev --workspace=@teamflow/api --include-workspace-root=false

COPY --from=build /teamflow/apps/api/dist ./apps/api/dist
COPY --from=build /teamflow/apps/api/migrations ./apps/api/migrations

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
