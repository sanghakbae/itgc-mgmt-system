var SPREADSHEET_ID = "1VUJNrNhQQdCTSv--6hZEcTpQdlaqhstdhHipM1msePY";
var DRIVE_FOLDER_ID = "1xq6ecVXXcK4ujxDIiOVGsAyf-abwF9h3";
var MASTER_SHEET = "control_master";
var EXECUTION_SHEET = "control_execution";
var EVIDENCE_SHEET = "evidence_files";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "getWorkspace";

  if (action === "getWorkspace") {
    return jsonOutput({
      workspace: buildWorkspace_(),
    });
  }

  if (action === "healthCheck") {
    return jsonOutput(healthCheck_());
  }

  return jsonOutput({
    ok: false,
    message: "unsupported_action",
  });
}

function doPost(e) {
  var payload = parseJsonBody_(e);
  var action = payload.action || "syncWorkspace";

  if (action === "syncWorkspace") {
    syncWorkspace_(payload.workspace || {});
    return jsonOutput({ ok: true });
  }

  if (action === "uploadEvidence") {
    return jsonOutput({
      ok: true,
      files: uploadEvidenceFiles_(payload.controlId, payload.files || []),
    });
  }

  return jsonOutput({
    ok: false,
    message: "unsupported_action",
  });
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  return JSON.parse(e.postData.contents);
}

function getSheet_(name) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  return sheet;
}

function healthCheck_() {
  var spreadsheetOk = false;
  var driveOk = false;

  try {
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    spreadsheet.getName();
    spreadsheetOk = true;
  } catch (error) {
    spreadsheetOk = false;
  }

  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    folder.getName();
    driveOk = true;
  } catch (error) {
    driveOk = false;
  }

  return {
    ok: spreadsheetOk && driveOk,
    spreadsheet: spreadsheetOk,
    drive: driveOk,
    checkedAt: new Date().toISOString(),
  };
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var same = headers.every(function(header, index) {
    return currentHeaders[index] === header;
  });

  if (!same) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function rowsToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  var headers = values[0];
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ""; });
  }).map(function(row) {
    var item = {};
    headers.forEach(function(header, index) {
      item[header] = row[index];
    });
    return item;
  });
}

function writeObjects_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!rows.length) {
    return;
  }

  var values = rows.map(function(row) {
    return headers.map(function(header) {
      return row[header] == null ? "" : row[header];
    });
  });

  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function buildWorkspace_() {
  var masterRows = rowsToObjects_(getSheet_(MASTER_SHEET));
  var executionRows = rowsToObjects_(getSheet_(EXECUTION_SHEET));
  var evidenceRows = rowsToObjects_(getSheet_(EVIDENCE_SHEET));

  var executionMap = {};
  executionRows.forEach(function(row) {
    executionMap[row.control_id] = row;
  });

  var evidenceMap = {};
  evidenceRows.forEach(function(row) {
    if (!evidenceMap[row.control_id]) {
      evidenceMap[row.control_id] = [];
    }

    evidenceMap[row.control_id].push({
      name: row.file_name || "",
      url: row.drive_url || "",
      driveFileId: row.drive_file_id || "",
      uploadedAt: row.uploaded_at || "",
      uploadedBy: row.uploaded_by || "",
      note: row.file_note || "",
    });
  });

  var controls = masterRows.map(function(row) {
    var execution = executionMap[row.control_id] || {};
    return {
      id: row.control_id,
      process: row.category,
      subProcess: row.sub_process || row.category,
      title: row.control_name,
      riskName: row.risk_name || "",
      controlObjective: row.control_objective || "",
      controlActivity: row.control_activity || "",
      description: row.control_description || "",
      keyControl: row.key_control,
      frequency: row.frequency,
      controlType: row.control_type,
      automationLevel: row.automation_level || "",
      status: row.status || execution.status || "점검 예정",
      evidenceStatus: row.evidence_status || "미수집",
      performer: row.perform_dept,
      reviewer: row.review_dept,
      performDept: row.perform_dept,
      reviewDept: row.review_dept,
      ownerPerson: row.owner_person || row.review_dept || "",
      targetSystems: splitSystems_(row.target_systems),
      purpose: row.control_objective || row.control_description || "",
      evidenceText: row.evidence_text || "",
      testMethod: row.test_method || "",
      policyReference: row.policy_reference || "",
      deficiencyImpact: row.deficiency_impact || "",
      executionNote: execution.execution_note || "",
      reviewChecked: execution.review_checked || row.review_checked || "미검토",
      note: execution.review_note || "",
      evidenceFiles: evidenceMap[row.control_id] || [],
    };
  });

  return {
    controls: controls,
    workflows: [],
    people: [],
  };
}

