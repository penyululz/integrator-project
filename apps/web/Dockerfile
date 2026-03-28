FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json* tsconfig.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/web apps/web

RUN npm run build -w @integration/web

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@integration/web", "--", "--host", "0.0.0.0", "--port", "3000"]

