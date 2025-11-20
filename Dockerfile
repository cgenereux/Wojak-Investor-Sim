FROM node:20-alpine

WORKDIR /app

# Install server deps separately for better layer caching
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy the rest of the repo (includes src/ needed by server)
COPY . .

ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/server.js"]
