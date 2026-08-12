let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_canal"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "canal_key",
            "source_canal_id",
            "nombre"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"canal_key", Int64.Type},
            {"source_canal_id", type text},
            {"nombre", type text}
        }
    )
in
    Tipos
