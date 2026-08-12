let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="fact_ventas"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "fact_venta_key",
            "source_venta_id",
            "fecha_key",
            "empresa_key",
            "cliente_key",
            "producto_key",
            "vendedor_key",
            "canal_key",
            "codigo_venta",
            "moneda",
            "cantidad",
            "precio_unitario",
            "costo_unitario",
            "descuento_linea",
            "descuento_cabecera_asignado",
            "venta_neta",
            "impuesto_asignado",
            "facturacion",
            "costo_total",
            "utilidad_bruta"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"fact_venta_key", Int64.Type},
            {"source_venta_id", type text},
            {"fecha_key", Int64.Type},
            {"empresa_key", Int64.Type},
            {"cliente_key", Int64.Type},
            {"producto_key", Int64.Type},
            {"vendedor_key", Int64.Type},
            {"canal_key", Int64.Type},
            {"codigo_venta", type text},
            {"moneda", type text},
            {"cantidad", type number},
            {"precio_unitario", Currency.Type},
            {"costo_unitario", Currency.Type},
            {"descuento_linea", Currency.Type},
            {"descuento_cabecera_asignado", Currency.Type},
            {"venta_neta", Currency.Type},
            {"impuesto_asignado", Currency.Type},
            {"facturacion", Currency.Type},
            {"costo_total", Currency.Type},
            {"utilidad_bruta", Currency.Type}
        }
    )
in
    Tipos
