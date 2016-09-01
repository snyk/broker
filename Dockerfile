FROM node:6-slim

# File Author / Maintainer
MAINTAINER Snyk Ltd

RUN mkdir -p /srv/app
WORKDIR /srv/app

# Prepare and complete `npm install`
####################################
ADD package.json .
RUN npm install --production;


# Copy the app
##############
ADD . .

# Configure the port
####################
ENV PORT=5000
EXPOSE 5000

# Start the Snyk server
#######################
CMD ["npm", "start"]
