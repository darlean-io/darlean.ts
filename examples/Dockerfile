FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.* ./
COPY src/oracle/ ./src/oracle/

RUN npm install

copy . .

CMD [ "node", "./lib/oracle/7_exposure_is_everything/server.js" ]

EXPOSE 8080