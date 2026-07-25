# Modelo lógico de datos de ComercioBI

## 1. Tipo de modelo

ComercioBI utilizará inicialmente un modelo transaccional normalizado para registrar las operaciones del sistema.

Posteriormente se construirá un modelo dimensional separado para Power BI.

## 2. Entidades principales

### empresas

Representa cada organización que utiliza ComercioBI.

Aunque el MVP tendrá una empresa de demostración, esta entidad permitirá preparar la aplicación para un futuro funcionamiento multiempresa.

### perfiles

Contiene la información pública del usuario autenticado.

El identificador del perfil corresponderá al identificador del usuario creado en Supabase Auth.

No se almacenarán contraseñas en esta tabla.

### usuarios_empresa

Relaciona los perfiles con las empresas.

Permite que una persona pertenezca a una o varias empresas y tenga un rol diferente en cada una.

### clientes

Contiene las personas o empresas que realizan compras.

### categorias

Organiza los productos en grupos comerciales.

### productos

Contiene la información comercial de los productos.

El producto no almacenará directamente el stock, porque el stock depende del almacén.

### almacenes

Representa los lugares donde se mantienen existencias.

El MVP tendrá un almacén principal.

### existencias_producto

Mantiene el saldo actual y el stock mínimo de cada producto en cada almacén.

La combinación producto-almacén será única.

### canales_venta

Representa el origen de una venta, por ejemplo tienda, web, teléfono o corporativo.

### ventas

Representa la cabecera de una operación comercial.

Contiene cliente, vendedor, almacén, canal, fecha, estado y totales.

### detalle_venta

Contiene los productos incluidos en una venta.

Guarda cantidad, precio, costo y descuento históricos.

### movimientos_inventario

Registra cada entrada, salida, ajuste o reversa de inventario.

Es la fuente de trazabilidad del stock.

### cargas_archivo

Registra cada intento de importación de Excel o CSV.

### errores_carga

Registra los errores detectados en las filas de una importación.

## 3. Relaciones principales

- Una empresa tiene muchos usuarios asociados.
- Un perfil puede pertenecer a varias empresas.
- Una empresa tiene muchos clientes.
- Una empresa tiene muchas categorías.
- Una categoría tiene muchos productos.
- Una empresa tiene muchos almacenes.
- Un almacén tiene muchas existencias de productos.
- Un producto puede tener existencias en varios almacenes.
- Una empresa tiene muchos canales de venta.
- Un cliente puede realizar muchas ventas.
- Un usuario de empresa puede registrar muchas ventas.
- Una venta pertenece a un almacén.
- Una venta contiene uno o varios detalles.
- Un producto puede aparecer en muchos detalles de venta.
- Una venta confirmada puede generar varios movimientos de inventario.
- Un producto puede tener muchos movimientos de inventario.
- Una carga de archivo puede tener muchos errores.

## 4. Decisión sobre el stock

El stock se controlará mediante dos componentes:

1. `existencias_producto.stock_actual`, utilizado para consultas operativas rápidas.
2. `movimientos_inventario`, utilizado como historial y trazabilidad.

El stock actual no será modificado libremente desde la aplicación.

Solo podrá cambiar mediante operaciones controladas de base de datos que también generen un movimiento.

## 5. Decisión sobre precios y costos históricos

El detalle de venta guardará el precio y costo aplicados en el momento de la operación.

Esto es necesario porque el precio y costo del producto pueden cambiar posteriormente.

Los reportes históricos utilizarán los valores guardados en el detalle de venta y no los valores actuales del producto.

## 6. Decisión sobre eliminación

Se utilizará desactivación lógica para:

- Clientes.
- Productos.
- Categorías.
- Usuarios de empresa.
- Canales.
- Almacenes.

No se eliminarán físicamente:

- Ventas confirmadas.
- Ventas anuladas.
- Detalles de ventas confirmadas.
- Movimientos de inventario.
- Historial de importaciones.

## 7. Estados de una venta

### BORRADOR

La venta puede editarse y todavía no afecta el inventario.

### CONFIRMADA

La venta fue validada y descontó inventario.

### ANULADA

La venta fue revertida y no forma parte de las ventas efectivas.

## 8. Estados de una importación

- PENDIENTE.
- VALIDANDO.
- CON_ERRORES.
- COMPLETADA.
- CANCELADA.

## 9. Convenciones de nombres

- Los nombres estarán en español.
- Las tablas se escribirán en plural.
- Se utilizará snake_case.
- Las claves primarias se llamarán `id`.
- Las claves foráneas terminarán en `_id`.
- Las fechas de auditoría terminarán en `_at`.
- Los campos booleanos utilizarán nombres como `activo`.
- Los nombres no incluirán tildes ni espacios.

## 10. Tipos de datos generales

- Identificadores: UUID.
- Importes: NUMERIC.
- Cantidades: NUMERIC.
- Textos cortos: VARCHAR o TEXT.
- Fechas con hora: TIMESTAMPTZ.
- Fechas sin hora: DATE.
- Estados: TEXT con restricciones o tipos enumerados.
- Indicadores lógicos: BOOLEAN.

No se utilizará FLOAT para importes monetarios.