# Fase 9 — Proveedores, compras y recepción de mercadería

## Objetivo

Incorporar el ciclo de abastecimiento al flujo transaccional de ComercioBI:

```text
Proveedor → Compra en borrador → Confirmación → Entrada de stock → Kardex
```

La fase reutiliza:

- Empresas, perfiles, membresías y roles de las fases 3 y 4.
- Productos y categorías de la Fase 6.
- Existencias y Kardex de las fases 7 y 8.
- React, rutas protegidas y contexto empresarial de la Fase 5.

## Alcance

- CRUD lógico de proveedores.
- Compras en estado BORRADOR, CONFIRMADA y ANULADA.
- Detalle de productos, cantidades, costos y descuentos.
- Cálculo de subtotal, IGV y total en PostgreSQL.
- Confirmación transaccional con entrada de stock.
- Anulación controlada con reversa de stock.
- Integración con el Kardex y el Dashboard.
- RLS multiempresa y permisos por rol.

## Roles

| Acción | ADMIN | ALMACEN | GERENTE | ANALISTA |
|---|---:|---:|---:|---:|
| Consultar proveedores y compras | Sí | Sí | Sí | Sí |
| Crear o editar proveedor | Sí | Sí | No | No |
| Crear, editar o confirmar compra | Sí | Sí | No | No |
| Eliminar borrador | Sí | Sí | No | No |
| Anular compra confirmada | Sí | No | No | No |

## Archivos

```text
database/
├── migrations/
│   └── 011_compras_proveedores.sql
└── tests/
    └── 007_verificaciones_compras.sql

docs/
└── FASE_9_INSTRUCCIONES.md

src/
├── App.tsx
├── index.css
├── components/
│   ├── MovementTypeBadge.tsx
│   └── PurchaseStatusBadge.tsx
├── layouts/
│   └── AppLayout.tsx
├── lib/
│   └── purchases-utils.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── InventoryPage.tsx
│   ├── PurchasesPage.tsx
│   └── SuppliersPage.tsx
└── types/
    ├── inventory.ts
    └── purchases.ts
```

## Orden de ejecución

1. Verificar que Git esté limpio.
2. Detener Vite.
3. Respaldar los archivos que serán reemplazados.
4. Extraer el paquete en `C:\Proyectos\comerciabi`.
5. Ejecutar `011_compras_proveedores.sql` en Supabase.
6. Verificar tablas, funciones, RLS y el nuevo valor de Kardex.
7. Iniciar Vite.
8. Crear un proveedor.
9. Crear y editar una compra en borrador.
10. Confirmar la compra y comprobar el aumento de stock.
11. Verificar la entrada en el Kardex.
12. Anular la compra como administrador y comprobar la reversa.
13. Probar permisos de solo lectura.
14. Ejecutar `007_verificaciones_compras.sql`.
15. Ejecutar `npm run build` y `npm run lint`.
16. Crear el commit.

## Commit sugerido

```powershell
git commit -m "feat: implementar proveedores compras y recepcion de stock"
```
