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
// Tu calendario CAPSICOV (antes se llamaba "Rachel"; el ID no cambió).
var RACHEL_CAL = 'bea3e1fd21b905353477b997ed78fb06665324e6abcba117c1b75aa913ac05a5@group.calendar.google.com';

// Palabra que identifica tus bloques de disponibilidad por su título.
var AVAIL_KEYWORD = 'CAPSICOV';

// Palabras clave que BLOQUEAN la hora (un paciente agendado en ese horario).
// Si el título de un evento de Rachel contiene cualquiera de estas, esa hora
// NO aparecerá disponible en el sitio —aunque el título también diga
// "CAPSICOV"—. La comparación ignora mayúsculas y acentos
// (p. ej. "Evaluacion" y "Evaluación" se tratan igual).
var BLOCK_KEYWORDS = ['paciente', 'sesion', 'atencion', 'caso', 'evaluacion', 'valoracion', 'pai', 'prueba psicometrica', 'cita', 'consulta', 'terapia'];

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

// ---- Reservas con confirmación (el paciente solicita, tú confirmas) ----
// Cuando alguien reserva, se crea una SOLICITUD pendiente en tu calendario y
// te llega un correo con un botón "Confirmar" y otro "No disponible". El
// horario queda bloqueado mientras decides. Al pulsar "Confirmar", el paciente
// recibe el correo de confirmación (y la invitación a su calendario).
var PENDING_PREFIX = 'Solicitud (por confirmar): ';
// A qué correo llega el aviso para confirmar. Vacío = tu propia cuenta.
var NOTIFY_EMAIL   = '';
// Zona horaria y nombre para los correos.
var TIMEZONE  = 'America/Costa_Rica';
var FROM_NAME = 'Verónica H. Garcia · CAPSICOV';
// WhatsApp de contacto que se muestra en los correos.
var CONTACT_WA = '+506 7077 3517';

// ---- Contador global de aperturas de la app ----
// Cuenta cuántas veces se ha ABIERTO el sitio (en computadora, celular o
// tablet). Se guarda en las propiedades del script, así que es un total real
// y compartido por todas las personas.
var COUNTER_KEY  = 'app_open_count';
var COUNTER_BASE = 100;   // número inicial: el contador parte desde aquí
// =============================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    // Contador de aperturas: ?action=visit suma 1; ?action=count solo consulta.
    if (action === 'visit') return json({ ok: true, count: bumpCounter(1) });
    if (action === 'count') return json({ ok: true, count: bumpCounter(0) });
    // Tú confirmas o rechazas una solicitud desde el correo que te llega.
    if (action === 'confirm') return htmlPage(handleDecision(e, true));
    if (action === 'decline') return htmlPage(handleDecision(e, false));
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) {
      return json({ ok: false, error: 'El correo no parece válido' });
    }

    var start = new Date(d.start);
    var iso = start.toISOString();
    if (getFreeSlots().indexOf(iso) < 0) {
      return json({ ok: false, error: 'Ese horario ya no está disponible' });
    }
    var end = new Date(start.getTime() + SLOT_MIN * 60000);
    var desc = 'Solicitud desde el sitio web (por confirmar).\n'
      + 'Nombre: ' + d.name + '\n'
      + 'Correo: ' + d.email + '\n'
      + 'WhatsApp/Tel: ' + (d.phone || '-') + '\n'
      + 'Motivo: ' + (d.note || '-')
      + (d.topic ? ('\nSección de interés: ' + d.topic) : '');

    // Se crea como SOLICITUD pendiente: NO se invita al paciente todavía, así
    // no recibe confirmación hasta que tú la apruebes. El horario queda
    // bloqueado porque cualquier evento sin la palabra de disponibilidad
    // cuenta como ocupado.
    var ev = CalendarApp.getCalendarById(RACHEL_CAL).createEvent(
      PENDING_PREFIX + d.name, start, end, { description: desc }
    );
    try { ev.setColor(CalendarApp.EventColor.YELLOW); } catch (e2) {}
    ev.setTag('bk_state', 'pending');
    ev.setTag('bk_email', String(d.email));
    ev.setTag('bk_name', String(d.name));
    ev.setTag('bk_phone', String(d.phone || ''));
    ev.setTag('bk_note', String(d.note || ''));
    ev.setTag('bk_topic', String(d.topic || ''));

    notifyOwner_(ev, start);
    ackPatient_(String(d.email), String(d.name), start);
    return json({ ok: true, pending: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---- Confirmación / rechazo por parte de Verónica (desde el correo) -------

// Token para que los enlaces de confirmar/rechazar no se puedan adivinar.
function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('bk_secret');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('bk_secret', s); }
  return s;
}
function tokenFor_(id) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id + '|' + secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}
function webUrl_() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}
function actionLink_(id, action) {
  return webUrl_() + '?action=' + action + '&id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(tokenFor_(id));
}

