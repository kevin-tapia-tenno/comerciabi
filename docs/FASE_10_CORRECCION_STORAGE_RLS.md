# Fase 10 — Corrección de Storage RLS

## Error corregido

Al presionar **Ejecutar carga**, la aplicación mostraba:

```text
No se pudo subir el archivo al almacenamiento privado:
new row violates row-level security policy
```

La carga quedaba como `CANCELADA` porque React sí podía crear el registro en
`cargas_archivo`, pero Supabase Storage rechazaba el `INSERT` del objeto.

## Causa

La ruta usada por React es:

```text
empresa_id/carga_id/archivo.xlsx
```

La empresa demo tiene este identificador:

```text
00000000-0000-0000-0000-000000000001
```

La política anterior aceptaba únicamente UUID con una versión RFC entre 1 y 5
y una variante concreta. El UUID fijo del seed es válido para PostgreSQL, pero
no cumplía esa expresión regular. Por ello fallaban tanto `INSERT` como
`SELECT` en `storage.objects`.

## Aplicación

1. Abrir Supabase → **SQL Editor**.
2. Crear una consulta nueva.
3. Copiar todo `database/migrations/015_corregir_storage_rls_uuid_semilla.sql`.
4. Presionar **Run**.
5. Ejecutar `database/tests/009_verificaciones_storage_cargas.sql`.
6. Volver a la aplicación, pulsar **Limpiar**, analizar nuevamente el archivo y
   ejecutar la carga.

No es necesario modificar React, reinstalar dependencias ni reiniciar Supabase.

## Resultado esperado

- El archivo se sube al bucket privado `archivos-carga`.
- La carga termina como `COMPLETADA` o `CON_ERRORES`, según sus filas.
- `ruta_archivo` deja de ser nula.
- El botón **Descargar** queda habilitado.
- La carga cancelada anterior puede conservarse como evidencia del intento
  fallido; no afecta a las siguientes pruebas.
