# Diccionario de datos de ComercioBI

## 1. Convenciones generales

El modelo utilizará las siguientes convenciones:

- Los identificadores principales serán de tipo `UUID`.
- Las claves primarias se llamarán `id`.
- Las claves foráneas terminarán en `_id`.
- Los importes monetarios utilizarán `NUMERIC(14,2)`.
- Las cantidades utilizarán `NUMERIC(14,3)`.
- Las fechas con hora utilizarán `TIMESTAMPTZ`.
- Los campos booleanos utilizarán valores `TRUE` o `FALSE`.
- Los nombres de tablas y columnas estarán escritos en minúsculas y con `snake_case`.
- Los registros maestros se desactivarán mediante el campo `activo`.
- Las operaciones históricas no se eliminarán físicamente.

## 2. Columnas de auditoría comunes

Varias tablas utilizarán las siguientes columnas:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador único del registro |
| creado_at | TIMESTAMPTZ | Sí | Fecha y hora de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha y hora de la última actualización |
| creado_por | UUID | No | Usuario responsable de crear el registro |
| actualizado_por | UUID | No | Usuario responsable de la última actualización |
| activo | BOOLEAN | Sí | Indica si el registro puede continuar utilizándose |

---

# 3. Tabla `empresas`

Representa las organizaciones que utilizan ComercioBI.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador único de la empresa |
| nombre | TEXT | Sí | Nombre comercial |
| razon_social | TEXT | No | Razón social registrada |
| ruc | VARCHAR(11) | No | Número de RUC |
| moneda | VARCHAR(3) | Sí | Código de moneda, inicialmente PEN |
| zona_horaria | TEXT | Sí | Zona horaria, inicialmente America/Lima |
| tasa_impuesto | NUMERIC(5,4) | Sí | Tasa de impuesto predeterminada |
| activo | BOOLEAN | Sí | Indica si la empresa está activa |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Restricciones

- `nombre` no puede estar vacío.
- `ruc` debe contener 11 caracteres cuando sea informado.
- `moneda` tendrá inicialmente el valor `PEN`.
- `zona_horaria` tendrá inicialmente el valor `America/Lima`.
- `tasa_impuesto` no puede ser negativa.
- El RUC no podrá repetirse cuando haya sido informado.

---

# 4. Tabla `perfiles`

Contiene la información adicional del usuario autenticado.

La contraseña y el correo de autenticación serán administrados por Supabase Auth.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador proveniente de Supabase Auth |
| nombres | TEXT | Sí | Nombres del usuario |
| apellidos | TEXT | Sí | Apellidos del usuario |
| telefono | TEXT | No | Número telefónico |
| avatar_url | TEXT | No | Dirección de la imagen de perfil |
| activo | BOOLEAN | Sí | Indica si el perfil está habilitado |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Restricciones

- `id` deberá corresponder a un usuario existente de Supabase Auth.
- `nombres` no puede estar vacío.
- `apellidos` no puede estar vacío.

---

# 5. Tabla `usuarios_empresa`

Relaciona usuarios con empresas y asigna un rol dentro de cada empresa.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador de la membresía |
| empresa_id | UUID | Sí | Empresa a la que pertenece el usuario |
| perfil_id | UUID | Sí | Perfil del usuario |
| rol | TEXT | Sí | Rol del usuario dentro de la empresa |
| activo | BOOLEAN | Sí | Indica si la membresía está habilitada |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Valores permitidos para `rol`

- `ADMIN`
- `GERENTE`
- `VENDEDOR`
- `ALMACEN`
- `ANALISTA`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `perfil_id` debe existir en `perfiles`.
- La combinación `empresa_id + perfil_id` debe ser única.
- Un usuario no podrá tener dos membresías diferentes dentro de la misma empresa.

---

# 6. Tabla `clientes`

Contiene las personas o empresas que realizan compras.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del cliente |
| empresa_id | UUID | Sí | Empresa propietaria del cliente |
| tipo_cliente | TEXT | Sí | Tipo de cliente |
| tipo_documento | TEXT | No | Tipo de documento |
| numero_documento | TEXT | No | Número de documento |
| nombre_completo | TEXT | Sí | Nombre o razón social visible |
| email | TEXT | No | Correo electrónico |
| telefono | TEXT | No | Número telefónico |
| segmento | TEXT | No | Segmento comercial |
| direccion | TEXT | No | Dirección |
| activo | BOOLEAN | Sí | Indica si puede utilizarse en nuevas ventas |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Valores permitidos para `tipo_cliente`

- `PERSONA`
- `EMPRESA`

## Valores iniciales para `tipo_documento`

- `DNI`
- `RUC`
- `CE`
- `PASAPORTE`
- `OTRO`

## Valores iniciales para `segmento`

