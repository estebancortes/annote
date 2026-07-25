FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV ANNOTE_DATABASE_PATH=/data/annote.db

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.mjs"]
