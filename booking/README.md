# Reservas CAPSICOV — conexión con Google Calendar

El sitio es una página **estática** (GitHub Pages), así que no puede escribir en
tu Google Calendar por sí solo. Este pequeño backend en **Google Apps Script**
corre con **tu** cuenta y hace el trabajo de forma segura: muestra solo tu
disponibilidad y crea las citas. Ninguna clave queda expuesta en la web.

## Cómo funciona
- Tu **disponibilidad** son los eventos cuyo título contiene `CAPSICOV` dentro
  del calendario **Rachel**.
- El script los divide en huecos de **1 hora** y descarta los ya reservados.
- Al reservar, crea un evento `Cita: <nombre>` en el calendario **Rachel** e
  **invita por correo** a la persona. Tu calendario personal nunca se muestra.

## Pasos para publicarlo (una sola vez)
1. Entra a **https://script.google.com** con la cuenta
   `veronica.harrington.arraez@gmail.com`.
2. **Nuevo proyecto** → borra lo que haya en `Code.gs` y **pega el contenido de
   [`Code.gs`](./Code.gs)**.
3. Arriba a la derecha: **Implementar → Nueva implementación**.
   - Tipo (rueda dentada): **Aplicación web**.
   - **Ejecutar como:** Yo (tu cuenta).
   - **Quién tiene acceso:** Cualquier persona.
   - **Implementar** → autoriza los permisos que pida.
4. Copia la **URL de la aplicación web** (termina en `/exec`).
5. **Pásame esa URL** y la pego en el sitio (variable `BOOKING_API`). Listo: los
   botones "Agendar consulta" abrirán el calendario de reservas conectado a tu
   disponibilidad real.

## Ajustes rápidos (opcional, dentro de `Code.gs`)
- `SLOT_MIN` — duración de la cita (por defecto **60** min).
- `DAYS_AHEAD` — cuántos días hacia adelante se ofrecen (por defecto **21**).
- `LEAD_HOURS` — antelación mínima para reservar (por defecto **2** h).
- `BUSY_CALS` — agrega `'veronica.harrington.arraez@gmail.com'` si quieres que
  tus eventos personales también bloqueen huecos.

> Si cambias el código después, vuelve a **Implementar → Gestionar
> implementaciones → editar (lápiz) → Versión: Nueva → Implementar** para que los
> cambios tomen efecto en la misma URL.
