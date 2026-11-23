# Despliegue en Cloudflare (glimo.dev)

El dominio glimo.dev está comprado en Cloudflare. Propuesta de cómo usarlo.

> El dominio .dev está en la lista de precarga HSTS de los navegadores: solo funciona con HTTPS. Cloudflare emite el certificado automáticamente.

## Mapa de dominios

| Dirección          | Qué sirve                                       | Servicio                               |
| ------------------ | ----------------------------------------------- | -------------------------------------- |
| `glimo.dev`        | Landing (Home A)                                | Worker con archivos estáticos          |
| `www.glimo.dev`    | Redirección a `glimo.dev`                       | Regla de redirección                   |
| `glimo.dev/skills` | Tienda de skills (Home C)                       | Worker `registry` + D1 + R2            |
| `glimo.dev/spec`   | Glimo Spec y JSON Schema públicos               | Archivos estáticos                     |
| `app.glimo.dev`    | App web (vitrina, mundo vivo, panel, inmersiva) | Worker con archivos estáticos          |
| `api.glimo.dev`    | Sincronización cifrada y canal en vivo          | Worker `sync` + Durable Objects + R2   |
| `hola@glimo.dev`   | Correo de contacto                              | Email Routing hacia el correo personal |

## Servicios

| Necesidad                 | Servicio de Cloudflare                          | Por qué                                                            |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Web y app                 | Workers con archivos estáticos                  | Un solo despliegue, dominio propio, gratis para empezar            |
| Canal en vivo por vitrina | Durable Objects (uno por vitrina) con WebSocket | Reparte los cambios de estado entre los dispositivos de la persona |
| Blobs cifrados            | R2                                              | Barato, sin coste de salida; solo guarda datos que no puede leer   |
| Índice de la tienda       | D1                                              | Búsqueda y metadatos de skills                                     |
| Revisión de skills        | Queues + Worker                                 | Revisión de seguridad asíncrona antes de publicar                  |
| Paquetes de skills        | R2                                              | Archivos firmados                                                  |

## Pasos

1. Comprobar en el panel de Cloudflare que la zona glimo.dev está activa (si se compró con Cloudflare Registrar, ya lo está).
2. Crear el proyecto de la landing con Wrangler y conectarle el dominio propio `glimo.dev`.
3. Añadir la redirección de `www.glimo.dev` a `glimo.dev`.
4. Activar Email Routing y crear `hola@glimo.dev`.
5. Más adelante, crear `app.glimo.dev` y `api.glimo.dev` como dominios propios de sus Workers.

## Configuración de ejemplo (landing)

```jsonc
// apps/web/wrangler.jsonc
{
  "name": "glimo-web",
  "compatibility_date": "2026-11-23",
  "assets": { "directory": "./dist", "not_found_handling": "404-page" },
  "routes": [{ "pattern": "glimo.dev", "custom_domain": true }]
}
```

## Configuración de ejemplo (sincronización)

```jsonc
// workers/sync/wrangler.jsonc
{
  "name": "glimo-sync",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-23",
  "routes": [{ "pattern": "api.glimo.dev", "custom_domain": true }],
  "durable_objects": { "bindings": [{ "name": "VITRINA", "class_name": "Vitrina" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Vitrina"] }],
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "glimo-blobs" }]
}
```

Revisa los nombres de campos con la documentación actual de Wrangler al crear los proyectos.
