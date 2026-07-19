# Infrastructure

Deployment and infrastructure notes for the restaurant management system.

Current production service:

- E-paper hub: `https://epaper-hub.yeyintlwin.com`
- Host: AWS Lightsail Ubuntu
- Runtime: Docker Compose

The deployed e-paper hub folder should contain only `docker-compose.yml` and optional `config/`. Runtime secrets stay in `~/epaper-emulator.env`.
