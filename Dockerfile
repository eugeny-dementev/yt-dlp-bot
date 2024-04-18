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
FROM bitnami/node
WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    --mount=type=cache,target=/root/.yarn \
    yarn install --production

# Copy the built tree from the first stage.
COPY --from=build /usr/src/app/built .
COPY --from=build /usr/src/app/package.json .

ADD --chmod=755 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp /usr/bin

RUN apt update
RUN apt install dirmngr software-properties-common apt-transport-https curl lsb-release ca-certificates -y
RUN gpg --list-keys
RUN gpg --no-default-keyring --keyring /usr/share/keyrings/deb-multimedia.gpg --keyserver keyserver.ubuntu.com --recv-keys 5C808C2B65558117
RUN echo "deb [signed-by=/usr/share/keyrings/deb-multimedia.gpg] https://www.deb-multimedia.org $(lsb_release -sc) main non-free" | tee /etc/apt/sources.list.d/deb-multimedia.list
RUN apt update
RUN apt install -y ffmpeg

# Run the application.
CMD node --enable-source-maps server.js
