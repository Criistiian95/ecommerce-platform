# Prueba del frontend estático

Esta entrada reutiliza las pantallas y estilos existentes. Vite genera archivos
estáticos y React Router resuelve las direcciones en el navegador. El despliegue
Next actual conserva sus comandos, proxy, layouts y metadatos del servidor.

## Ejecutar y verificar

Desde `frontend`, con Node 22.12 o superior:

```sh
npm ci
npm test
NEXT_PUBLIC_API_URL=https://ecommerce-platform-api-2kh1.onrender.com npm run build:static
npx playwright install --with-deps chromium
npm run test:static
npm run preview:static
```

Las seis pruebas de navegador interceptan todas las solicitudes a la API. Usan
datos de prueba para catálogo, personalización, acceso de clientes y pagos; no
escriben en la base real, no envían emails y no cobran dinero. La prueba de pago
comprueba la navegación, el pedido enviado y el regreso al comercio; no valida
una transacción real de Mercado Pago.

## Publicar una vista previa en Render

Usar `render.static-preview.yaml` como Blueprint independiente, o crear un Static
Site con esta rama y estos valores:

- Build: `cd frontend && npm ci && npm run build:static`.
- Publish directory: `frontend/dist-static`.
- Variables públicas: `NEXT_PUBLIC_API_URL` (servidor real),
  `NEXT_PUBLIC_STOREFRONT_DOMAIN=disenolys.store` y `NODE_VERSION=22`.
- Rewrite `/*` → `/index.html` (para abrir/recargar enlaces de tiendas y productos).
- Headers del Blueprint: sin indexación, sin referrer, `nosniff` y `SAMEORIGIN`.
  El personalizador necesita su iframe del mismo origen.
- Agregar el origen exacto de la nueva vista previa a `CORS_ORIGINS` en la API,
  conservando todos los orígenes existentes. No usar comodines globales.

El build no consulta la API ni enumera comercios: las altas posteriores al build
son accesibles inmediatamente. Solo las tres variables públicas explícitas de
`vite.config.mts` se incorporan al bundle; nunca agregar credenciales del servidor.

El servidor de datos debe estar activo para probar con datos reales. Si está
suspendido, la interfaz informa el problema y permite reintentar; no sustituye
el comercio por la demo. El cambio a un Static Site no reactiva la API.

## Pendiente antes de trasladar el dominio de producción

Esta rama es una prueba y lleva `noindex,nofollow`. Las páginas actualizan el título
y la descripción en el navegador, pero los bots que no ejecutan JavaScript
reciben un HTML genérico. Tampoco hay un HTTP 404 por comercio inexistente:
el CDN devuelve el shell con 200 y la interfaz muestra el error.

Para preservar los metadatos por comercio, las vistas previas en redes y los
estados HTTP actuales, falta una solución de generación/entrega de HTML por URL.
No quitar `noindex` ni trasladar el dominio hasta resolver y comprobar ese punto.

También falta comprobar contra la API activa: permisos/CORS, sesión real,
persistencia de cambios, stock real y retorno de Mercado Pago. Sus URLs de
retorno actualmente apuntan al frontend de producción; cualquier cambio para
pruebas debe hacerse en un entorno aislado. Mantener las claves y el aislamiento
por comercio, verificar subdominios con DNS/TLS real y conservar el despliegue
anterior para revertir el traslado.

El sitio estático no tiene cargo de cómputo, pero Render mantiene límites de
tráfico/build y posibles adicionales. Este Blueprint no contrata un plan de API.
