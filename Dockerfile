# The hosted app (app.q1st.io): Next's standalone server in a small Node image. Built on the server from the repo.
# AUTH_MODE, ENGINE_MODE and TWO_FACTOR are read when the app is built as well as at runtime, so they're fixed here
# for the hosted app; everything secret comes from the settings file at runtime, never into the image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --reporter=silent
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone AUTH_MODE=password ENGINE_MODE=live TWO_FACTOR=off
RUN pnpm build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 AUTH_MODE=password ENGINE_MODE=live TWO_FACTOR=off
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The app creates and updates its tables from these on first use (src/lib/db/postgres.ts).
COPY --from=build --chown=node:node /app/drizzle ./drizzle
ARG REVISION=unknown
RUN echo "$REVISION" > /app/REVISION && find /app -name ".env*" -delete
USER node
CMD ["node", "server.js"]
