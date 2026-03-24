function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function fetchRemoteWorkspace(scriptUrl) {
  const response = await fetch(`${scriptUrl}?action=getWorkspace`);
  if (!response.ok) {
    throw new Error("workspace_fetch_failed");
  }

  const result = await response.json();
  return result.workspace ?? result;
}

export async function fetchIntegrationStatus(scriptUrl) {
  const response = await fetch(`${scriptUrl}?action=healthCheck`);
  if (!response.ok) {
    throw new Error("integration_healthcheck_failed");
  }

  return response.json();
}

export async function syncRemoteWorkspace(scriptUrl, workspace) {
  const response = await postJson(scriptUrl, {
    action: "syncWorkspace",
    workspace,
  });

  if (!response.ok) {
    throw new Error("workspace_sync_failed");
  }

  return response.json();
}

export async function uploadEvidenceToDrive(scriptUrl, controlId, files) {
  const encodedFiles = await Promise.all(files.map(fileToBase64));
  const response = await postJson(scriptUrl, {
    action: "uploadEvidence",
    controlId,
    files: encodedFiles,
  });

  if (!response.ok) {
    throw new Error("evidence_upload_failed");
  }

  return response.json();
}
