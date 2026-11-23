# Privacidad y cifrado

Principio: **todo lo personal se cifra con una llave que solo tiene la persona.** Glimo (el servidor, la empresa, la sincronización) no puede leer los datos.

Pantalla de referencia: `design/canvas/Cifrado.dc.html`.

## Alta

1. La persona elige el cerebro (Claude con su plan, Claude con clave de API o modelo local).
2. Se genera una **frase de 12 palabras** (estándar BIP39, con lista de palabras en español).
3. La persona la copia o imprime y marca: "La guardé en un lugar seguro, fuera de este móvil. Entiendo que si la pierdo, pierdo mis datos."
4. Se le pide una palabra concreta (por ejemplo, la número 4) para comprobar que la guardó. Sin acertar no puede seguir.
5. Pantalla final con lo que queda cifrado y lo que no.

## Jerarquía de llaves (propuesta)

```
frase de 12 palabras
   └─ semilla (BIP39)
        └─ llave maestra (HKDF o Argon2id)
             ├─ llave de datos por agente   → memorias, pensamientos, punto de vista
             ├─ llave de sincronización     → blobs que viajan a la nube
             └─ llave de firma              → identidad del glimo (acuerdos, publicar skills)
```

- Cifrado simétrico: XChaCha20-Poly1305 (libsodium).
- La frase y la llave maestra nunca salen del dispositivo y no se guardan en claro.
- En el dispositivo, la llave maestra se protege con el llavero del sistema (Keychain, Keystore) y biometría.
- Nuevo dispositivo: se vincula escaneando un QR desde uno ya vinculado (transfiere la llave envuelta) o escribiendo la frase.

## Qué se cifra

| Dato                              | Cifrado           | Dónde vive                          |
| --------------------------------- | ----------------- | ----------------------------------- |
| Memorias de cada agente           | Sí                | Local + copia cifrada en R2         |
| Pensamientos ("Lo que piensa")    | Sí                | Local + copia cifrada               |
| Punto de vista ("Lo que ve")      | Sí                | Local, no se sincroniza por defecto |
| Credenciales de servidores MCP    | Sí                | Solo local (llavero del sistema)    |
| Configuración de agentes y mundos | Sí                | Local + copia cifrada               |
| Skills públicas                   | No (son públicas) | Tienda                              |

## Lo que hay que decir con honestidad

- **El cifrado cubre lo que se guarda y lo que se sincroniza.** Para pensar, el glim descifra en el dispositivo y envía al modelo solo lo que cada tarea necesita. Con Claude, eso viaja a Anthropic bajo sus términos. Con un modelo local, no sale nada de casa.
- **No hay recuperación.** Si la persona pierde la frase y todos sus dispositivos, pierde sus datos. Por eso la comprobación es obligatoria y se ofrece imprimir la frase.
- Copy propuesto: "Para pensar, tu glim envía a Claude solo lo que cada tarea necesita."

## Acuerdos entre glimos (futuro)

- Cada glimo comparte solo lo mínimo para el acuerdo: huecos libres, zona aproximada y gustos relevantes.
- Nunca la agenda completa, correos ni memorias.
- La negociación va firmada con la llave de firma de cada glimo, por un canal cifrado de un solo uso.
- Protocolo candidato: A2A (agente a agente), con regla de decisión configurable (unanimidad o mayoría).

## Amenazas consideradas

| Amenaza                              | Mitigación                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Acceso al servidor de sincronización | Solo hay blobs cifrados                                                        |
| Skill maliciosa que exfiltra datos   | Permisos declarados, revisión, firma, aprobación de acciones sensibles         |
| Robo del móvil                       | Llave en el llavero del sistema + biometría; revocar el dispositivo desde otro |
| Pérdida de la frase                  | Comprobación en el alta, opción de imprimir; recuperación social a estudiar    |
