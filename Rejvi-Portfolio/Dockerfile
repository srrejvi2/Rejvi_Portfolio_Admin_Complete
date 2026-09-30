FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
