# Fase 4 — Autenticación, usuarios, roles y RLS

## Archivos nuevos

Ejecutar en este orden:

1. `database/migrations/006_auth_perfiles.sql`
2. `database/migrations/007_funciones_autorizacion.sql`
3. `database/migrations/008_grants_politicas_rls.sql`

Después:

4. Crear usuarios desde `Authentication > Users`.
5. Copiar al SQL Editor y adaptar:
   - `database/seeds/002_asignar_admin_template.sql`
   - `database/seeds/003_asignar_vendedor_template.sql`
6. Ejecutar:
   - `database/tests/002_verificaciones_auth_rls.sql`
   - bloques seleccionados de `database/tests/003_pruebas_rls_template.sql`

## Seguridad

- No guardar contraseñas en el repositorio.
- No guardar la secret key o service role key en el frontend.
- No editar los archivos plantilla con correos reales; reemplazar los datos únicamente en el SQL Editor.
- No desactivar RLS para resolver errores.
