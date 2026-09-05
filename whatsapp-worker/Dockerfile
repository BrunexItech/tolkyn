FROM node:20-slim

WORKDIR /app

RUN groupadd --system --gid 1001 wa && useradd --system --uid 1001 --gid wa wa

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

RUN mkdir -p /app/sessions && chown -R wa:wa /app

USER wa

ENV PORT=4001 SESSIONS_DIR=/app/sessions

EXPOSE 4001

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:4001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
