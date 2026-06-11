FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["npm", "start"]
