FROM node:18-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:18-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/app.db
EXPOSE 5000
CMD ["node", "server/index.js"]
