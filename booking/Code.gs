/**
 * Reservas CAPSICOV — Verónica H. Garcia
 * ---------------------------------------------------------------------------
 * Backend de reservas para el sitio web (página estática en GitHub Pages).
 * Corre como TU usuario de Google, así que puede leer tu disponibilidad y
 * crear las citas sin exponer ninguna clave en la web pública.
 *
 * CÓMO FUNCIONA
 *   - Tu DISPONIBILIDAD son los eventos cuyo título contiene "CAPSICOV"
 *     dentro del calendario "Rachel" (RACHEL_CAL). Se lee EN VIVO en cada
 *     visita, así que si te tomas vacaciones o cambias tus horas, la app lo
 *     refleja automáticamente: no hay nada fijo que mantener.
 *   - El script parte esos bloques en huecos de 1 hora (SLOT_MIN) y descarta
 *     los que ya están reservados o chocan con tus calendarios "ocupados".
 *   - Cualquier evento de Rachel cuyo título contenga una PALABRA CLAVE de
 *     paciente (Paciente, Caso, Evaluación, PAI, prueba psicométrica) bloquea
 *     esa hora aunque también diga "CAPSICOV": así nunca aparecen dos
 *     pacientes a la misma hora ni se muestra disponibilidad donde ya hay
 *     alguien agendado.
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

// Palabras clave que BLOQUEAN la hora (un paciente agendado en ese horario).
// Si el título de un evento de Rachel contiene cualquiera de estas, esa hora
// NO aparecerá disponible en el sitio —aunque el título también diga
// "CAPSICOV"—. La comparación ignora mayúsculas y acentos
// (p. ej. "Evaluacion" y "Evaluación" se tratan igual).
var BLOCK_KEYWORDS = ['paciente', 'caso', 'evaluacion', 'pai', 'prueba psicometrica'];

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

// ---- Contador global de aperturas de la app ----
// Cuenta cuántas veces se ha ABIERTO el sitio (en computadora, celular o
// tablet). Se guarda en las propiedades del script, así que es un total real
// y compartido por todas las personas.
var COUNTER_KEY  = 'app_open_count';
var COUNTER_BASE = 0;   // número inicial opcional (p. ej. 1200 para partir de una base)
// =============================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    // Contador de aperturas: ?action=visit suma 1; ?action=count solo consulta.
    if (action === 'visit') return json({ ok: true, count: bumpCounter(1) });
    if (action === 'count') return json({ ok: true, count: bumpCounter(0) });
    return json({ ok: true, slots: getFreeSlots() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Suma "inc" al contador (0 = solo leer) y devuelve el total + la base.
// Usa un candado para no perder conteos cuando entran varias visitas a la vez.
function bumpCounter(inc) {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var n = parseInt(props.getProperty(COUNTER_KEY) || '0', 10) || 0;
    if (inc) { n += inc; props.setProperty(COUNTER_KEY, String(n)); }
    return n + COUNTER_BASE;
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
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
    var title = ev.getTitle() || '';
    var span = [ev.getStartTime().getTime(), ev.getEndTime().getTime()];
    // PRIORIDAD: si el título tiene una palabra clave de paciente, la hora se
    // bloquea aunque también contenga "CAPSICOV".
    if (hasBlockKeyword(title)) {
      busy.push(span);
    } else if (new RegExp(AVAIL_KEYWORD, 'i').test(title)) {
      avail.push(span);
    } else {
      // Cualquier otro evento (p. ej. las citas ya reservadas "Cita: ...")
      // también ocupa el horario.
      busy.push(span);
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

// Quita acentos y pasa a minúsculas para comparar títulos de forma flexible.
function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ¿El título contiene alguna palabra clave de paciente? Usa límites de palabra
// para que claves cortas como "pai" no coincidan dentro de otras palabras
// (p. ej. "país", "espai").
function hasBlockKeyword(title) {
  var t = normalize(title);
  return BLOCK_KEYWORDS.some(function (kw) {
    var k = normalize(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + k + '([^a-z0-9]|$)').test(t);
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
