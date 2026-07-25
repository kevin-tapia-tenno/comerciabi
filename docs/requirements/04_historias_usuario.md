# Historias de usuario de ComercioBI

## HU-01. Iniciar sesión

Como usuario registrado, quiero iniciar sesión para acceder a las funciones autorizadas.

### Criterios de aceptación

- El usuario debe ingresar correo y contraseña.
- Las credenciales inválidas deben mostrar un mensaje.
- Un usuario inactivo no debe ingresar.
- Después del ingreso se debe identificar su empresa y rol.

## HU-02. Administrar usuarios

Como administrador, quiero asignar usuarios y roles para controlar quién puede utilizar cada módulo.

### Criterios de aceptación

- Solo el administrador puede administrar miembros.
- No se debe permitir una membresía duplicada.
- Cada membresía debe tener un rol.
- Un usuario desactivado pierde el acceso a la empresa.

## HU-03. Registrar cliente

Como vendedor, quiero registrar un cliente para asociarlo a una venta.

### Criterios de aceptación

- Se debe indicar el tipo de cliente.
- Se debe validar el documento cuando sea informado.
- No se debe duplicar un documento en la misma empresa.
- El cliente debe aparecer en el buscador después de guardarse.

## HU-04. Registrar producto

Como administrador, quiero registrar productos para utilizarlos en ventas e inventario.

### Criterios de aceptación

- El SKU es obligatorio.
- El nombre es obligatorio.
- La categoría es obligatoria.
- El costo y precio no pueden ser negativos.
- No puede repetirse el SKU dentro de la empresa.

## HU-05. Registrar stock inicial

Como encargado de almacén, quiero registrar el stock inicial para comenzar a controlar las existencias.

### Criterios de aceptación

- Se debe seleccionar producto y almacén.
- La cantidad debe ser positiva.
- Debe generarse un movimiento de entrada.
- El stock resultante debe quedar visible.

## HU-06. Crear una venta

Como vendedor, quiero crear una venta con varios productos para registrar una operación comercial.

### Criterios de aceptación

- Se debe seleccionar cliente.
- Se debe seleccionar canal.
- Se debe seleccionar almacén.
- Debe existir al menos una línea.
- Las cantidades deben ser mayores que cero.
- El sistema debe calcular los totales.

## HU-07. Confirmar una venta

Como vendedor, quiero confirmar una venta para completar la operación y descontar el inventario.

### Criterios de aceptación

- La venta debe estar en borrador.
- Todos los productos deben tener stock suficiente.
- Deben crearse movimientos de salida.
- El stock debe actualizarse.
- El estado debe cambiar a confirmada.
- Si ocurre un error, ningún cambio parcial debe guardarse.

## HU-08. Evitar una venta sin stock

Como encargado de almacén, quiero que el sistema rechace ventas sin stock para evitar inventarios negativos.

### Criterios de aceptación

- La validación debe realizarse antes de confirmar.
- El sistema debe indicar qué producto tiene stock insuficiente.
- La venta debe permanecer en borrador.
- El inventario no debe cambiar.

## HU-09. Anular una venta

Como administrador, quiero anular una venta confirmada para corregir una operación sin borrar su historial.

### Criterios de aceptación

- Solo una venta confirmada puede anularse.
- Debe solicitarse un motivo.
- Deben crearse movimientos de reversa.
- El stock debe restituirse.
- La venta debe quedar en estado anulada.

## HU-10. Ajustar inventario

Como encargado de almacén, quiero registrar ajustes para corregir diferencias físicas.

### Criterios de aceptación

- El ajuste puede ser positivo o negativo.
- El motivo es obligatorio.
- No puede producir stock negativo.
- Debe registrarse el usuario responsable.
- Debe crearse un movimiento de inventario.

## HU-11. Importar productos

Como analista, quiero importar productos desde un archivo para evitar registrarlos uno por uno.

### Criterios de aceptación

- El sistema debe validar las columnas.
- Debe detectar SKU duplicado.
- Debe detectar costos o precios inválidos.
- Debe mostrar filas válidas e inválidas.
- Los errores deben poder consultarse.

## HU-12. Consultar dashboard

Como gerente, quiero consultar indicadores para evaluar el desempeño comercial.

### Criterios de aceptación

- Debe permitir filtrar por fechas.
- Debe mostrar ventas, utilidad, margen y ticket promedio.
- Debe excluir ventas anuladas.
- Debe mostrar productos con stock crítico.
- Los datos deben corresponder a la empresa del usuario.