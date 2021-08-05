#!/bin/bash
FQDN='localhost'

# make directories to work from
mkdir -p {server,client,ca,tmp}

# Create your very own Root Certificate Authority
openssl genrsa \
  -out ca/my-root-ca.key.pem \
  2048

# Self-sign your Root Certificate Authority
# Since this is private, the details can be as bogus as you like
openssl req \
  -sha256 \
  -x509 \
  -new \
  -nodes \
  -key ca/my-root-ca.key.pem \
  -days 3650 \
  -out ca/my-root-ca.crt.pem \
  -subj "/C=US/ST=Utah/L=Provo/O=Internal Signing Authority/CN=${FQDN}"

# Create a Device Certificate for each domain,
# such as example.com, *.example.com, awesome.example.com
# NOTE: You MUST match CN to the domain name or ip address you want to use
openssl genrsa \
  -out server/privkey.pem \
  2048

# Create a request from your Device, which your Root CA will sign
openssl req -new \
  -sha256 \
  -key server/privkey.pem \
  -out tmp/csr.pem \
  -subj "/C=US/ST=Utah/L=Provo/O=ACME Tech Inc/CN=${FQDN}"

# Sign the request from Device with your Root CA
# -CAserial ca/my-root-ca.srl
openssl x509 \
  -sha256 \
  -req -in tmp/csr.pem \
  -CA ca/my-root-ca.crt.pem \
  -CAkey ca/my-root-ca.key.pem \
  -CAcreateserial \
  -out server/cert.pem \
  -days 3650

# Create a public key, for funzies
# see https://gist.github.com/coolaj86/f6f36efce2821dfb046d
openssl rsa \
  -in server/privkey.pem \
  -pubout -out client/pubkey.pem

# Put things in their proper place
rsync -a ca/my-root-ca.crt.pem server/chain.pem
rsync -a ca/my-root-ca.crt.pem client/chain.pem
cat server/cert.pem server/chain.pem > server/fullchain.pem
