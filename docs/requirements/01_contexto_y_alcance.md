# ComercioBI — Contexto y alcance del MVP

## 1. Descripción del proyecto

ComercioBI es una plataforma web de inteligencia comercial dirigida a pequeñas y medianas empresas.

La solución permitirá registrar clientes, productos, ventas y movimientos de inventario, importar información desde archivos y consultar indicadores comerciales mediante un dashboard web y un informe de Power BI.

El proyecto será desarrollado como una solución empresarial funcional y como proyecto de portafolio para demostrar conocimientos de:

- PostgreSQL y SQL.
- Modelamiento de datos.
- Supabase.
- React y TypeScript.
- Python y procesos ETL.
- Power BI.
- Seguridad y permisos.
- Automatización.
- Despliegue web.

## 2. Empresa del caso de estudio

Para el desarrollo se utilizará una empresa ficticia llamada Distribuidora Nova.

Distribuidora Nova comercializa productos de oficina, tecnología y artículos para negocios. Atiende clientes minoristas y corporativos.

Actualmente administra su información mediante archivos Excel separados.

## 3. Problema empresarial

La empresa presenta los siguientes problemas:

- Información de clientes duplicada.
- Productos registrados con nombres diferentes.
- Dificultad para conocer el stock disponible.
- Reportes comerciales elaborados manualmente.
- Falta de alertas de stock mínimo.
- Poca visibilidad sobre productos rentables.
- Dificultad para comparar ventas entre periodos.
- Dependencia de una persona para elaborar reportes.
- Ausencia de historial confiable de movimientos de inventario.
- Errores durante la carga de información desde Excel.

## 4. Objetivo general

Desarrollar una plataforma web que centralice las operaciones comerciales de una MYPE y transforme sus datos en información útil para la toma de decisiones.

## 5. Objetivos específicos

- Centralizar clientes, productos y ventas.
- Controlar las entradas y salidas de inventario.
- Evitar ventas con stock insuficiente.
- Mantener trazabilidad de los movimientos.
- Permitir la carga controlada de Excel y CSV.
- Mostrar indicadores comerciales actualizados.
- Construir un modelo analítico para Power BI.
- Controlar el acceso según el rol del usuario.
- Preparar la arquitectura para futuras funciones de IA.

## 6. Usuarios del sistema

### Administrador

Administra usuarios, roles, configuraciones, clientes, productos, inventario, ventas e importaciones.

### Gerente

Consulta toda la información, indicadores, reportes y alertas. No administra usuarios.

### Vendedor

Registra clientes y ventas. Consulta productos, precios y stock disponible.

### Encargado de almacén

Registra entradas, salidas y ajustes de inventario. Consulta productos y ventas confirmadas.

### Analista

Consulta información, importa archivos autorizados y utiliza los dashboards.

## 7. Alcance incluido en el MVP

El MVP incluirá:

- Inicio y cierre de sesión.
- Perfil de usuario.
- Empresa de demostración.
- Roles y permisos.
- Gestión de clientes.
- Gestión de categorías.
- Gestión de productos.
- Almacén principal.
- Stock por producto.
- Registro de ventas.
- Detalle de productos por venta.
- Confirmación y anulación de ventas.
- Movimientos de inventario.
- Ajustes de inventario.
- Importación de clientes y productos.
- Registro de errores de importación.
- Dashboard comercial web.
- Modelo de datos para Power BI.
- Seguridad por empresa y rol.

## 8. Fuera del alcance inicial

No se desarrollará todavía:

- Facturación electrónica.
- Integración con SUNAT.
- Contabilidad completa.
- Planillas.
- Compras y proveedores.
- Cuentas por cobrar.
- Cuentas por pagar.
- Varias monedas.
- Varias empresas operativas en la interfaz.
- Varias sucursales.
- Varias cajas.
- Aplicación móvil nativa.
- Funcionamiento sin conexión.
- Pronósticos con inteligencia artificial.
- Chat con lenguaje natural.
- Notificaciones por WhatsApp.

Estas funcionalidades podrán agregarse después de completar el MVP.

## 9. Supuestos iniciales

- Se utilizará una empresa de demostración.
- La empresa tendrá inicialmente un almacén principal.
- La moneda inicial será PEN.
- La zona horaria será America/Lima.
- Los impuestos serán configurables.
- Para las pruebas se podrá usar una tasa de impuesto de demostración.
- Los usuarios necesitarán conexión a internet.
- Los precios, costos y cantidades no podrán ser negativos.
- Los documentos comerciales no se eliminarán físicamente.
- La aplicación será adaptable a computadora y celular.

## 10. Indicadores principales

El dashboard deberá mostrar como mínimo:

- Ventas totales.
- Número de ventas.
- Utilidad bruta.
- Margen bruto.
- Ticket promedio.
- Clientes activos.
- Productos vendidos.
- Ventas por mes.
- Ventas por categoría.
- Ventas por vendedor.
- Ventas por canal.
- Productos más vendidos.
- Productos con stock crítico.
- Valor del inventario.
- Últimas ventas registradas.

## 11. Flujo empresarial principal

1. Un administrador registra categorías y productos.
2. El encargado de almacén registra el stock inicial.
3. Un vendedor registra o selecciona un cliente.
4. El vendedor crea una venta en estado borrador.
5. Agrega uno o varios productos.
6. El sistema calcula subtotales, descuentos, impuestos y total.
7. El vendedor confirma la venta.
8. El sistema valida el stock.
9. El sistema descuenta el inventario.
10. El sistema genera movimientos de salida.
11. Los indicadores comerciales se actualizan.
12. Si la venta se anula, el sistema genera movimientos de reversa.