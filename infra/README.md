# Infrastructure

Deployment and infrastructure notes for the restaurant management system.

Production services:

- E-paper hub: `https://epaper-hub.yeyintlwin.com`
- Customer ordering: `https://order.yeyintlwin.com`
- Host: AWS Lightsail Ubuntu
- Runtime: Docker Compose

The deployed project folder is `~/restaurant-order-system`. It should contain only `docker-compose.yml` and optional `config/`. Runtime secrets stay in `~/restaurant-order-system.env`.

Docker publishes the hub at `127.0.0.1:3000` and customer ordering at `127.0.0.1:3100`; Nginx terminates HTTPS for both subdomains. Inside Compose, customer ordering uses `EPAPER_HUB_URL=http://epaper-hub:3000`. On every customer-order startup, tables 1 through 12 are reset to `WELCOME` before port 3100 begins accepting traffic.
