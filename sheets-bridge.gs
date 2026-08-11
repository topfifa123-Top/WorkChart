/**
 * GateFlow ↔ Google Sheets bridge — with email + Calendar notifications
 * ----------------------------------------------------------------------
 * SETUP (same as before):
 * 1. Open the Google Sheet you want as your database.
 * 2. Extensions > Apps Script.
 * 3. Delete everything, paste this file in.
 * 4. Deploy > New deployment > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    First deploy will prompt you to authorize — this version needs
 *    Gmail and Calendar permission too, so approve those scopes.
 * 5. Copy the Web app URL into GateFlow Settings > Apps Script Web App URL.
 * 6. Any time you edit this file: Deploy > Manage deployments > Edit >
 *    Version: New > Deploy. The URL stays the same.
 *
 * WHAT'S NEW IN THIS VERSION:
 * - When a new testing request comes in, emails every user with role "lead".
 * - When a request is approved/rejected, emails the Sales person who requested it.
 * - When a task gets a due date + assignee, creates (or updates) an event on
 *   this account's default Google Calendar and invites the assignee.
 *
 * REQUIRES: each GateFlow user has an email set (Settings > Team members).
 * Users without an email are simply skipped — no error, no email sent.
 *
 * KNOWN LIMITATION: the very first time you turn on Google Sheets sync,
 * any requests that already existed locally will look "new" to this script
 * (since the sheet was empty before) and will trigger one round of
 * new-request emails to Technical Leaders. This only happens once, on the
 * very first sync.
 */

function doGet(e) {
  var key = e.parameter.key;
  var data = readAll_(getSheet_(key));
  return jsonOut_({ data: data });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var key = body.key;
  var newData = body.data || [];
  var sheet = getSheet_(key);
  var oldData = readAll_(sheet);

  if (key === "approvals") {
    notifyApprovalChanges_(oldData, newData);
  }
  if (key === "tasks") {
    syncTaskCalendarEvents_(oldData, newData);
  }

  writeAll_(sheet, newData);
  return jsonOut_({ ok: true });
}

/* ------------------------- Email notifications ------------------------- */

function notifyApprovalChanges_(oldData, newData) {
  var oldById = {};
  oldData.forEach(function (a) { oldById[a.id] = a; });
  var users = readAll_(getSheet_("users"));

  newData.forEach(function (a) {
    var old = oldById[a.id];

    if (!old) {
      // Brand-new request -> notify every Technical Leader
      var leadEmails = users
        .filter(function (u) { return u.role === "lead" && u.email; })
        .map(function (u) { return u.email; });
      if (leadEmails.length) {
        MailApp.sendEmail(
          leadEmails.join(","),
          "New testing request: " + a.title + " (" + a.ticket + ")",
          "A new testing request needs your review.\n\n" +
            "Ticket: " + a.ticket + "\n" +
            "Company: " + (a.project || "-") + "\n" +
            "Contact: " + (a.contactPerson || "-") + " / " + (a.contactNumber || "-") + "\n" +
            "Support type: " + (a.supportType || "-") + "\n" +
            "Requested by: " + a.requestedBy + "\n" +
            "Deadline: " + (a.dueDate || "-") + "\n\n" +
            "Open GateFlow to approve or reject this request."
        );
      }
      return;
    }

    if (old.status !== a.status && (a.status === "approved" || a.status === "rejected")) {
      // Decision made -> notify the requester
      var requester = users.filter(function (u) { return u.name === a.requestedBy && u.email; })[0];
      if (requester) {
        MailApp.sendEmail(
          requester.email,
          "Your request " + a.ticket + " was " + a.status,
          'Your testing request "' + a.title + '" (' + a.ticket + ") was " + a.status + ".\n\n" +
            (a.leadComment ? "Comment: " + a.leadComment + "\n\n" : "") +
            "Open GateFlow for details."
        );
      }
    }
  });
}

/* ----------------------------- Calendar sync ----------------------------- */

function syncTaskCalendarEvents_(oldData, newData) {
  var oldById = {};
  oldData.forEach(function (t) { oldById[t.id] = t; });
  var users = readAll_(getSheet_("users"));
  var mapSheet = getSheet_("calendar_events");
  var mappings = readAll_(mapSheet); // [{ id: taskId, eventId: "..." }]
  var mapById = {};
  mappings.forEach(function (m) { mapById[m.id] = m.eventId; });
  var mapChanged = false;

  newData.forEach(function (t) {
    if (!t.dueDate || !t.assignee) return;
    var old = oldById[t.id];
    var changed = !old || old.dueDate !== t.dueDate || old.assignee !== t.assignee || old.title !== t.title;
    if (!changed) return;

    var user = users.filter(function (u) { return u.name === t.assignee && u.email; })[0];
    var cal = CalendarApp.getDefaultCalendar();
    var start = new Date(t.dueDate + "T09:00:00");
    var end = new Date(t.dueDate + "T10:00:00");
    var title = "[GateFlow] " + t.ticket + " " + t.title;

    var existingId = mapById[t.id];
    var event = null;
    if (existingId) {
      try { event = cal.getEventById(existingId); } catch (err) { event = null; }
    }

    if (event) {
      event.setTitle(title);
      event.setTime(start, end);
    } else {
      event = cal.createEvent(title, start, end, {
        description: "GateFlow task " + t.ticket + ", assigned to " + t.assignee,
      });
      mapById[t.id] = event.getId();
      mapChanged = true;
    }

    if (user) {
      try { event.addGuest(user.email); } catch (err) { /* guest add can fail silently, non-fatal */ }
    }
  });

  if (mapChanged) {
    var updated = Object.keys(mapById).map(function (id) { return { id: id, eventId: mapById[id] }; });
    writeAll_(mapSheet, updated);
  }
}

/* ------------------------- Generic sheet storage ------------------------- */

function getSheet_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(key);
  if (!sheet) {
    sheet = ss.insertSheet(key);
    sheet.getRange(1, 1, 1, 2).setValues([["id", "json"]]);
  }
  return sheet;
}

function readAll_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][0]) {
      try { out.push(JSON.parse(values[i][0])); } catch (err) {}
    }
  }
  return out;
}

function writeAll_(sheet, data) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (data.length === 0) return;
  var rows = data.map(function (item) { return [item.id || "", JSON.stringify(item)]; });
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
