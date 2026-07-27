# Resumen de correcciones y mejoras

## Correcciones visuales

- Los cuatro indicadores de calidad ahora son tarjetas independientes.
- Las columnas reconocidas se muestran como etiquetas separadas.
- La tabla de errores tiene encabezados, espaciado, bordes y desplazamiento horizontal.
- La vista previa conserva el número de fila original de Excel.
- La pantalla es responsiva y evita que textos o tablas se salgan de la tarjeta.

## Correcciones funcionales

- Los campos opcionales ausentes ya no se interpretan como el texto `undefined`.
- Las celdas realmente vacías se validan como vacías.
- Los documentos de clientes deben completarse en pareja.
- Se detectan documentos y SKU repetidos dentro del mismo archivo.
- Las líneas de una venta se agrupan por `codigo_externo`.
- Si una línea de una venta es inválida, se omite todo el grupo para no crear borradores incompletos.
- Se comprueba consistencia de cliente, almacén, canal y fecha dentro de una venta.
- Los errores de base de datos se transforman en mensajes comprensibles.

## Seguridad y trazabilidad

- El archivo se guarda en un bucket privado.
- La ruta usa `empresa_id/carga_id/archivo`.
- RLS limita lectura y escritura a miembros autorizados.
- Cada error se registra en `errores_carga`.
- Cada ejecución actualiza contadores y estado en `cargas_archivo`.
- Productos y Ventas requieren administrador para su ejecución masiva.
- Las ventas importadas quedan en borrador y no alteran stock hasta su confirmación.
