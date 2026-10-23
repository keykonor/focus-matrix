// Shared by public-source validation and source snapshots. .gitignore alone does
// not protect a runtime file that has already been added to the Git index.
const privatePath = /(^|\/)(?:\.env(?:$|\.(?!example$))|\.dev\.vars|\.cloud-config|signing\/|backups\/|outputs\/|\.cloud-tools\/|\.edgeone\/)|\.(?:jks|keystore|p12|pfx|dpapi|pem|key|sqlite3?|db|dmp)$|^cloudbase\/cloudbaserc\.json$/i;
const runtimeFile = /(^|\/)(?:focus-matrix(?:\.corrupt-[^/]*)?\.json|\.focus-matrix[^/]*\.json|\.window-state\.json|\.update-[^/]*\.json|[^/]*\.pending-write[^/]*)$/i;

export function isPrivateSourcePath(path) {
  const normalized = path.replaceAll('\\', '/');
  return privatePath.test(normalized) || runtimeFile.test(normalized);
}
