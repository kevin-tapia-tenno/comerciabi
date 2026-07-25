# Base de datos de ComercioBI

Esta carpeta contiene la implementación versionada de PostgreSQL para Supabase.

## Estructura

```text
database/
├── migrations/
│   ├── 001_tipos_enumerados.sql
│   ├── 002_tablas.sql
│   ├── 003_funciones_triggers.sql
│   ├── 004_indices.sql
│   └── 005_habilitar_rls.sql
├── seeds/
│   └── 001_datos_demo.sql
└── tests/
    └── 001_verificaciones.sql
```

## Orden de ejecución

Ejecutar en el SQL Editor de Supabase:

1. `migrations/001_tipos_enumerados.sql`
2. `migrations/002_tablas.sql`
3. `migrations/003_funciones_triggers.sql`
4. `migrations/004_indices.sql`
5. `migrations/005_habilitar_rls.sql`
6. `seeds/001_datos_demo.sql`
7. `tests/001_verificaciones.sql`

## Reglas

- No ejecutar una migración posterior si la anterior devuelve un error.
- Las migraciones están diseñadas para una base nueva.
- Los datos de demostración sí pueden ejecutarse de nuevo.
- No almacenar contraseñas, cadenas de conexión ni claves secretas en esta carpeta.
- RLS queda habilitado sin políticas durante la Fase 3. El acceso desde el frontend se configurará en la fase de autenticación y seguridad.
