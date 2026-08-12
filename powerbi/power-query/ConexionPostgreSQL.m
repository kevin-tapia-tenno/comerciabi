let
    Source = PostgreSQL.Database(
        pServidorPostgreSQL,
        pBaseDatos,
        [
            CreateNavigationProperties = false,
            HierarchicalNavigation = true,
            CommandTimeout = #duration(0, 0, 10, 0)
        ]
    )
in
    Source
