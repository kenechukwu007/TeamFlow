FROM node:24.21.0-alpine3.24 AS build

LABEL "Project"="Containerizing Frontend TeamFlow app"
LABEL "Author"="William"

WORKDIR /teamflow
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci
COPY apps/web ./apps/web
RUN npm run build -w @teamflow/web

 
FROM nginx:1.30.5-alpine AS runtime

COPY --from=build /teamflow/apps/web/dist/ /usr/share/nginx/html/
COPY Docker-files/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]