# Hogar en el plan Free de Supabase

No se paga nada. Un proyecto alcanza para pruebas de la familia.

## 1. Crear el proyecto

1. Entra a [https://supabase.com/dashboard](https://supabase.com/dashboard) y crea cuenta (GitHub sirve).
2. **New project**. Región cerca (por ejemplo `East US` o `South America`).
3. Pon una contraseña de base **y anótala**. No la pongas en GitHub ni en la app.
4. Elige el plan **Free**. Espera a que el proyecto quede `Ready`.

## 2. Pegar el SQL

1. En el menú: **SQL Editor** → **New query**.
2. Copia todo `supabase/schema.sql` de este repo.
3. **Run**. Debe terminar sin error.

## 3. Claves públicas (no la service_role)

1. **Project Settings** → **API**.
2. Copia **Project URL** (`https://xxxx.supabase.co`).
3. Copia **anon public**. Nunca copies **service_role**.

En Mi Nevera, toca la pastilla **Hogar** (arriba a la derecha) y pega esas dos. Quedan en ese teléfono.

Para que toda la familia entre sin pegar claves, en Netlify → Site configuration → Environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Luego **Deploys → Trigger deploy**. Es gratis.

## 4. Correo (enlace mágico)

1. **Authentication** → **URL Configuration**.
2. **Site URL:** `https://mi-nevera.netlify.app`
3. **Redirect URLs:** `https://mi-nevera.netlify.app/**`

El correo de prueba de Supabase deja mandar pocos enlaces por hora. Si se atasca, espera o usa Google.

## 5. Google (también gratis)

1. En Google Cloud: un OAuth Client de tipo Web (es gratis).
2. Authorized redirect: el que muestra Supabase en **Authentication → Providers → Google**.
3. Activa Google y pega Client ID y Secret.
4. En Authorized JavaScript origins: `https://mi-nevera.netlify.app`

## 6. Probar

1. Abre la app → entra con correo o Google.
2. Crea el hogar.
3. **Invitar a la familia** copia un enlace de 7 días.
4. La otra persona abre el enlace, entra, y ya ve la nevera.

Si el proyecto Free se duerme a los 7 días sin uso, enciéndelo otra vez en el panel de Supabase. Los datos no se borran.