function handleDecision(e, confirm) {
  var id = (e && e.parameter && e.parameter.id) || '';
  var t = (e && e.parameter && e.parameter.t) || '';
  if (!id || t !== tokenFor_(id)) return 'Enlace no válido o vencido.';
  var cal = CalendarApp.getCalendarById(RACHEL_CAL);
  var ev = cal.getEventById(id);
  if (!ev) return 'La solicitud ya no existe (quizá se canceló o venció).';
  var state = ev.getTag('bk_state') || '';
  var name = ev.getTag('bk_name') || 'la persona';
  var email = ev.getTag('bk_email') || '';
  var start = ev.getStartTime();
  if (state === 'confirmed') return 'Esta cita ya estaba confirmada. Se avisó a ' + name + '.';

  if (confirm) {
    ev.setTitle(BOOKING_PREFIX + name);
    try { ev.setColor(CalendarApp.EventColor.GREEN); } catch (e2) {}
    ev.setTag('bk_state', 'confirmed');
    if (email) { try { ev.addGuest(email); } catch (e3) {} }
    if (email) confirmPatient_(email, name, start);
    return '✓ Cita confirmada para ' + fmtWhen_(start) + '. Se envió el correo de confirmación a ' + name + '.';
  } else {
    if (email) declinePatient_(email, name, start);
    ev.deleteEvent();
    return 'Solicitud rechazada. Se avisó a ' + name + ' y el horario volvió a quedar libre.';
  }
}

// ---- Correos --------------------------------------------------------------

function ownerEmail_() {
  return NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
}
function fmtWhen_(date) {
  try {
    return new Date(date).toLocaleString('es-CR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE
    }) + ' (hora de Costa Rica)';
  } catch (e) {
    return Utilities.formatDate(new Date(date), TIMEZONE, "d/MM/yyyy HH:mm") + ' (hora de Costa Rica)';
  }
}

// Aviso a Verónica con los botones Confirmar / No disponible.
function notifyOwner_(ev, start) {
  var id = ev.getId();
  var name = ev.getTag('bk_name') || '';
  var email = ev.getTag('bk_email') || '';
  var phone = ev.getTag('bk_phone') || '-';
  var note = ev.getTag('bk_note') || '-';
  var topic = ev.getTag('bk_topic') || '';
  var confirm = actionLink_(id, 'confirm');
  var decline = actionLink_(id, 'decline');
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">'
    + '<h2 style="color:#0D1B2A;">Nueva solicitud de cita</h2>'
    + '<p><b>' + esc_(name) + '</b> solicitó una sesión de 1 hora para:<br><b>' + esc_(fmtWhen_(start)) + '</b></p>'
    + '<p style="margin:0;">Correo: ' + esc_(email) + '<br>WhatsApp/Tel: ' + esc_(phone)
    + '<br>Motivo: ' + esc_(note) + (topic ? ('<br>Sección: ' + esc_(topic)) : '') + '</p>'
    + '<p style="margin:26px 0;">'
    + '<a href="' + confirm + '" style="background:#1f9d55;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;margin-right:10px;">Confirmar cita</a>'
    + '<a href="' + decline + '" style="background:#b0223c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">No disponible</a>'
    + '</p>'
    + '<p style="color:#666;font-size:13px;">Al confirmar, la persona recibe el correo de confirmación. Si no confirmas, el horario sigue reservado hasta que decidas.</p>'
    + '</div>';
  MailApp.sendEmail({
    to: ownerEmail_(),
    replyTo: email || undefined,
    subject: 'Solicitud de cita — ' + name + ' — ' + fmtWhen_(start),
    htmlBody: html,
    name: FROM_NAME
  });
}

