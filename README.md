# Mi Nevera

Inventario del refrigerador de casa. Al escanear el QR de la puerta se abre el **registro de lo que hay**, para ver qué falta y qué comprar.

## Cómo usarla

1. Entra a la página (enlace de Netlify).
2. Pulsa **Registrar** y anota cada producto: cantidad, mínimo y caducidad.
3. La pantalla **Inventario** muestra primero qué hay, qué está bajo y qué caduca.
4. **Compras** arma la lista de lo que hay que reponer.
5. En **QR**, imprime el código y pégalo en la nevera.

## Publicar

- GitHub: este repositorio.
- Netlify: conectar el repo y publicar la carpeta raíz. La función `/api/inventario` guarda el inventario en la nube para que toda la casa vea lo mismo al escanear el QR.

Si la nube no está disponible, la app guarda una copia en el teléfono.
