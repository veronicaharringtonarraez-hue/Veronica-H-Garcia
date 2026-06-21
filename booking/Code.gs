/**
 * Reservas CAPSICOV — Verónica H. Garcia
 * ---------------------------------------------------------------------------
 * Backend de reservas para el sitio web (página estática en GitHub Pages).
 * Corre como TU usuario de Google, así que puede leer tu disponibilidad y
 * crear las citas sin exponer ninguna clave en la web pública.
 *
 * CÓMO FUNCIONA
 *   - Tu DISPONIBILIDAD son los eventos cuyo título contiene "CAPSICOV"
 *     dentro del calendario "Rachel" (RACHEL_CAL).
 *   - El script parte esos bloques en huecos de 1 hora (SLOT_MIN) y descarta
 *     los que ya están reservados o chocan con tus calendarios "ocupados".
 *   - Cuando alguien reserva, crea un evento "Cita: <nombre>" en el calendario
 *     Rachel e invita por correo a la persona.
 *
 * DESPLIEGUE (una sola vez):
 *   1. Ve a https://script.google.com  (con la cuenta veronica.harrington.arraez@gmail.com).
 *   2. Nuevo proyecto → pega TODO este archivo en "Code.gs".
 *   3. Implementar → Nueva implementación → tipo "Aplicación web".
 *        - Ejecutar como:  Yo (tu cuenta)
 *        - Quién tiene acceso:  Cualquier persona
 *   4. Autoriza los permisos cuando lo pida.
 *   5. Copia la URL que termina en /exec y pásamela: yo la pego en el sitio.
 * ---------------------------------------------------------------------------
 */

// ======================= CONFIGURACIÓN =======================
// Calendario "Rachel" (donde están tus bloques "CAPSICOV Verónica").
var RACHEL_CAL = 'bea3e1fd21b905353477b997ed78fb06665324e6abcba117c1b75aa913ac05a5@group.calendar.google.com';

// Palabra que identifica tus bloques de disponibilidad por su título.
var AVAIL_KEYWORD = 'CAPSICOV';

var SLOT_MIN     = 60;   // duración de cada cita (minutos)
var DAYS_AHEAD   = 21;   // cuántos días hacia adelante se ofrecen
var LEAD_HOURS   = 2;    // antelación mínima para reservar (horas)

// Calendarios extra a revisar para NO chocar con otros compromisos (opcional).
// Deja [] para considerar solo las reservas ya hechas en Rachel, o agrega tu
// calendario personal para que también bloquee esos huecos, p. ej.:
//   var BUSY_CALS = ['veronica.harrington.arraez@gmail.com'];
var BUSY_CALS = [];

// Prefijo del título de las citas creadas (NO debe contener AVAIL_KEYWORD).
var BOOKING_PREFIX = 'Cita: ';
// =============================================================

function doGet(e) {
  try {
    return json({ ok: true, slots: getFreeSlots() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action !== 'book') return json({ ok: false, error: 'Acción no válida' });
    if (!d.start || !d.name || !d.email) return json({ ok: false, error: 'Faltan datos' });

    var start = new Date(d.start);
    var iso = start.toISOString();
    if (getFreeSlots().indexOf(iso) < 0) {
      return json({ ok: false, error: 'Ese horario ya no está disponible' });
    }
    var end = new Date(start.getTime() + SLOT_MIN * 60000);
    var desc = 'Reserva desde el sitio web.\n'
      + 'Nombre: ' + d.name + '\n'
      + 'Correo: ' + d.email + '\n'
      + 'WhatsApp/Tel: ' + (d.phone || '-') + '\n'
      + 'Motivo: ' + (d.note || '-')
      + (d.topic ? ('\nSección de interés: ' + d.topic) : '');
    CalendarApp.getCalendarById(RACHEL_CAL).createEvent(
      BOOKING_PREFIX + d.name, start, end,
      { description: desc, guests: d.email, sendInvites: true }
    );
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function getFreeSlots() {
  var now = new Date();
  var from = new Date(now.getTime() + LEAD_HOURS * 3600000);
  var to = new Date(now.getTime() + DAYS_AHEAD * 86400000);
  var rachel = CalendarApp.getCalendarById(RACHEL_CAL);
  var events = rachel.getEvents(now, to);

  var avail = [];
  var busy = [];
  events.forEach(function (ev) {
    if (new RegExp(AVAIL_KEYWORD, 'i').test(ev.getTitle() || '')) {
      avail.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
    } else {
      busy.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
    }
  });
  // Otros calendarios marcados como ocupados (opcional).
  BUSY_CALS.forEach(function (id) {
    var c = CalendarApp.getCalendarById(id);
    if (!c) return;
    c.getEvents(now, to).forEach(function (ev) {
      busy.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
    });
  });

  var step = SLOT_MIN * 60000;
  var seen = {};
  var slots = [];
  avail.forEach(function (w) {
    for (var s = w[0]; s + step <= w[1]; s += step) {
      var e2 = s + step;
      if (s < from.getTime()) continue;
      var clash = busy.some(function (b) { return s < b[1] && e2 > b[0]; });
      if (clash) continue;
      var iso = new Date(s).toISOString();
      if (!seen[iso]) { seen[iso] = 1; slots.push(iso); }
    }
  });
  slots.sort();
  return slots;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
