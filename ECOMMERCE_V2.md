# E-commerce v2

Nueva versión comercial de Mercado Liebre.

## Objetivo
Construir una plataforma e-commerce multi-comercio que pueda venderse a distintos negocios sin duplicar el código base.

## Stack
- Frontend: Next.js 16 + React 19 + TypeScript
- Backend: Node.js + NestJS 12 + TypeScript
- Base de datos: MySQL
- ORM: Sequelize
- Autenticación: JWT + bcrypt + sesiones revocables
- Pagos: Mercado Pago (fase siguiente)

## Principios
- Base de datos separada de Sismed.
- Reutilizar el enfoque de autenticación, roles y sesiones de Sismed, no sus datos.
- Todo recurso comercial deberá quedar asociado a un commerceId.
- El Mercado Liebre original queda intacto en master mientras se desarrolla esta rama.

## Estructura
```
backend/   API NestJS
frontend/  Tienda Next.js
docker-compose.v2.yml  MySQL local
```

## Roles iniciales
- superadmin: administración global de la plataforma
- admin: dueño/administrador de un comercio
- operator: personal del comercio
- customer: reservado para cuentas de compradores

## Próximos módulos
Productos, categorías, variantes, stock, carrito, clientes, pedidos, pagos, envíos, cupones y métricas.

## Permisos de administración

### superadmin
Administración global de la plataforma. Se usará para gestionar comercios y soporte general.

### admin
Administrador/propietario de un comercio. Actualmente puede:
- crear y consultar categorías de su comercio;
- crear y consultar productos de su comercio;
- definir precio, stock inicial y stock mínimo;
- ajustar stock;
- consultar el historial de movimientos de stock.

Todos los recursos quedan filtrados por `commerceId`.

### operator
Rol reservado para operaciones diarias. En una fase posterior tendrá permisos limitados, por ejemplo pedidos y movimientos de stock, sin acceso a configuración sensible.

### customer
Cuenta de comprador. No tiene acceso al panel administrativo.
