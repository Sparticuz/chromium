# Reproduction image: the real Lambda base image plus the published layer's
# Chromium binaries. run.sh mounts the locally built package over the layer's
# JavaScript, so `args` comes from source/ rather than from the release.
FROM public.ecr.aws/lambda/nodejs:24

WORKDIR /var/task

# puppeteer-core only; the browser binary comes from the layer.
RUN npm init -y > /dev/null && npm install --no-audit --no-fund puppeteer-core@25.0.4

# The unpacked contents of chromium-<version>-layer.arm64.zip, i.e. ./layer/nodejs/node_modules/...
COPY layer/ /opt/

# NODE_PATH covers require(); the symlink covers ESM import, which ignores NODE_PATH.
ENV NODE_PATH=/opt/nodejs/node_modules
RUN ln -s /opt/nodejs/node_modules/@sparticuz /var/task/node_modules/@sparticuz

COPY repro.mjs report.mjs /var/task/

ENTRYPOINT ["node", "/var/task/repro.mjs"]
