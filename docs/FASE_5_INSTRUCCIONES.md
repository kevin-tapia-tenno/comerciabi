# Fase 5 — React, Supabase, login y navegación

## Dependencias

```bash
npm install @supabase/supabase-js react-router
```

## Variables locales

1. Copiar `.env.example` como `.env.local`.
2. Reemplazar la URL y la publishable key.
3. Nunca colocar secret key, service role key ni contraseña de base de datos.
4. Reiniciar `npm run dev` después de modificar `.env.local`.

## Archivos

La carpeta `src` de este paquete reemplaza la pantalla inicial de Vite.

## Comprobaciones

```bash
npm run dev
npm run build
npm run lint
```

Resultados funcionales esperados:

- `/login` muestra el formulario.
- El administrador inicia sesión.
- El dashboard muestra 8 productos, 1 cliente, 4 categorías y 1 almacén.
- Cerrar sesión redirige a `/login`.
- Un vendedor ve un menú reducido.
- Un usuario sin membresía ve el mensaje de acceso no configurado.
- Escribir una ruta inexistente muestra la página 404.
