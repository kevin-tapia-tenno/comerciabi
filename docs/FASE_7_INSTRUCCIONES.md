# ComercioBI — Fase 7: ventas transaccionales

## Objetivo

Implementar el módulo de ventas sobre la arquitectura construida en las fases anteriores:

- React + TypeScript + Vite.
- Supabase Auth.
- PostgreSQL con RLS multiempresa.
- Roles ADMIN, GERENTE y VENDEDOR.
- Catálogo y clientes de la Fase 6.
- Ventas, detalle de venta, existencias y movimientos creados en la Fase 3.

La Fase 7 no sustituye la futura Fase 8. En esta fase el stock cambia únicamente al confirmar o anular una venta. La administración manual de existencias, ajustes, kardex y alertas se realizará en la Fase 8.

## Entregables

1. Migración `009_operaciones_ventas.sql`.
2. Seed idempotente de stock de demostración.
3. Pruebas SQL de consistencia.
4. Página React de ventas.
5. Registro de borradores con múltiples productos.
6. Cálculo de subtotal, descuento, IGV y total.
7. Confirmación transaccional con descuento de stock.
8. Anulación por ADMIN con devolución de stock.
9. Consulta gerencial de solo lectura.
10. Indicadores de ventas en el dashboard.

## Orden de instalación

1. Copiar los archivos del ZIP en la raíz de `C:\Proyectos\comerciabi`.
2. Ejecutar en Supabase `database/migrations/009_operaciones_ventas.sql`.
3. Ejecutar en Supabase `database/seeds/004_stock_demo_fase7.sql`.
4. Reiniciar Vite.
5. Probar el flujo funcional.
6. Ejecutar `database/tests/005_verificaciones_ventas.sql`.
7. Ejecutar build y lint.
8. Crear el commit de la fase.

## Reglas empresariales implementadas

- ADMIN y VENDEDOR pueden crear ventas.
- GERENTE solo consulta ventas.
- El vendedor solamente edita, confirma o elimina sus propios borradores.
- El ADMIN puede administrar cualquier borrador.
- Solo el ADMIN puede anular una venta confirmada.
- Una venta debe contener al menos un producto.
- No se permite repetir el mismo producto dentro de una venta.
- Cantidad mayor que cero.
- Precio mayor o igual que cero.
- Descuento entre cero y el subtotal de la línea.
- El costo unitario se captura desde el catálogo al guardar.
- Los totales definitivos se calculan en PostgreSQL mediante los triggers ya creados.
- La confirmación bloquea las existencias involucradas y verifica el stock.
- Si un producto no tiene stock suficiente, toda la confirmación se revierte.
- La anulación genera movimientos REVERSA y devuelve el stock.
- Las ventas confirmadas y anuladas no pueden editarse.
- Los borradores sí pueden eliminarse; el detalle se elimina en cascada.

## Stock de demostración

El seed carga stock únicamente a los ocho productos iniciales de la Fase 3. Los productos creados posteriormente, incluido `Producto Demo Fase 6`, reciben una existencia con stock cero.

Esto permite dos pruebas:

- Confirmación exitosa usando un producto inicial.
- Confirmación rechazada por stock insuficiente usando un producto nuevo con stock cero.

## Prueba principal como ADMIN

1. Iniciar sesión como ADMIN.
2. Entrar a Ventas.
3. Crear una venta para `Público general`.
4. Seleccionar `Almacén principal` y canal `Tienda`.
5. Agregar:
   - Papel bond A4: cantidad 2.
   - Lapicero azul: cantidad 5.
6. Guardar borrador.
7. Editar el borrador y cambiar una cantidad.
8. Confirmar la venta.
9. Comprobar que el estado cambia a CONFIRMADA.
10. Revisar el dashboard.
11. Anular la venta con un motivo.
12. Comprobar que el estado cambia a ANULADA y el stock se devuelve.

## Prueba de stock insuficiente

1. Crear un borrador con `Producto Demo Fase 6`.
2. Guardarlo.
3. Intentar confirmarlo.
4. Debe aparecer un mensaje de stock insuficiente o no configurado.
5. La venta debe permanecer en BORRADOR.
6. No debe generarse ningún movimiento de inventario.

## Prueba como VENDEDOR

1. Iniciar sesión como VENDEDOR.
2. Crear y confirmar una venta propia.
3. Comprobar que puede editar sus borradores.
4. Comprobar que no aparece la acción Anular en ventas confirmadas.
5. Comprobar que no puede editar borradores creados por otro vendedor o por el ADMIN.

## Prueba como GERENTE

1. Iniciar sesión como GERENTE cuando exista ese usuario.
2. Entrar a Ventas.
3. Comprobar que puede buscar, filtrar y ver detalles.
4. No debe aparecer el botón Nueva venta.
5. No deben aparecer Editar, Confirmar, Eliminar ni Anular.

## Verificaciones finales

```powershell
npm run build
npm run lint
git status
```

Después del commit:

```powershell
git status
git log --oneline -7
```

Resultado esperado:

```text
On branch main
nothing to commit, working tree clean
```

Commit recomendado:

```powershell
git commit -m "feat: implementar ventas transaccionales y control de stock"
```
