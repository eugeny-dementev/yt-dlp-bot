# syntax=docker/dockerfile:1

FROM bitnami/node AS build

WORKDIR /usr/src/app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.yarn to speed up subsequent builds.
# Leverage a bind mounts to package.json and yarn.lock to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    --mount=type=cache,target=/root/.yarn \
    yarn

COPY . .

RUN yarn compile
# Now /usr/src/app/built has the built files.

# Second stage: run things.
FROM utils/dl
WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    --mount=type=cache,target=/root/.yarn \
    yarn install --production

# Copy the built tree from the first stage.
COPY --from=build /usr/src/app/built .
COPY --from=build /usr/src/app/package.json .

# Run the application.
CMD node --enable-source-maps server.js
