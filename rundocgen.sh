# start ./runllama.sh on previous dir
# start ./rundockermcpgateway.sh on previous dir
# update .env with this new token MCP_GATEWAY_AUTH_TOKEN=...
# then run this one below
docker compose up -d --force-recreate --build