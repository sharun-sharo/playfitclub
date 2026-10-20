FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/realtime/package.json apps/realtime/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/game/package.json packages/game/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma
RUN npm ci
COPY packages packages
COPY apps/realtime apps/realtime
RUN npm run db:generate
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@fitplay/realtime"]
