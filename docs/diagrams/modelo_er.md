# Diagrama entidad-relación de ComercioBI

El siguiente diagrama representa el modelo transaccional inicial del MVP.

```mermaid
erDiagram

    EMPRESAS ||--o{ USUARIOS_EMPRESA : tiene
    PERFILES ||--o{ USUARIOS_EMPRESA : pertenece

    EMPRESAS ||--o{ CLIENTES : registra
    EMPRESAS ||--o{ CATEGORIAS : organiza
    EMPRESAS ||--o{ PRODUCTOS : posee
    EMPRESAS ||--o{ ALMACENES : administra
    EMPRESAS ||--o{ CANALES_VENTA : configura
    EMPRESAS ||--o{ VENTAS : registra
    EMPRESAS ||--o{ MOVIMIENTOS_INVENTARIO : controla
    EMPRESAS ||--o{ CARGAS_ARCHIVO : procesa

    CATEGORIAS ||--o{ PRODUCTOS : clasifica

    ALMACENES ||--o{ EXISTENCIAS_PRODUCTO : contiene
    PRODUCTOS ||--o{ EXISTENCIAS_PRODUCTO : mantiene

    CLIENTES ||--o{ VENTAS : realiza
    USUARIOS_EMPRESA ||--o{ VENTAS : registra
    ALMACENES ||--o{ VENTAS : despacha
    CANALES_VENTA ||--o{ VENTAS : origina

    VENTAS ||--|{ DETALLE_VENTA : contiene
    PRODUCTOS ||--o{ DETALLE_VENTA : incluye

    VENTAS ||--o{ MOVIMIENTOS_INVENTARIO : origina
    ALMACENES ||--o{ MOVIMIENTOS_INVENTARIO : registra
    PRODUCTOS ||--o{ MOVIMIENTOS_INVENTARIO : afecta
    USUARIOS_EMPRESA ||--o{ MOVIMIENTOS_INVENTARIO : ejecuta

    USUARIOS_EMPRESA ||--o{ CARGAS_ARCHIVO : realiza
    CARGAS_ARCHIVO ||--o{ ERRORES_CARGA : contiene

    EMPRESAS {
        uuid id PK
        string nombre
        string razon_social
        string ruc
        string moneda
        string zona_horaria
        decimal tasa_impuesto
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    PERFILES {
        uuid id PK
        string nombres
        string apellidos
        string telefono
        string avatar_url
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    USUARIOS_EMPRESA {
        uuid id PK
        uuid empresa_id FK
        uuid perfil_id FK
        string rol
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    CLIENTES {
        uuid id PK
        uuid empresa_id FK
        string tipo_cliente
        string tipo_documento
        string numero_documento
        string nombre_completo
        string email
        string telefono
        string segmento
        string direccion
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    CATEGORIAS {
        uuid id PK
        uuid empresa_id FK
        string nombre
        string descripcion
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    PRODUCTOS {
        uuid id PK
        uuid empresa_id FK
        uuid categoria_id FK
        string sku
        string nombre
        string descripcion
        string unidad_medida
        decimal costo_actual
        decimal precio_venta
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    ALMACENES {
        uuid id PK
        uuid empresa_id FK
        string nombre
        string descripcion
        boolean es_principal
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    EXISTENCIAS_PRODUCTO {
        uuid id PK
        uuid almacen_id FK
        uuid producto_id FK
        decimal stock_actual
        decimal stock_minimo
        datetime actualizado_at
    }

    CANALES_VENTA {
        uuid id PK
        uuid empresa_id FK
        string nombre
        string descripcion
        boolean activo
        datetime creado_at
        datetime actualizado_at
    }

    VENTAS {
        uuid id PK
        uuid empresa_id FK
        uuid cliente_id FK
        uuid vendedor_empresa_id FK
        uuid almacen_id FK
        uuid canal_venta_id FK
        string codigo
        datetime fecha_venta
        string estado
        decimal subtotal
        decimal descuento_total
        decimal tasa_impuesto
        decimal impuesto_total
        decimal total
        string moneda
        string observaciones
        string motivo_anulacion
        datetime confirmada_at
        uuid confirmada_por FK
        datetime anulada_at
        uuid anulada_por FK
        datetime creado_at
        datetime actualizado_at
    }

    DETALLE_VENTA {
        uuid id PK
        uuid venta_id FK
        uuid producto_id FK
        decimal cantidad
        decimal precio_unitario
        decimal costo_unitario
        decimal subtotal_linea
        decimal descuento_linea
        decimal total_linea
        datetime creado_at
        datetime actualizado_at
    }

    MOVIMIENTOS_INVENTARIO {
        uuid id PK
        uuid empresa_id FK
        uuid almacen_id FK
        uuid producto_id FK
        uuid venta_id FK
        uuid usuario_empresa_id FK
        string tipo_movimiento
        decimal cantidad
        decimal stock_anterior
        decimal stock_resultante
        string motivo
        datetime fecha_movimiento
        datetime creado_at
    }

    CARGAS_ARCHIVO {
        uuid id PK
        uuid empresa_id FK
        uuid usuario_empresa_id FK
        string modulo
        string nombre_archivo
        string ruta_archivo
        string estado
        int total_filas
        int filas_validas
        int filas_invalidas
        int filas_insertadas
        datetime creado_at
        datetime finalizado_at
    }

    ERRORES_CARGA {
        uuid id PK
        uuid carga_archivo_id FK
        int numero_fila
        string campo
        string valor_original
        string codigo_error
        string mensaje_error
        datetime creado_at
    }
```

## Relaciones principales

### Empresas y usuarios

Una empresa puede tener muchos usuarios y un usuario puede participar en varias empresas.

La relación muchos a muchos se resuelve mediante la tabla `usuarios_empresa`.

### Categorías y productos

Una categoría puede contener muchos productos.

Cada producto pertenece a una categoría.

### Productos y almacenes

Un producto puede existir en varios almacenes y un almacén puede almacenar varios productos.

La relación muchos a muchos se resuelve mediante `existencias_producto`.

### Ventas y detalle

Una venta debe contener uno o varios registros de detalle.

Cada detalle pertenece a una sola venta y corresponde a un producto.

### Ventas e inventario

Cuando una venta se confirma, puede generar varios movimientos de salida de inventario.

Cuando una venta se anula, genera movimientos de reversa.

### Cargas y errores

Una carga de archivo puede finalizar sin errores o puede contener uno o varios errores asociados a diferentes filas.

## Significado de las relaciones Mermaid

| Símbolo | Significado |
|---|---|
| `||` | Exactamente uno |
| `o|` | Cero o uno |
| `|{` | Uno o varios |
| `o{` | Cero o varios |

Ejemplo:

`VENTAS ||--|{ DETALLE_VENTA`

Significa que una venta contiene uno o varios detalles y que cada detalle pertenece a una sola venta.