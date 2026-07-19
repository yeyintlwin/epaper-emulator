FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./server.js
COPY epaper-codec.js ./epaper-codec.js
COPY epaper-request-payload.js ./epaper-request-payload.js
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
