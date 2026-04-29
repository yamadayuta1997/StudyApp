FROM node:20-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ ./
EXPOSE $PORT
CMD ["node", "index.js"]
