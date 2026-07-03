# Scope — Wallet Health & Story ASP. Runs the persistent HTTP server plus the
# onchainos CLI it shells out to for on-chain data (Path B: CLI on Railway,
# authenticated in AK mode at boot).
FROM node:24-slim

# onchainos CLI, Linux glibc build, pinned to the version proven locally.
# Checksum-verified against the release's checksums.txt.
ARG ONCHAINOS_TAG=v4.0.1
ARG ONCHAINOS_ASSET=onchainos-x86_64-unknown-linux-gnu
ARG ONCHAINOS_BASE=https://github.com/okx/onchainos-skills/releases/download
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL "${ONCHAINOS_BASE}/${ONCHAINOS_TAG}/${ONCHAINOS_ASSET}" -o /usr/local/bin/onchainos \
 && curl -fsSL "${ONCHAINOS_BASE}/${ONCHAINOS_TAG}/checksums.txt" -o /tmp/checksums.txt \
 && grep "${ONCHAINOS_ASSET}" /tmp/checksums.txt | awk '{print $1"  /usr/local/bin/onchainos"}' | sha256sum -c - \
 && chmod +x /usr/local/bin/onchainos \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/checksums.txt

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
# Point transport.ts at the CLI we installed above.
ENV ONCHAINOS_BIN=/usr/local/bin/onchainos
# Railway sets PORT; default for local `docker run`.
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
