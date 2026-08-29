# Fase 15 — Administración de usuarios y roles

## 1. Objetivo

Cerrar la historia de usuario pendiente de administración de accesos sin romper la arquitectura consolidada en Fases 4 y 14.

La Fase 15 permite que un `ADMIN` de una empresa:

- vea los miembros activos e inactivos de su empresa;
- vea nombre, correo, rol y estado de membresía;
- invite una cuenta nueva por correo;
- vincule a la empresa una cuenta de ComercioBI ya existente;
- asigne uno de los cinco roles empresariales;
- cambie el rol de una membresía existente;
- desactive/reactive el acceso sin eliminar historial;
- conserve siempre al menos un `ADMIN` activo;
- complete el alta del nuevo usuario mediante una pantalla de creación de contraseña.

No se expone la clave secreta de Supabase al navegador y no se desactiva RLS.

---

## 2. Arquitectura resultante

```text
ADMIN (React)
    |
    | JWT + X-Empresa-Id
    v
FastAPI /api/v1/admin/users/invite
    |
    |-- valida JWT
    |-- resuelve tenant
    |-- exige rol ADMIN
    |-- usa SUPABASE_SECRET_KEY solo para Supabase Auth
    |-- usa el JWT del ADMIN para crear/reactivar membresía vía Data API
    v
Supabase
    |-- auth.users
    |-- public.perfiles (trigger existente F4)
    |-- public.usuarios_empresa (RLS existente F4)
    `-- trigger F15: nunca dejar 0 ADMIN activos

React /usuarios
    |-- RPC listar_usuarios_empresa_admin
    |-- UPDATE rol/activo bajo RLS
    `-- no conoce SUPABASE_SECRET_KEY
```

La API PostgreSQL de IA continúa usando `comerciabi_api` de solo lectura. No se convierte ese rol en un rol de escritura.

---

## 3. Archivos de la fase

### Nuevos

- `database/migrations/023_usuarios_roles_admin.sql`
- `database/tests/014_verificaciones_usuarios_roles.sql`
- `api/app/admin_models.py`
- `api/app/supabase_admin.py`
- `src/lib/admin-service.ts`
- `src/pages/UsersPage.tsx`
- `src/pages/AcceptInvitePage.tsx`
- `src/styles/users.css`
- `src/types/admin.ts`
- `scripts/verificar_fase15.ps1`
- `docs/FASE_15_INSTRUCCIONES.md`

### Modificados

- `api/.env.example`
- `api/app/config.py`
- `api/app/main.py`
- `api/app/models.py`
- `api/app/routes.py`
- `api/app/security.py`
- `src/App.tsx`
- `src/lib/api-client.ts`

---

## 4. Preparar Git

Partir del cierre de Fase 14.15H:

```powershell
cd C:\Users\HP\Desktop\Proyectos\comerciabi

git status
git branch
git log -1 --oneline
```

Esperado antes de comenzar:

```text
rama: feat/fase-14-ai
HEAD: 14d691c
working tree limpio
```

Crear rama:

```powershell
git switch feat/fase-14-ai
git pull
git switch -c feat/fase-15-users
```

No trabajar directamente sobre `main`.

---

## 5. Aplicar el patch

Descomprimir el patch y ejecutar desde la carpeta del patch:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned

.\APLICAR_PATCH_FASE15.ps1 `
  -ProjectRoot "C:\Users\HP\Desktop\Proyectos\comerciabi"
```

Después:

```powershell
cd C:\Users\HP\Desktop\Proyectos\comerciabi
git status
```

Revisar que solo aparezcan archivos de Fase 15.

---

## 6. Base de datos Supabase

En Supabase Dashboard > SQL Editor ejecutar completo:

```text
database/migrations/023_usuarios_roles_admin.sql
```

Esta migración crea:

1. `public.listar_usuarios_empresa_admin(uuid)`
   - solo devuelve datos si `auth.uid()` es `ADMIN` activo de la empresa;
   - permite incluir membresías inactivas;
   - puede leer `auth.users.email` sin exponer `auth.users` directamente.

2. `public.proteger_ultimo_admin_empresa()` + trigger
   - impide desactivar al último administrador activo;
   - impide cambiar el rol del último administrador activo;
   - protege la regla incluso fuera de React.

