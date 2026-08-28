FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*
ENV STOCKFISH_PATH=/usr/games/stockfish

WORKDIR /app

COPY server/package*.json server/
RUN npm ci --prefix server --omit=dev

COPY client/package*.json client/
RUN npm ci --prefix client

COPY . .
RUN npm run build --prefix client

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/src/index.js"]