function syncWorkspace_(workspace) {
  var controls = workspace.controls || [];
  var masterHeaders = [
    "control_id",
    "category",
    "sub_process",
    "risk_name",
    "control_name",
    "control_objective",
    "control_activity",
    "key_control",
    "frequency",
    "control_type",
    "automation_level",
    "perform_dept",
    "review_dept",
    "owner_person",
    "target_systems",
    "evidence_text",
    "test_method",
    "policy_reference",
    "deficiency_impact",
    "status",
    "evidence_status",
    "review_checked",
    "control_description",
    "active_yn",
    "sort_order"
  ];
  var executionHeaders = [
    "execution_id",
    "control_id",
    "execution_date",
    "execution_note",
    "status",
    "review_checked",
    "review_date",
    "review_note",
    "performed_by",
    "reviewed_by",
    "drive_folder_id",
    "last_updated_at"
  ];
  var evidenceHeaders = [
    "evidence_id",
    "execution_id",
    "control_id",
    "file_name",
    "drive_file_id",
    "drive_url",
    "uploaded_at",
    "uploaded_by",
    "file_note"
  ];

  var masterRows = controls.map(function(control, index) {
    return {
      control_id: control.id,
      category: control.process,
      sub_process: control.subProcess || control.process || "",
      risk_name: control.riskName || "",
      control_name: control.title,
      control_objective: control.controlObjective || control.purpose || "",
      control_activity: control.controlActivity || "",
      key_control: control.keyControl,
      frequency: control.frequency,
      control_type: control.controlType,
      automation_level: control.automationLevel || "",
      perform_dept: control.performDept || control.performer || "",
      review_dept: control.reviewDept || control.reviewer || "",
      owner_person: control.ownerPerson || control.reviewDept || control.reviewer || "",
      target_systems: joinSystems_(control.targetSystems),
      evidence_text: control.evidenceText || "",
      test_method: control.testMethod || "",
      policy_reference: control.policyReference || "",
      deficiency_impact: control.deficiencyImpact || "",
      status: control.status || "점검 예정",
      evidence_status: control.evidenceStatus || "미수집",
      review_checked: control.reviewChecked || "미검토",
      control_description: control.description || control.population || control.purpose || "",
      active_yn: "Y",
      sort_order: index + 1
    };
  });

  var executionRows = controls.map(function(control) {
    return {
      execution_id: "EXE-" + control.id,
      control_id: control.id,
      execution_date: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd"),
      execution_note: control.executionNote || "",
      status: control.status || "점검 예정",
      review_checked: control.reviewChecked || "미검토",
      review_date: "",
      review_note: control.note || "",
      performed_by: control.performDept || control.performer || "",
      reviewed_by: control.reviewDept || control.reviewer || "",
      drive_folder_id: DRIVE_FOLDER_ID,
      last_updated_at: new Date().toISOString()
    };
  });

  var evidenceRows = [];
  controls.forEach(function(control) {
    (control.evidenceFiles || []).forEach(function(file, index) {
      evidenceRows.push({
        evidence_id: "EVD-" + control.id + "-" + (index + 1),
        execution_id: "EXE-" + control.id,
        control_id: control.id,
        file_name: file.name || "",
        drive_file_id: file.driveFileId || "",
        drive_url: file.url || "",
        uploaded_at: file.uploadedAt || "",
        uploaded_by: file.uploadedBy || "",
        file_note: file.note || ""
      });
    });
  });

  writeObjects_(getSheet_(MASTER_SHEET), masterHeaders, masterRows);
  writeObjects_(getSheet_(EXECUTION_SHEET), executionHeaders, executionRows);
  writeObjects_(getSheet_(EVIDENCE_SHEET), evidenceHeaders, evidenceRows);
}

function uploadEvidenceFiles_(controlId, files) {
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  return files.map(function(file, index) {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(file.base64),
      file.mimeType,
      file.name
    );
    var created = folder.createFile(blob);
    return {
      name: file.name,
      url: created.getUrl(),
      driveFileId: created.getId(),
      uploadedAt: new Date().toISOString(),
      uploadedBy: "",
      note: "",
      sort: index + 1
    };
  });
}

function splitSystems_(value) {
  if (!value) {
    return [];
  }

  return String(value).split("|").filter(String);
}

function joinSystems_(items) {
  return (items || []).join("|");
}
