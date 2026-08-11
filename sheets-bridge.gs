/**
 * GateFlow ↔ Google Sheets bridge
 * -------------------------------
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. เปิด Google Sheet ที่จะใช้เป็นฐานข้อมูล (สร้างชีทใหม่ก็ได้)
 * 2. เมนู Extensions > Apps Script
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางไฟล์นี้ทับ
 * 4. กด Deploy > New deployment > เลือกประเภท "Web app"
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. คัดลอก "Web app URL" ที่ได้ ไปวางในหน้า ตั้งค่า ของ GateFlow แล้วกด "ทดสอบการเชื่อมต่อ"
 * 6. ทุกครั้งที่แก้โค้ดนี้ ต้อง Deploy > Manage deployments > แก้ไข (Edit) > Version: New > Deploy ใหม่
 *
 * สคริปต์นี้จะสร้างชีทย่อยให้อัตโนมัติ (users, tasks, approvals) และเก็บข้อมูลเป็น JSON ต่อแถว
 */

function doGet(e) {
  var key = e.parameter.key;
  var sheet = getSheet_(key);
  var data = readAll_(sheet);
  return jsonOut_({ data: data });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var key = body.key;
  var data = body.data || [];
  var sheet = getSheet_(key);
  writeAll_(sheet, data);
  return jsonOut_({ ok: true });
}

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