- `MINORISTA`
- `CORPORATIVO`
- `MAYORISTA`
- `OTRO`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `nombre_completo` no puede estar vacío.
- La combinación `empresa_id + tipo_documento + numero_documento` debe ser única cuando el documento haya sido informado.
- Un cliente inactivo conservará su historial.
- Un cliente inactivo no podrá utilizarse en nuevas ventas.

---

# 7. Tabla `categorias`

Agrupa los productos según su tipo o familia comercial.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador de la categoría |
| empresa_id | UUID | Sí | Empresa propietaria |
| nombre | TEXT | Sí | Nombre de la categoría |
| descripcion | TEXT | No | Descripción de la categoría |
| activo | BOOLEAN | Sí | Indica si puede utilizarse |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `nombre` no puede estar vacío.
- La combinación `empresa_id + nombre` debe ser única.
- Una categoría utilizada por productos no deberá eliminarse físicamente.

---

# 8. Tabla `productos`

Contiene la información comercial de los productos.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del producto |
| empresa_id | UUID | Sí | Empresa propietaria |
| categoria_id | UUID | Sí | Categoría del producto |
| sku | TEXT | Sí | Código interno único |
| nombre | TEXT | Sí | Nombre comercial |
| descripcion | TEXT | No | Descripción |
| unidad_medida | TEXT | Sí | Unidad utilizada para controlar cantidades |
| costo_actual | NUMERIC(14,2) | Sí | Costo vigente |
| precio_venta | NUMERIC(14,2) | Sí | Precio de venta vigente |
| activo | BOOLEAN | Sí | Indica si puede utilizarse en nuevas ventas |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Valores permitidos para `unidad_medida`

- `UNIDAD`
- `CAJA`
- `PAQUETE`
- `KILOGRAMO`
- `LITRO`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `categoria_id` debe existir en `categorias`.
- `sku` no puede estar vacío.
- `nombre` no puede estar vacío.
- `costo_actual` debe ser mayor o igual a cero.
- `precio_venta` debe ser mayor o igual a cero.
- La combinación `empresa_id + sku` debe ser única.
- El producto no almacenará directamente su stock.
- Un producto inactivo conservará su historial.

---

# 9. Tabla `almacenes`

Representa los lugares físicos o lógicos donde se guardan existencias.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del almacén |
| empresa_id | UUID | Sí | Empresa propietaria |
| nombre | TEXT | Sí | Nombre del almacén |
| descripcion | TEXT | No | Descripción |
| es_principal | BOOLEAN | Sí | Indica si es el almacén principal |
| activo | BOOLEAN | Sí | Indica si puede utilizarse |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `nombre` no puede estar vacío.
- La combinación `empresa_id + nombre` debe ser única.
- Inicialmente existirá un solo almacén principal.
- Un almacén usado en ventas o movimientos no deberá eliminarse físicamente.

---

# 10. Tabla `existencias_producto`

Mantiene el stock actual de cada producto en cada almacén.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador de la existencia |
| almacen_id | UUID | Sí | Almacén |
| producto_id | UUID | Sí | Producto |
| stock_actual | NUMERIC(14,3) | Sí | Cantidad disponible |
| stock_minimo | NUMERIC(14,3) | Sí | Nivel mínimo para generar alertas |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de la última actualización |

## Restricciones

- `almacen_id` debe existir en `almacenes`.
- `producto_id` debe existir en `productos`.
- `stock_actual` debe ser mayor o igual a cero.
- `stock_minimo` debe ser mayor o igual a cero.
- La combinación `almacen_id + producto_id` debe ser única.
- El stock no podrá editarse directamente desde un formulario general.
- El stock cambiará únicamente mediante operaciones controladas.

---

# 11. Tabla `canales_venta`

Representa el medio por el cual se originó una venta.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del canal |
| empresa_id | UUID | Sí | Empresa propietaria |
| nombre | TEXT | Sí | Nombre del canal |
| descripcion | TEXT | No | Descripción |
| activo | BOOLEAN | Sí | Indica si puede utilizarse |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Canales iniciales

- `TIENDA`
- `WEB`
- `TELEFONO`
- `CORPORATIVO`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `nombre` no puede estar vacío.
- La combinación `empresa_id + nombre` debe ser única.

---

# 12. Tabla `ventas`

