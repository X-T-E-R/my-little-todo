const GITHUB_REPO = 'X-T-E-R/my-little-todo';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string;
  htmlUrl: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function checkGitHubUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

  const release: GitHubRelease = await res.json();
  const remoteVersion = release.tag_name.replace(/^v/, '');

  if (compareVersions(remoteVersion, currentVersion) <= 0) return null;

  const apkAsset = release.assets.find((a) => a.name.endsWith('.apk'));

  return {
    version: remoteVersion,
    notes: release.body || '',
    apkUrl: apkAsset?.browser_download_url ?? '',
    htmlUrl: release.html_url,
  };
}