// Acuse al paciente de que su solicitud fue recibida.
function ackPatient_(email, name, start) {
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">'
    + '<p>Hola ' + esc_(name) + ',</p>'
    + '<p>Recibimos tu solicitud de sesión para <b>' + esc_(fmtWhen_(start)) + '</b>.</p>'
    + '<p>Verónica la revisará y, en cuanto la confirme, te llegará un correo de <b>confirmación</b>. '
    + 'Este mensaje es solo un acuse de recibo; tu cita aún no está confirmada.</p>'
    + '<p style="color:#666;font-size:13px;">Si necesitas cambiar algo, escríbeme por WhatsApp: ' + esc_(CONTACT_WA) + '.</p>'
    + '<p>Gracias,<br>' + esc_(FROM_NAME) + '</p></div>';
  try {
    MailApp.sendEmail({ to: email, subject: 'Recibimos tu solicitud de cita', htmlBody: html, name: FROM_NAME });
  } catch (e) {}
}

// Confirmación final al paciente (cuando Verónica confirma).
function confirmPatient_(email, name, start) {
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">'
    + '<p>Hola ' + esc_(name) + ',</p>'
    + '<p>¡Tu cita quedó <b>confirmada</b>! Te espero para tu sesión de 1 hora el:</p>'
    + '<p style="font-size:17px;color:#0D1B2A;"><b>' + esc_(fmtWhen_(start)) + '</b></p>'
    + '<p>También recibirás la invitación en tu calendario. Si necesitas reprogramar o cancelar, '
    + 'escríbeme por WhatsApp: ' + esc_(CONTACT_WA) + '.</p>'
    + '<p>Nos vemos pronto,<br>' + esc_(FROM_NAME) + '</p></div>';
  try {
    MailApp.sendEmail({ to: email, subject: 'Tu cita está confirmada ✓', htmlBody: html, name: FROM_NAME });
  } catch (e) {}
}

// Aviso al paciente si el horario no está disponible.
function declinePatient_(email, name, start) {
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">'
    + '<p>Hola ' + esc_(name) + ',</p>'
    + '<p>Gracias por tu solicitud para <b>' + esc_(fmtWhen_(start)) + '</b>. '
    + 'Lamentablemente ese horario ya no está disponible.</p>'
    + '<p>Escríbeme por WhatsApp (' + esc_(CONTACT_WA) + ') y coordinamos otro horario que te sirva. '
    + 'También puedes elegir otro espacio desde el sitio.</p>'
    + '<p>Un abrazo,<br>' + esc_(FROM_NAME) + '</p></div>';
  try {
    MailApp.sendEmail({ to: email, subject: 'Sobre tu solicitud de cita', htmlBody: html, name: FROM_NAME });
  } catch (e) {}
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Página simple que ves tú al confirmar o rechazar desde el correo.
function htmlPage(msg) {
  var html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<div style="font-family:Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 22px;text-align:center;color:#0D1B2A;">'
    + '<div style="font-size:44px;">🗓️</div>'
    + '<p style="font-size:18px;line-height:1.6;">' + esc_(msg) + '</p>'
    + '<p style="color:#888;font-size:13px;">Ya puedes cerrar esta pestaña.</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('CAPSICOV — Reservas');
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
