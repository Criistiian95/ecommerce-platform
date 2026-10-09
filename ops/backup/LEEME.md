# Copias cifradas de ecommerce

Adaptado del respaldo de `Criistiian95/Sistema-de-Turnos`. No modifica Sismed.
La tarea está preparada, pero NO está activa hasta configurar el secreto,
confirmar la clave de recuperación y habilitar `BACKUP_ENABLED`.
Una prueba verde con datos ficticios no es un respaldo de producción.

## Activación

1. Conservar la clave privada original `Sismed-clave-respaldo.pem` en dos lugares
   privados. El certificado público `recipient.pem` es el mismo de Sismed:
   esa clave permite recuperar las copias de ambos proyectos. No subir la clave
   privada a GitHub, Actions, Railway ni enviarla por chat. Si no se conserva,
   generar un nuevo par y reemplazar este certificado ANTES de habilitar copias.
2. En este repositorio → Settings → Secrets and variables → Actions → Secrets,
   crear `BACKUP_DATABASE_URL` copiando la conexión de la tienda desde Render.
   Debe apuntar a `roundhouse.proxy.rlwy.net:49500/ecommerce`; el script rechaza
   cualquier base con otro nombre. No usar la conexión por defecto de Sismed.
   Preferir un usuario exclusivo con SELECT, SHOW VIEW y TRIGGER sobre ecommerce.
   El secreto no debe aparecer en commits, capturas, comandos ni logs.
3. En Actions → Variables, crear `BACKUP_ENABLED` con valor `true` únicamente
   cuando la clave privada esté guardada. No es un secreto.
4. Actions → **Respaldo cifrado ecommerce** → Run workflow → main.
   Comprobar ejecución verde y artifact `ecommerce-cifrado-...` descargable.
5. Descargar la primera copia y verificar recuperación en una base vacía aislada.

## Qué incluye y límites

- Esquema, tablas, datos, índices, claves foráneas y triggers de ecommerce.
- Productos, clientes, pedidos, stock, fotos y logos guardados en columnas BLOB.
- Imágenes externas: se conserva su URL, no el archivo del servidor externo.
- Incluye credenciales cifradas de Mercado Pago. Guardar por separado, en un gestor
  privado, `MP_TOKEN_ENCRYPTION_KEY` y la configuración de Render necesaria para
  recuperar la aplicación. La copia SQL no incluye variables de entorno, grants,
  usuarios MySQL, rutinas ni eventos del servidor.
- Transacción consistente para InnoDB: no ejecutar migraciones/DDL durante la copia.
- TLS obligatorio. El certificado autofirmado del servidor no se verifica por identidad;
  para endurecer la conexión se necesita una CA confiable y VERIFY_IDENTITY.
- GitHub solo recibe SQL comprimido y cifrado con AES-256-GCM y RSA-OAEP.
  Nunca se sube SQL legible. Los artifacts del repositorio público pueden ser accesibles
  a terceros, por eso la clave privada queda fuera de GitHub.

## Programación

Todos los días 07:37 UTC (04:37 Argentina), retención solicitada de 7 días.
Puede ejecutarse manualmente. GitHub puede demorar o desactivar tareas programadas;
verificar ejecuciones y activar notificaciones de fallos. No garantiza horario exacto.
Descargar las copias que se quieran conservar antes de vencer. El almacenamiento,
Actions y la transferencia de Railway están sujetos a las cuotas de cada cuenta.

## Recuperación aislada

Requiere Linux/WSL, Python 3.11+, Docker y OpenSSL 3. Descargar y descomprimir el artifact.
Verificar el checksum desde su carpeta: `sha256sum -c archivo.sql.gz.cms.sha256`.

Para descifrar sin conectar a la base:

```bash
python3 ops/backup/backup.py decrypt archivo.sql.gz.cms --key /ruta/privada/Sismed-clave-respaldo.pem --output recuperacion.sql
```

Para restaurar, crear una base vacía en un servidor de prueba cuyo nombre termine
en `_restore`. Usar credenciales con permisos SOLO sobre esa base, nunca el usuario
de producción. La herramienta rechaza destinos no vacíos y elimina sesiones antiguas.

```bash
read -rsp 'URL de la base de prueba: ' RESTORE_DATABASE_URL
echo
export RESTORE_DATABASE_URL
docker pull mysql:8.4
python3 ops/backup/backup.py restore archivo.sql.gz.cms --key /ruta/privada/Sismed-clave-respaldo.pem
unset RESTORE_DATABASE_URL
```

No levantar la API ni workers contra la copia recuperada con credenciales reales:
podrían enviar correos o reconciliar pagos. Comparar tablas, cantidades, imágenes
y pedidos antes de planificar por separado una recuperación de producción.
Una importación fallida puede dejar tablas parciales; repetir en otra base vacía.

## Verificación automática

`python3 -m unittest discover -s ops/backup -p 'test_*.py'` verifica cifrado,
alteraciones del archivo, destinos protegidos y rechazo de otra base de origen.
El workflow **Verificar recuperación de respaldo** usa MySQL efímero, las migraciones
reales y datos ficticios: compara esquema, datos binarios y Unicode, comprueba que
las sesiones se invalidan y que una segunda restauración no sobrescribe datos.
No accede a Railway ni usa secretos de producción.
