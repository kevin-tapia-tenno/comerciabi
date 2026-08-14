# Fase 14.14D - Despliegue productivo de ComercioBI

## Objetivo

Desplegar ComercioBI en Vercel con una arquitectura full-stack que permita servir:

- Frontend React + Vite.
- Backend FastAPI.
- Autenticación mediante Supabase Auth.
- Aislamiento multiempresa.
- Serving layer de analítica e inteligencia artificial.
- PostgreSQL mediante Supavisor Transaction Pooler.
- Acceso a base de datos mediante un rol PostgreSQL restringido.

---

## Arquitectura desplegada

```text
Internet
   |
   v
https://comerciabi.vercel.app
   |
   v
Vercel Services
   |
   +---------------------------+
   |                           |
   v                           v
Frontend                    Backend
React + Vite                FastAPI
   |                           |
React Router                  |
                               v
                         Supabase Auth
                               |
                               v
                         JWT + Tenant
                               |
                               v
                         Supavisor :6543
                               |
                               v
                         comerciabi_api
                               |
                               v
                      Analytics Serving Layer