Representa la cabecera de una operación comercial.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador de la venta |
| empresa_id | UUID | Sí | Empresa propietaria |
| codigo | TEXT | Sí | Código comercial de la venta |
| cliente_id | UUID | Sí | Cliente |
| vendedor_empresa_id | UUID | Sí | Usuario que registra o atiende la venta |
| almacen_id | UUID | Sí | Almacén desde donde saldrá el producto |
| canal_venta_id | UUID | Sí | Canal de venta |
| fecha_venta | TIMESTAMPTZ | Sí | Fecha y hora de la operación |
| estado | TEXT | Sí | Estado actual de la venta |
| subtotal | NUMERIC(14,2) | Sí | Suma de subtotales antes de descuentos |
| descuento_total | NUMERIC(14,2) | Sí | Suma de descuentos |
| tasa_impuesto | NUMERIC(5,4) | Sí | Tasa de impuesto aplicada |
| impuesto_total | NUMERIC(14,2) | Sí | Importe total del impuesto |
| total | NUMERIC(14,2) | Sí | Importe final |
| moneda | VARCHAR(3) | Sí | Moneda utilizada |
| observaciones | TEXT | No | Comentarios adicionales |
| motivo_anulacion | TEXT | No | Motivo de la anulación |
| confirmada_at | TIMESTAMPTZ | No | Fecha de confirmación |
| confirmada_por | UUID | No | Usuario que confirmó |
| anulada_at | TIMESTAMPTZ | No | Fecha de anulación |
| anulada_por | UUID | No | Usuario que anuló |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Valores permitidos para `estado`

- `BORRADOR`
- `CONFIRMADA`
- `ANULADA`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `cliente_id` debe existir en `clientes`.
- `vendedor_empresa_id` debe existir en `usuarios_empresa`.
- `almacen_id` debe existir en `almacenes`.
- `canal_venta_id` debe existir en `canales_venta`.
- La combinación `empresa_id + codigo` debe ser única.
- Los importes deben ser mayores o iguales a cero.
- Una venta confirmada no podrá editar directamente sus productos.
- Una venta confirmada o anulada no podrá eliminarse físicamente.
- Una venta anulada deberá tener `motivo_anulacion`.

---

# 13. Tabla `detalle_venta`

Contiene los productos incluidos en cada venta.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del detalle |
| venta_id | UUID | Sí | Venta relacionada |
| producto_id | UUID | Sí | Producto vendido |
| cantidad | NUMERIC(14,3) | Sí | Cantidad vendida |
| precio_unitario | NUMERIC(14,2) | Sí | Precio histórico aplicado |
| costo_unitario | NUMERIC(14,2) | Sí | Costo histórico aplicado |
| subtotal_linea | NUMERIC(14,2) | Sí | Cantidad multiplicada por precio |
| descuento_linea | NUMERIC(14,2) | Sí | Descuento aplicado |
| total_linea | NUMERIC(14,2) | Sí | Subtotal menos descuento |
| creado_at | TIMESTAMPTZ | Sí | Fecha de creación |
| actualizado_at | TIMESTAMPTZ | Sí | Fecha de actualización |

## Restricciones

- `venta_id` debe existir en `ventas`.
- `producto_id` debe existir en `productos`.
- `cantidad` debe ser mayor que cero.
- `precio_unitario` debe ser mayor o igual a cero.
- `costo_unitario` debe ser mayor o igual a cero.
- `descuento_linea` debe ser mayor o igual a cero.
- `descuento_linea` no puede superar `subtotal_linea`.
- `total_linea` debe ser mayor o igual a cero.
- Una venta debe contener al menos un detalle antes de confirmarse.

## Fórmulas

`subtotal_linea = cantidad × precio_unitario`

`total_linea = subtotal_linea − descuento_linea`

---

# 14. Tabla `movimientos_inventario`

Registra todo cambio realizado en las existencias.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del movimiento |
| empresa_id | UUID | Sí | Empresa propietaria |
| almacen_id | UUID | Sí | Almacén afectado |
| producto_id | UUID | Sí | Producto afectado |
| venta_id | UUID | No | Venta relacionada, cuando corresponda |
| usuario_empresa_id | UUID | Sí | Usuario responsable |
| tipo_movimiento | TEXT | Sí | Tipo de movimiento |
| cantidad | NUMERIC(14,3) | Sí | Cantidad del movimiento |
| stock_anterior | NUMERIC(14,3) | Sí | Stock antes del movimiento |
| stock_resultante | NUMERIC(14,3) | Sí | Stock después del movimiento |
| motivo | TEXT | Sí | Explicación del movimiento |
| fecha_movimiento | TIMESTAMPTZ | Sí | Fecha y hora del movimiento |
| creado_at | TIMESTAMPTZ | Sí | Fecha de registro |

## Valores permitidos para `tipo_movimiento`

