# Requerimientos de ComercioBI

## 1. Requerimientos funcionales

### RF-01. Autenticación

El sistema deberá permitir que un usuario autorizado inicie y cierre sesión.

### RF-02. Perfil del usuario

El sistema deberá mostrar los datos básicos del usuario autenticado y su rol dentro de la empresa.

### RF-03. Control de acceso

El sistema deberá restringir las funciones disponibles según el rol del usuario.

### RF-04. Gestión de clientes

El sistema deberá permitir registrar, consultar, editar, buscar y desactivar clientes.

### RF-05. Validación de clientes

El sistema deberá validar que no exista otro cliente activo con el mismo tipo y número de documento dentro de la misma empresa.

### RF-06. Gestión de categorías

El sistema deberá permitir registrar, editar, consultar y desactivar categorías de productos.

### RF-07. Gestión de productos

El sistema deberá permitir registrar, consultar, editar, buscar y desactivar productos.

### RF-08. Validación de productos

El sistema deberá impedir que dos productos de una misma empresa tengan el mismo SKU.

### RF-09. Gestión de almacenes

El sistema deberá permitir trabajar inicialmente con un almacén principal.

### RF-10. Consulta de existencias

El sistema deberá mostrar el stock actual y el stock mínimo de cada producto.

### RF-11. Ajustes de inventario

El encargado de almacén deberá poder registrar ajustes positivos y negativos indicando un motivo.

### RF-12. Creación de ventas

El vendedor deberá poder crear una venta en estado borrador.

### RF-13. Detalle de venta

Una venta deberá admitir uno o varios productos, cantidades, precios y descuentos.

### RF-14. Cálculo de venta

El sistema deberá calcular automáticamente subtotal, descuento, impuesto y total.

### RF-15. Confirmación de venta

Al confirmar una venta, el sistema deberá validar el stock y registrar la salida del inventario.

### RF-16. Restricción por stock

El sistema deberá impedir la confirmación de una venta cuando algún producto no tenga stock suficiente.

### RF-17. Anulación de venta

El sistema deberá permitir anular una venta confirmada y devolver las cantidades al inventario mediante movimientos de reversa.

### RF-18. Historial de inventario

El sistema deberá conservar un historial de entradas, salidas, ajustes y reversas.

### RF-19. Canales de venta

Cada venta deberá estar asociada a un canal, por ejemplo tienda, web, teléfono o corporativo.

### RF-20. Importación de archivos

El sistema deberá permitir importar clientes y productos desde archivos CSV o Excel.

### RF-21. Validación de importaciones

Antes de insertar información, el sistema deberá verificar columnas obligatorias, formatos, duplicados y valores inválidos.

### RF-22. Registro de errores

Los errores detectados durante una importación deberán quedar registrados con el número de fila, campo y motivo.

### RF-23. Dashboard comercial

El sistema deberá mostrar indicadores comerciales y gráficos filtrables por periodo.

### RF-24. Dashboard de inventario

El sistema deberá mostrar stock actual, stock crítico, productos agotados y valorización del inventario.

### RF-25. Auditoría básica

Las operaciones principales deberán registrar fecha, usuario y empresa.

### RF-26. Aislamiento por empresa

Un usuario solo podrá consultar información de las empresas a las que pertenece.

## 2. Requerimientos no funcionales

### RNF-01. Seguridad

La base de datos deberá aplicar permisos y políticas de seguridad, no solamente restricciones visuales en la aplicación.

### RNF-02. Integridad

Las ventas, detalles y movimientos de inventario deberán guardarse de manera transaccional.

### RNF-03. Rendimiento

Las consultas frecuentes deberán responder rápidamente con el volumen de datos utilizado en la demostración.

### RNF-04. Usabilidad

Los formularios deberán incluir mensajes claros de validación y confirmación.

### RNF-05. Adaptabilidad

La aplicación deberá poder utilizarse desde computadora, tableta y celular.

### RNF-06. Trazabilidad

Las ventas confirmadas y los movimientos de inventario no deberán eliminarse físicamente.

### RNF-07. Mantenibilidad

El código deberá organizarse por módulos y utilizar nombres comprensibles.

### RNF-08. Portabilidad

La aplicación no deberá depender exclusivamente de un único proveedor de despliegue.

### RNF-09. Precisión

Los importes monetarios deberán almacenarse con tipos decimales y no con números de punto flotante.

### RNF-10. Respaldo documental

Las reglas, entidades, relaciones y decisiones técnicas deberán quedar documentadas en el repositorio.