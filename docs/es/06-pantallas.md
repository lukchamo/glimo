# Pantallas de diseño

Lienzo en vivo: https://claude.ai/artifact/1uxMU24XS7LboqoeDiaPvu

Los archivos `design/canvas/*.dc.html` son el código fuente de cada pantalla del lienzo. Usan el formato de componentes del lienzo de diseño (HTML con plantillas `{{...}}`, `<sc-for>`, `<sc-if>` y `<dc-import>`), así que no abren tal cual en un navegador: sirven como referencia exacta de estructura, textos, colores, tamaños y comportamiento para construirlas en React. `design/canvas/canvas.json` describe el lienzo (páginas, posiciones y tamaños).

## Página Marca

| Archivo           | Pantalla                            | Qué contiene                                                                                         |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Main.dc.html`    | Marca Glimo                         | Logotipo, idea, principios, color, tipografía, logotipo y símbolo, voz                               |
| `Estados.dc.html` | Sistema de estados                  | Los 8 estados con su clave técnica, cuándo ocurren y su acción                                       |
| `Glim.dc.html`    | Componente Glim                     | El avatar parametrizable (estado, tamaño, color, ojos, señal). Lo importan todas las demás pantallas |
| `App.dc.html`     | App móvil: la vitrina (interactiva) | Resumen, mundos, rejilla de 9 glims, hoja con acciones, navegación                                   |

## Página Homes

| Archivo         | Pantalla                                          | Qué contiene                                                                              |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `HomeA.dc.html` | Home A: La vitrina (recomendada)                  | Héroe con la vitrina en vivo e instalación, estados, 3 pasos, skills, spec, llamada final |
| `HomeB.dc.html` | Home B: Mundos                                    | Tres mundos con los mismos agentes, crear tu mundo, tienda, publicar                      |
| `HomeC.dc.html` | Home C: Skills primero (recomendada para /skills) | Buscador, franja de vitrina, directorio filtrable, publicar                               |

## Página Producto

| Archivo             | Pantalla                                      | Qué contiene                                                                                                                                                             |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Mundo.dc.html`     | Mundo vivo y vista desde dentro (interactiva) | Oficina con actividades cotidianas e interacción entre glims, columna "Ahora mismo"; al tocar un glim, vista Panel con lo que ve, lo que piensa, herramientas y acciones |
| `Inmersiva.dc.html` | Modo inmersivo (interactiva)                  | Espacio en primera persona con información flotante por prioridad, glims en el horizonte y barra para saltar                                                             |
| `Cifrado.dc.html`   | Alta con frase de cifrado (interactiva)       | Cerebro, 12 palabras, comprobación, resumen                                                                                                                              |
| `Acuerdo.dc.html`   | Glimos de acuerdo (futuro)                    | Tres glimos cuadran una cena con regla de mayoría                                                                                                                        |

## Notas para construir

- Los datos (agentes, correos, licitaciones, cifras) son de ejemplo.
- El componente Glim ya está portado a React en `reference/react/Glim.tsx`.
- Los colores y tipografías están en `design/tokens/`.
- Los SVG de los 8 estados, el icono y el logotipo están en `design/assets/`.
