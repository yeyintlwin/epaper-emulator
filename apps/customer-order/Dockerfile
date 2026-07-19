FROM node:20-alpine

WORKDIR /app

COPY packages/epaper-hub-sdk ./packages/epaper-hub-sdk
COPY apps/customer-order ./apps/customer-order

RUN npm --prefix packages/epaper-hub-sdk install --omit=dev \
 && npm --prefix apps/customer-order install --omit=dev --workspaces=false

ENV NODE_ENV=production PORT=3100

EXPOSE 3100

CMD ["node", "apps/customer-order/server.js"]
