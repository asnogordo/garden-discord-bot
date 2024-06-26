FROM node:alpine

WORKDIR /app

COPY package*.json ./
COPY yarn.lock ./

RUN yarn

COPY . /app

CMD [ "yarn", "start" ]