- `ENTRADA`
- `SALIDA`
- `AJUSTE_POSITIVO`
- `AJUSTE_NEGATIVO`
- `REVERSA`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `almacen_id` debe existir en `almacenes`.
- `producto_id` debe existir en `productos`.
- `venta_id` puede ser nulo para entradas o ajustes manuales.
- `usuario_empresa_id` debe existir en `usuarios_empresa`.
- `cantidad` debe ser mayor que cero.
- `stock_anterior` debe ser mayor o igual a cero.
- `stock_resultante` debe ser mayor o igual a cero.
- `motivo` es obligatorio.
- Los movimientos no podrán editarse ni eliminarse.
- Una salida o ajuste negativo no podrá producir stock negativo.

---

# 15. Tabla `cargas_archivo`

Registra cada importación de archivos Excel o CSV.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador de la carga |
| empresa_id | UUID | Sí | Empresa propietaria |
| usuario_empresa_id | UUID | Sí | Usuario que realizó la carga |
| modulo | TEXT | Sí | Módulo al que pertenece el archivo |
| nombre_archivo | TEXT | Sí | Nombre original del archivo |
| ruta_archivo | TEXT | No | Ruta del archivo almacenado |
| estado | TEXT | Sí | Estado de procesamiento |
| total_filas | INTEGER | Sí | Total de filas encontradas |
| filas_validas | INTEGER | Sí | Filas sin errores |
| filas_invalidas | INTEGER | Sí | Filas con errores |
| filas_insertadas | INTEGER | Sí | Filas cargadas correctamente |
| creado_at | TIMESTAMPTZ | Sí | Inicio de la carga |
| finalizado_at | TIMESTAMPTZ | No | Fin del procesamiento |

## Valores permitidos para `modulo`

- `CLIENTES`
- `PRODUCTOS`
- `VENTAS`

## Valores permitidos para `estado`

- `PENDIENTE`
- `VALIDANDO`
- `CON_ERRORES`
- `COMPLETADA`
- `CANCELADA`

## Restricciones

- `empresa_id` debe existir en `empresas`.
- `usuario_empresa_id` debe existir en `usuarios_empresa`.
- `nombre_archivo` no puede estar vacío.
- Los contadores de filas deben ser mayores o iguales a cero.
- `filas_validas + filas_invalidas` no podrá superar `total_filas`.
- `filas_insertadas` no podrá superar `filas_validas`.

---

# 16. Tabla `errores_carga`

Registra los errores encontrados durante la validación de un archivo.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| id | UUID | Sí | Identificador del error |
| carga_archivo_id | UUID | Sí | Carga relacionada |
| numero_fila | INTEGER | Sí | Número de fila del archivo |
| campo | TEXT | No | Columna que contiene el error |
| valor_original | TEXT | No | Valor recibido |
| codigo_error | TEXT | No | Código interno del error |
| mensaje_error | TEXT | Sí | Explicación del problema |
| creado_at | TIMESTAMPTZ | Sí | Fecha del registro |

## Restricciones

- `carga_archivo_id` debe existir en `cargas_archivo`.
- `numero_fila` debe ser mayor que cero.
- `mensaje_error` no puede estar vacío.
- Una carga puede tener varios errores.
- Una misma fila puede tener varios errores.

---

# 17. Resumen de claves únicas

| Tabla | Combinación única |
|---|---|
| empresas | ruc, cuando sea informado |
| usuarios_empresa | empresa_id + perfil_id |
| clientes | empresa_id + tipo_documento + numero_documento |
| categorias | empresa_id + nombre |
| productos | empresa_id + sku |
| almacenes | empresa_id + nombre |
| existencias_producto | almacen_id + producto_id |
| canales_venta | empresa_id + nombre |
| ventas | empresa_id + codigo |

# 18. Resumen de relaciones

| Tabla hija | Campo | Tabla padre |
|---|---|---|
| usuarios_empresa | empresa_id | empresas |
| usuarios_empresa | perfil_id | perfiles |
| clientes | empresa_id | empresas |
| categorias | empresa_id | empresas |
| productos | empresa_id | empresas |
| productos | categoria_id | categorias |
| almacenes | empresa_id | empresas |
| existencias_producto | almacen_id | almacenes |
| existencias_producto | producto_id | productos |
| canales_venta | empresa_id | empresas |
| ventas | empresa_id | empresas |
| ventas | cliente_id | clientes |
| ventas | vendedor_empresa_id | usuarios_empresa |
| ventas | almacen_id | almacenes |
| ventas | canal_venta_id | canales_venta |
| detalle_venta | venta_id | ventas |
| detalle_venta | producto_id | productos |
| movimientos_inventario | empresa_id | empresas |
| movimientos_inventario | almacen_id | almacenes |
| movimientos_inventario | producto_id | productos |
| movimientos_inventario | venta_id | ventas |
| movimientos_inventario | usuario_empresa_id | usuarios_empresa |
| cargas_archivo | empresa_id | empresas |
| cargas_archivo | usuario_empresa_id | usuarios_empresa |
| errores_carga | carga_archivo_id | cargas_archivo |