Después ejecutar:

```text
database/tests/014_verificaciones_usuarios_roles.sql
```

Resultados esperados:

- `listar_usuarios_empresa_admin` existe y `security_definer = true`;
- `proteger_ultimo_admin_empresa` existe y `security_definer = true`;
- `trg_proteger_ultimo_admin_empresa` existe y está habilitado;
- `authenticated_can_execute_admin_list = true`;
- `anon_can_execute_admin_list = false`.

---

## 7. Crear/configurar la Secret Key de Supabase

Usar una clave secreta nueva `sb_secret_...` para el backend.

En Supabase Dashboard:

```text
Settings
  > API Keys
  > Secret keys
```

Si todavía no existe una clave nueva, crear una para el backend de ComercioBI.

Nunca colocar esta clave en:

- `.env.local` del frontend;
- una variable `VITE_*`;
- código TypeScript;
- GitHub;
- capturas de pantalla o documentación pública.

La clave solamente va en `api/.env` local y en las variables seguras del backend de Vercel.

---

## 8. Configuración local de `api/.env`

No reemplazar las variables que ya funcionan en Fase 14. Agregar:

```dotenv
APP_PUBLIC_URL=http://localhost:5173
SUPABASE_SECRET_KEY=sb_secret_TU_CLAVE_REAL
```

No escribir la clave en ningún otro archivo.

Comprobar:

```powershell
git check-ignore api/.env
```

Debe devolver:

```text
api/.env
```

---

## 9. Configurar redirect de invitación en Supabase Auth

En Supabase Dashboard, abrir la configuración de URLs de Authentication.

Mantener/agregar:

```text
http://localhost:5173/aceptar-invitacion
https://TU-DOMINIO-PRODUCCION/aceptar-invitacion
```

La URL debe estar en la lista de Redirect URLs permitidas.

En producción `APP_PUBLIC_URL` debe coincidir con el dominio público de ComercioBI.

El template de correo de invitación debe continuar utilizando el enlace de confirmación de Supabase (`ConfirmationURL`).

---

## 10. Levantar la aplicación local

### Terminal 1 — API

```powershell
cd C:\Users\HP\Desktop\Proyectos\comerciabi

.\api\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\api\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000
```

Comprobar:

```text
http://127.0.0.1:8000/api/docs
```

Debe aparecer:

```text
POST /api/v1/admin/users/invite
```

### Terminal 2 — React

```powershell
cd C:\Users\HP\Desktop\Proyectos\comerciabi
npm install
npm run dev
```

Abrir:

```text
http://localhost:5173
```

---

## 11. Probar `/usuarios` como ADMIN

Iniciar sesión con el ADMIN actual.

Abrir:

```text
http://localhost:5173/usuarios
```

Debe mostrar:

- total de miembros;
- accesos activos;
- accesos inactivos;
- administradores activos;
- tabla con nombre, correo, rol, estado y fecha de alta;
- búsqueda;
- filtro por estado;
- filtro por rol;
- botón `Invitar usuario`;
- acciones `Cambiar rol` y `Desactivar/Reactivar`.

La propia cuenta del ADMIN aparece como `Tu cuenta actual` y sus acciones quedan bloqueadas desde la interfaz.

---

## 12. Prueba E2E de invitación

Usar un correo secundario real al que se tenga acceso.

En `/usuarios`:

1. pulsar `Invitar usuario`;
2. ingresar correo;
3. ingresar nombres y apellidos;
4. elegir, por ejemplo, `ANALISTA`;
5. enviar.

Esperado:

- FastAPI valida que el solicitante es ADMIN de la empresa actual;
- Supabase Auth crea/invita la cuenta;
- el trigger de F4 crea `public.perfiles`;
- la membresía se crea en `public.usuarios_empresa` mediante el JWT del ADMIN y RLS;
- el miembro aparece inmediatamente en `/usuarios`;
- el correo recibe la invitación.

Si el correo ya pertenece a una cuenta confirmada de ComercioBI, no se duplica la cuenta: se vincula/reactiva su membresía para esta empresa.

Si existe una cuenta aún no confirmada, se reenvía la invitación.

---

## 13. Aceptar la invitación

Desde el correo secundario, abrir el enlace.

Debe terminar en:

```text
/aceptar-invitacion
```

