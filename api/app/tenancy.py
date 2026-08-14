from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import Connection

from api.app.database import get_db
from api.app.models import CurrentUser, TenantContext
from api.app.repository import get_memberships
from api.app.security import get_current_user


def get_tenant_context(
    current_user: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_db),
    x_empresa_id: Annotated[
        UUID | None,
        Header(alias="X-Empresa-Id"),
    ] = None,
) -> TenantContext:
    memberships = get_memberships(connection, current_user.user_id)
    usable = [m for m in memberships if m.empresa_key is not None]

    if not usable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "El usuario no tiene una empresa activa sincronizada "
                "con el modelo analítico."
            ),
        )

    selected = None

    if x_empresa_id is not None:
        selected = next(
            (m for m in usable if m.empresa_id == x_empresa_id),
            None,
        )
        if selected is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no pertenece a la empresa solicitada.",
            )
    elif len(usable) == 1:
        selected = usable[0]
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El usuario pertenece a más de una empresa. "
                "Envía el encabezado X-Empresa-Id."
            ),
        )

    assert selected.empresa_key is not None

    return TenantContext(
        user_id=current_user.user_id,
        empresa_id=selected.empresa_id,
        empresa_key=selected.empresa_key,
        empresa=selected.empresa,
        rol=selected.rol,
    )
