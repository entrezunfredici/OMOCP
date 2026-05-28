FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 py3-pip
COPY package.json .
RUN npm install --omit=dev
COPY index.mjs .
COPY config.mjs .
COPY sdk_odoo_config_bridge.mjs .
COPY sdk_providers_bridge.mjs .
COPY helpers/ helpers/
COPY routes/ routes/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
ARG OPENCLAW_UID=1500
ARG OPENCLAW_GID=1500
USER root
RUN if [ "${OPENCLAW_UID}" != "1000" ] || [ "${OPENCLAW_GID}" != "1000" ]; then \
      sed -i "s/^\(node:x:\)1000:1000:/\1${OPENCLAW_UID}:${OPENCLAW_GID}:/" /etc/passwd \
      && sed -i "s/^\(node:x:\)1000:/\1${OPENCLAW_GID}:/" /etc/group \
      && chown -R ${OPENCLAW_UID}:${OPENCLAW_GID} /home/node /app 2>/dev/null || true; \
    fi
USER node
EXPOSE 3099
CMD ["sh", "entrypoint.sh"]
