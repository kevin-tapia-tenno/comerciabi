# Reglas de negocio de ComercioBI

## 1. Reglas generales

### RN-01

Toda información operativa deberá pertenecer a una empresa.

### RN-02

Un usuario podrá pertenecer a una o varias empresas, pero tendrá un rol definido en cada empresa.

### RN-03

Un usuario no podrá consultar ni modificar información de una empresa a la que no pertenece.

### RN-04

Las tablas operativas utilizarán identificadores UUID.

### RN-05

Los registros maestros podrán desactivarse, pero no deberán eliminarse cuando ya hayan sido utilizados en operaciones.

## 2. Clientes

### RN-06

El número de documento de un cliente será único dentro de una empresa cuando haya sido informado.

### RN-07

Un cliente podrá ser persona natural o empresa.

### RN-08

Para ventas sin identificación se utilizará un cliente genérico denominado Público general.

### RN-09

Un cliente desactivado conservará su historial, pero no podrá utilizarse en nuevas ventas.

## 3. Productos y categorías

### RN-10

Todo producto deberá pertenecer a una categoría.

### RN-11

El SKU deberá ser único dentro de la empresa.

### RN-12

El precio de venta y el costo no podrán ser negativos.

### RN-13

Un producto desactivado conservará su historial, pero no podrá agregarse a nuevas ventas.

### RN-14

La unidad de medida inicial podrá ser unidad, caja, paquete, kilogramo o litro.

## 4. Inventario

### RN-15

Cada producto tendrá una existencia independiente por almacén.

### RN-16

La combinación almacén-producto será única.

### RN-17

El stock actual no podrá ser negativo.

### RN-18

Todo cambio de stock deberá generar un movimiento de inventario.

### RN-19

Los movimientos de inventario no podrán editarse ni eliminarse.

### RN-20

Un ajuste manual deberá incluir obligatoriamente un motivo.

### RN-21

Los tipos iniciales de movimiento serán:

- Entrada.
- Salida.
- Ajuste positivo.
- Ajuste negativo.
- Reversa.

### RN-22

El stock actual deberá coincidir con los movimientos aplicados al producto y almacén.

## 5. Ventas

### RN-23

Una venta deberá pertenecer a una empresa y un almacén.

### RN-24

Una venta deberá asociarse a un cliente, un vendedor y un canal de venta.

### RN-25

Una venta deberá contener al menos un producto antes de ser confirmada.

### RN-26

La cantidad vendida deberá ser mayor que cero.

### RN-27

El descuento de una línea no podrá superar su subtotal.

### RN-28

El precio y costo usados en una venta deberán guardarse como una fotografía histórica, aunque posteriormente cambie el producto.

### RN-29

Los estados iniciales de una venta serán:

- Borrador.
- Confirmada.
- Anulada.

### RN-30

Una venta en borrador podrá editarse y no afectará el inventario.

### RN-31

Una venta confirmada descontará inventario.

### RN-32

La confirmación deberá ejecutarse como una sola transacción.

### RN-33

Si un producto no tiene stock suficiente, la venta completa no deberá confirmarse.

### RN-34

Una venta confirmada no podrá editar directamente productos, cantidades ni precios.

### RN-35

Para corregir una venta confirmada se deberá anular y crear una nueva.

### RN-36

Una venta confirmada no podrá eliminarse físicamente.

### RN-37

La anulación de una venta confirmada deberá generar movimientos de reversa.

### RN-38

Una venta anulada no deberá contabilizarse como venta efectiva en el dashboard.

## 6. Cálculos comerciales

### RN-39

El subtotal de una línea se calculará como:

cantidad × precio unitario

### RN-40

El total de una línea se calculará como:

subtotal de línea − descuento de línea

### RN-41

El subtotal de la venta será la suma de los subtotales de sus líneas.

### RN-42

El descuento total será la suma de los descuentos de sus líneas.

### RN-43

La base imponible será:

subtotal − descuento total

### RN-44

El impuesto será:

base imponible × tasa de impuesto

### RN-45

El total de la venta será:

base imponible + impuesto

### RN-46

La utilidad bruta se calculará utilizando el costo histórico guardado en el detalle de venta.

## 7. Importación de archivos

### RN-47

Una importación deberá registrar el archivo, usuario, fecha, módulo y estado.

### RN-48

Los registros deberán validarse antes de cargarse a las tablas definitivas.

### RN-49

Una fila con error deberá registrar el número de fila, campo, valor y mensaje.

### RN-50

El sistema deberá informar cuántas filas fueron válidas, inválidas e insertadas.

### RN-51

Una importación no deberá insertar registros duplicados silenciosamente.

## 8. Auditoría y fechas

### RN-52

Las fechas y horas se almacenarán con zona horaria.

### RN-53

Las operaciones deberán registrar el usuario responsable.

### RN-54

Los registros principales tendrán fecha de creación y última modificación.

### RN-55

Los importes se almacenarán con precisión decimal.

### RN-56

Las cantidades podrán admitir decimales para soportar productos medidos por peso o volumen.