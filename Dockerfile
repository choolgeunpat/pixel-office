FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY kit ./kit
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0
EXPOSE 8787
RUN mkdir -p /data && chown node /data
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server/index.mjs"]
