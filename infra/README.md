# Infrastructure

Deployment and infrastructure notes for the restaurant management system.

Current production service:

- E-paper hub: `https://epaper-hub.yeyintlwin.com`
- Host: AWS Lightsail Ubuntu
- Runtime: Docker Compose

The deployed project folder is `~/restaurant-order-system`. It should contain only `docker-compose.yml` and optional `config/`. Runtime secrets stay in `~/restaurant-order-system.env`.
