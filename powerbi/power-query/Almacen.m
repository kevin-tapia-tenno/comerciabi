let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_almacen"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "almacen_key",
            "source_almacen_id",
            "empresa_key",
            "nombre",
            "activo"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"almacen_key", Int64.Type},
            {"source_almacen_id", type text},
            {"empresa_key", Int64.Type},
            {"nombre", type text},
            {"activo", type logical}
        }
    )
in
    Tipos
