# Guía de marca

Fuente visual: páginas "Marca" del lienzo (`design/canvas/Main.dc.html`, `Estados.dc.html`, `Glim.dc.html`).

## Nombre

**Glimo**, de _glimpse_ (vistazo). Cada avatar es un **glim**. Se escribe en minúscula en el logotipo y con mayúscula inicial en texto corrido.

Lema: **Tus agentes, de un vistazo.**

## Logotipo

- Palabra "glim" en Unbounded ExtraBold (800), espaciado de letras −0,045 em, seguida de un glim que hace de **o**.
- El glim mide aproximadamente la altura de la x y se apoya en la línea base.
- Versiones:
  - Sobre Ultramar: texto blanco, glim blanco con ojos Ultramar.
  - Sobre claro: texto Tinta, glim Ultramar con ojos blancos.
- Símbolo (icono de app y favicon): el glim solo, dentro de un cuadrado redondeado (radio aproximado del 29 % del lado).
- Archivos en `design/assets/`: `glimo-logo.svg`, `glimo-logo-on-ultramar.svg`, `glimo-icon.svg`, `favicon.svg`. El texto del logotipo ya está convertido a trazos (Unbounded 800), así que no depende de tener la fuente instalada.

## Color

### Base

| Nombre           | Hex                   | Uso                                                  |
| ---------------- | --------------------- | ---------------------------------------------------- |
| Ultramar         | `#2B34D6`             | Color de marca, botones principales, fondos de héroe |
| Tinta            | `#15173A`             | Texto, fondos oscuros, burbujas                      |
| Nube             | `#F3F4FB`             | Fondo de la app                                      |
| Blanco           | `#FFFFFF`             | Superficies y tarjetas                               |
| Texto secundario | `#2C2F5A` / `#4B4F7A` | Párrafos y etiquetas                                 |
| Línea            | `#D9DCEE` / `#E3E5F2` | Bordes y separadores                                 |

### Estados

| Estado     | Nombre      | Hex                    | Ojos                  | Señal                   |
| ---------- | ----------- | ---------------------- | --------------------- | ----------------------- |
| `idle`     | Listo       | `#FFFFFF` (con anillo) | Puntos                | Ninguna                 |
| `thinking` | Pensando    | `#B9A6FF`              | Puntos mirando arriba | Burbujas de pensamiento |
| `working`  | Trabajando  | `#FF8A3D`              | Concentrados          | Anillo de progreso      |
| `waiting`  | Te espera   | `#FFD43B`              | Grandes, abiertos     | "!"                     |
| `blocked`  | Bloqueado   | `#F0525A`              | X                     | Ninguna                 |
| `done`     | Hecho       | `#5BC7F5`              | Felices (arcos)       | Check                   |
| `tired`    | Sin energía | `#8E93B5`              | Caídos                | Batería baja            |
| `sleeping` | Durmiendo   | `#C9CDE3`              | Cerrados (líneas)     | "z z"                   |

Regla: el estado nunca se comunica solo con el color. Siempre va con forma de ojos y señal, y con su nombre cuando hay espacio.

### Mundos

| Mundo     | Fondo     | Estante o suelo                  |
| --------- | --------- | -------------------------------- |
| Oficina   | `#FFFFFF` | `#D9DCEE`                        |
| Jardín    | `#DDF3E4` | `#9FD3AF`                        |
| Órbita    | `#1C1F5C` | `#3A3F8F`                        |
| Inmersivo | `#12146A` | Rejilla `rgba(140,147,240,0.30)` |

## Tipografía

| Rol                  | Fuente                | Pesos                   |
| -------------------- | --------------------- | ----------------------- |
| Logotipo y titulares | Unbounded             | 600, 700, 800           |
| Texto e interfaz     | Figtree               | 400, 500, 600, 700, 800 |
| Código               | Monospace del sistema | 400                     |

Google Fonts: `https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700;800&display=swap`

Escala usada: titulares 24–88 px (con `clamp`), texto 15–20 px, etiquetas mínimo 12 px.

## Forma

- Radios generosos: tarjetas 20–28 px, paneles 32–40 px, botones 12–16 px.
- Una sola sombra fuerte por pantalla como mucho, para lo que flota.
- Objetivos táctiles de 44 px o más.

## Voz

Habla como un compañero que avisa, no como una alarma. Primero el agente, después lo que pasa.

| Sí                                                        | No                                       |
| --------------------------------------------------------- | ---------------------------------------- |
| Ventas te espera: quiere enviar 12 correos.               | Acción pendiente de aprobación (ID 4821) |
| Facturas se quedó sin energía: llegó al límite de la API. | Error 429: rate limit exceeded           |
| Datos está bloqueado: su credencial caducó.               | Fallo de autenticación en el conector    |
| No necesita nada de ti ahora.                             | Sin incidencias                          |

Botones: verbo concreto y el mismo nombre en todo el flujo ("Aprobar envío" lleva a "Envío aprobado").

## Lo que evitamos

- Emojis en la interfaz.
- Etiquetas en mayúsculas sostenidas sobre cada título.
- Degradados decorativos y tarjetas con borde de color a la izquierda.
- Flechas añadidas al texto de los botones.
- Estados que solo se distinguen por el color.
