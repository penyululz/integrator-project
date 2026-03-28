FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json* tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/adapters/webhook/package.json packages/adapters/webhook/package.json
COPY packages/adapters/sheets/package.json packages/adapters/sheets/package.json
COPY packages/adapters/email/package.json packages/adapters/email/package.json
COPY packages/adapters/shopify/package.json packages/adapters/shopify/package.json
COPY packages/adapters/slack/package.json packages/adapters/slack/package.json
COPY packages/adapters/http-api/package.json packages/adapters/http-api/package.json
COPY packages/adapters/scheduler/package.json packages/adapters/scheduler/package.json

RUN npm install

COPY . .

RUN npm run build -w @integration/shared \
  && npm run build -w @integration/adapter-webhook \
  && npm run build -w @integration/adapter-sheets \
  && npm run build -w @integration/adapter-email \
  && npm run build -w @integration/adapter-shopify \
  && npm run build -w @integration/adapter-slack \
  && npm run build -w @integration/core \
  && npm run build -w @integration/api

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@integration/api"]

