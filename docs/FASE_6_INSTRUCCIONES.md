# Fase 6 — CRUD de clientes, productos y categorías

## Alcance

- Clientes: listar, buscar, filtrar, crear, editar, desactivar y reactivar.
- Productos: listar, buscar, filtrar, crear, editar, desactivar y reactivar.
- Categorías: listar, crear, editar, desactivar y reactivar.
- Paginación de 10 registros.
- Mensajes de validación y duplicados.
- Permisos por rol:
  - ADMIN: administra clientes, productos y categorías.
  - VENDEDOR: administra clientes y consulta el catálogo.
  - ANALISTA: administra clientes y consulta el catálogo.
  - GERENTE y ALMACEN: consultan el catálogo.

## Instalación

No requiere nuevas dependencias ni migraciones.

1. Extraer el ZIP dentro de `C:\Proyectos\comerciabi`.
2. Reemplazar los archivos existentes cuando Windows lo solicite.
3. Ejecutar `npm run dev`.
4. Probar primero con ADMIN y después con VENDEDOR.

## Comandos finales

```powershell
npm run build
npm run lint
git status
git add .
git commit -m "feat: implementar gestion de clientes productos y categorias"
git status
git log --oneline -6
```
