# Fase 8 — Inventario, stock mínimo y Kardex

## Objetivo

Convertir el módulo provisional de Inventario en un módulo operativo conectado con las estructuras construidas en las fases anteriores.

La fase utiliza:

- `productos` y `categorias` de la Fase 6.
- `almacenes`, `existencias_producto` y `movimientos_inventario` de la Fase 3.
- Auth, roles y RLS de la Fase 4.
- React, navegación y contexto empresarial de la Fase 5.
- Movimientos `SALIDA` y `REVERSA` generados por las ventas de la Fase 7.

## Alcance

- Consulta de existencias por producto y almacén.
- Indicadores de stock normal, crítico y agotado.
- Valorización al costo.
- Configuración de stock mínimo.
- Entradas manuales.
- Ajustes positivos y negativos.
- Validación para impedir stock negativo.
- Kardex con filtros y paginación.
- Seguridad por rol.

## Roles

| Acción | ADMIN | ALMACEN | GERENTE |
|---|---:|---:|---:|
| Consultar existencias | Sí | Sí | Sí |
| Consultar Kardex | Sí | Sí | Sí |
| Registrar entrada | Sí | Sí | No |
| Registrar ajuste positivo | Sí | Sí | No |
| Registrar ajuste negativo | Sí | Sí | No |
| Actualizar stock mínimo | Sí | Sí | No |

`SALIDA` y `REVERSA` no se registran manualmente: continúan siendo generadas por la confirmación y anulación de ventas.

## Archivos

```text
database/
├── migrations/
│   └── 010_operaciones_inventario.sql
└── tests/
    └── 006_verificaciones_inventario.sql

docs/
└── FASE_8_INSTRUCCIONES.md

src/
├── App.tsx
├── index.css
├── components/
│   ├── InventoryStatusBadge.tsx
│   └── MovementTypeBadge.tsx
├── lib/
│   └── inventory-utils.ts
├── pages/
│   ├── DashboardPage.tsx
│   └── InventoryPage.tsx
└── types/
    └── inventory.ts
```

## Orden de ejecución

1. Verificar que Git esté limpio.
2. Detener Vite.
3. Extraer el paquete en la raíz de `C:\Proyectos\comerciabi`.
4. Ejecutar `010_operaciones_inventario.sql` en Supabase.
5. Verificar que existan las funciones `registrar_movimiento_inventario` y `actualizar_stock_minimo`.
6. Iniciar Vite.
7. Probar existencias y Kardex como administrador.
8. Registrar una entrada.
9. Registrar un ajuste positivo.
10. Registrar un ajuste negativo válido.
11. Intentar un ajuste que deje stock negativo y confirmar que sea rechazado.
12. Actualizar un stock mínimo y comprobar la alerta.
13. Probar el acceso de solo lectura como gerente cuando exista ese usuario.
14. Ejecutar `006_verificaciones_inventario.sql`.
15. Ejecutar `npm run build` y `npm run lint`.
16. Crear el commit.

## Commit sugerido

```powershell
git commit -m "feat: implementar inventario kardex y alertas de stock"
```
