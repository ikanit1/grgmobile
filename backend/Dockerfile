FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Копируем исходники и собираем
COPY tsconfig*.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN npm install --save-dev typescript @nestjs/cli tsconfig-paths && \
    npx tsc -p tsconfig.json && \
    npm uninstall typescript @nestjs/cli tsconfig-paths

EXPOSE 3000

CMD ["node", "dist/main.js"]
