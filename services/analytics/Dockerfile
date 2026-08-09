FROM node:22.23.1-alpine3.23

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node server.mjs dau-analytics.mjs ./

USER node

EXPOSE 8081

CMD ["node", "server.mjs"]