La pantalla permite:

- crear contraseña de al menos 8 caracteres;
- confirmarla;
- guardar con `supabase.auth.updateUser()`;
- entrar a ComercioBI con la sesión recién creada.

Después comprobar que solo aparecen los módulos permitidos para el rol asignado.

---

## 14. Prueba de roles

Desde ADMIN:

1. volver a `/usuarios`;
2. seleccionar el usuario de prueba;
3. cambiar el rol, por ejemplo:

```text
ANALISTA -> VENDEDOR
```

4. guardar;
5. recargar o volver a iniciar sesión con el usuario de prueba.

La UI debe reflejar el nuevo rol.

La seguridad de base de datos se evalúa contra el rol almacenado en PostgreSQL, por lo que RLS sigue siendo la capa autoritativa.

---

## 15. Prueba de desactivación/reactivación

Desde ADMIN:

1. desactivar el usuario de prueba;
2. comprobar que aparece como `Inactivo`;
3. intentar usar su cuenta.

Aunque una sesión antigua conserve temporalmente parte del menú hasta recargar, RLS y la API dejan de reconocer una membresía inactiva. Tras recargar, la aplicación tampoco puede cargar contexto empresarial.

Reactivar desde ADMIN y comprobar que puede volver a entrar.

No se elimina el usuario, su perfil ni su historial transaccional.

---

## 16. Probar protección del último ADMIN

Si actualmente existe un solo ADMIN activo, la base de datos debe impedir cambiarlo a otro rol o desactivarlo.

La interfaz ya evita modificar la propia cuenta. La protección de PostgreSQL añade una segunda barrera para operaciones directas/API.

Para probar la regla de forma funcional sin arriesgar el acceso:

1. invitar una segunda cuenta;
2. convertirla en `ADMIN`;
3. comprobar que ahora existen 2 administradores;
4. probar cambios únicamente con cuentas de prueba.

No dejar la empresa sin un ADMIN conocido y accesible.

---

## 17. Verificación técnica

Ejecutar:

```powershell
.\scripts\verificar_fase15.ps1
```

El script comprueba:

- archivos F15;
- secretos fuera de Git;
- compilación Python;
- pytest;
- `npm run build`;
- `npm run lint`;
- presencia local de las variables de invitación sin imprimir la clave.

---

## 18. Configurar Vercel

Añadir en las variables seguras del deployment/backend:

```text
SUPABASE_SECRET_KEY = sb_secret_...
APP_PUBLIC_URL = https://TU-DOMINIO-PRODUCCION
```

Mantener todas las variables de Fase 14 que ya existen.

Nunca crear `VITE_SUPABASE_SECRET_KEY`.

Después redeployar.

Validar en Production:

1. login ADMIN;
2. `/usuarios`;
3. listado;
4. invitación;
5. correo;
6. `/aceptar-invitacion`;
7. contraseña;
8. login;
9. permisos según rol;
10. desactivación/reactivación.

---

## 19. Commit de Fase 15

Cuando todas las pruebas estén correctas:

```powershell
git status
git diff --stat

git add api database docs scripts src

git commit -m "feat(admin): implement user and role management"

git push -u origin feat/fase-15-users
```

No hacer merge a `main` todavía. El cierre global se realizará cuando completemos QA/CI y el release final.

---

## 20. Criterio de cierre de Fase 15

La fase queda completa solamente si:

- [ ] migración 023 aplicada;
- [ ] pruebas SQL correctas;
- [ ] Secret Key solo en backend;
- [ ] redirect URLs configuradas;
- [ ] `/usuarios` reemplaza el placeholder;
- [ ] listado funciona solo para ADMIN;
- [ ] invitación funciona;
- [ ] cuenta existente puede vincularse sin duplicarse;
- [ ] aceptación de invitación y contraseña funciona;
- [ ] cambio de rol funciona;
- [ ] desactivación/reactivación funciona;
- [ ] el último ADMIN está protegido;
- [ ] RLS continúa habilitado;
- [ ] `pytest` pasa;
- [ ] `npm run build` pasa;
- [ ] `npm run lint` pasa;
- [ ] Production E2E pasa;
- [ ] commit y push realizados.

Después de esto, ComercioBI puede avanzar a Fase 16: automatización, QA y CI/CD.
